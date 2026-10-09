/**
 * POST /mi-rincon/geocodificar («Buscar en el mapa» del lugar de una cuenta): cuenta con sesión
 * que gestiona un lugar, los mismos mensajes que el del panel y el límite por cuenta. D1 de
 * miniflare, datos inventados y `fetch` de mentira: nunca se llama a Nominatim de verdad.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { createProfile } from '$lib/server/cuentas/perfiles.js';
import { clearGeocodeCache } from '$lib/server/geocode/nominatim.js';
import { ACCOUNT_GEOCODE_RATE_LIMIT } from '$lib/server/geocode/web.js';
import { POST } from './+server.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
	clearGeocodeCache();
});

const FAKE = [{ lat: '-34.6', lon: '-58.4', display_name: 'Calle Inventada 123, Argentina' }];

/**
 * Una cuenta con sesión y el permiso de perfiles; `kind` le crea un perfil de ese tipo.
 * @param {string} name
 * @param {{ kind?: 'lugar' | 'persona' | null }} [o]
 */
async function member(name, { kind = 'lugar' } = {}) {
	const a = await upsertVerifiedAccount(t.db, `${name}@example.com`);
	await t.db.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1').bind(a.id).run();
	if (kind) {
		const r = await createProfile(t.db, a.id, { kind, title: `Perfil Inventado ${name}` });
		expect(r.ok).toBe(true);
	}
	return { id: a.id, email: a.email };
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ member?: { id: string, email: string } | null, fetch?: any }} [o]
 */
function call(body, o = {}) {
	const url = new URL('http://localhost/mi-rincon/geocodificar');
	const request = new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const locals = { user: undefined, user_token: '', member: o.member ?? undefined };
	const fetch = o.fetch ?? vi.fn(async () => new Response(JSON.stringify(FAKE)));
	return POST(/** @type {any} */ ({ url, request, locals, platform: t.platform, fetch }));
}

describe('/mi-rincon/geocodificar', () => {
	it('sin sesión: 401 con mensaje y no busca nada', async () => {
		const fetch = vi.fn();
		const res = await call({ address: 'Calle Inventada 123' }, { member: null, fetch });
		expect(res.status).toBe(401);
		expect((await res.json()).error).toMatch(/Volvé a ingresar/);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('una cuenta sin perfiles: 403 y no busca nada', async () => {
		const me = await member('sin-perfil', { kind: null });
		const fetch = vi.fn();
		const res = await call({ address: 'Calle Inventada 123' }, { member: me, fetch });
		expect(res.status).toBe(403);
		expect((await res.json()).error).toMatch(/gestionan un lugar/);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('una cuenta que gestiona solo una persona (ningún lugar): 403', async () => {
		const me = await member('solo-persona', { kind: 'persona' });
		const fetch = vi.fn();
		const res = await call({ address: 'Calle Inventada 123' }, { member: me, fetch });
		expect(res.status).toBe(403);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('una cuenta sin el permiso de perfiles (aunque haya tenido un lugar): 403', async () => {
		const me = await member('sin-permiso');
		await t.db.prepare('UPDATE accounts SET can_have_profiles = 0 WHERE id = ?1').bind(me.id).run();
		const res = await call({ address: 'Calle Inventada 123' }, { member: me, fetch: vi.fn() });
		expect(res.status).toBe(403);
	});

	it('una cuenta que gestiona un lugar recibe los resultados', async () => {
		const me = await member('con-lugar');
		const fetch = vi.fn(async () => new Response(JSON.stringify(FAKE)));
		const res = await call(
			{ address: 'Calle Inventada 123', area: 'Barrio Falso', city: 'CABA' },
			{ member: me, fetch }
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toContain('no-store');
		expect(await res.json()).toEqual({
			results: [{ lat: -34.6, lng: -58.4, label: 'Calle Inventada 123, Argentina' }]
		});
		expect(fetch).toHaveBeenCalledTimes(1);
		const [[nominatimUrl]] = /** @type {unknown[][]} */ (fetch.mock.calls);
		expect(String(nominatimUrl)).toContain('nominatim.openstreetmap.org');
	});

	it('sin resultados, el mismo mensaje que en el panel', async () => {
		const me = await member('sin-resultados');
		const fetch = vi.fn(async () => new Response('[]'));
		const res = await call({ address: 'Calle Que No Existe 999' }, { member: me, fetch });
		expect(await res.json()).toEqual({
			results: [],
			error: 'No encontramos esa dirección. Probá agregando la ciudad o el barrio.'
		});
	});

	it('sin dirección: 400 y no gasta búsquedas de la cuenta', async () => {
		const me = await member('sin-direccion');
		for (let i = 0; i < ACCOUNT_GEOCODE_RATE_LIMIT.limit + 2; i++) {
			const res = await call({ address: '  ' }, { member: me });
			expect(res.status).toBe(400);
			expect((await res.json()).error).toBe('Escribí la dirección primero.');
		}
		// La cuenta sigue pudiendo buscar.
		expect((await call({ address: 'Calle Inventada 123' }, { member: me })).status).toBe(200);
	});

	it('límite por cuenta: después de 10 búsquedas, 429 con su mensaje; otra cuenta sigue', async () => {
		const me = await member('muchas-busquedas');
		const fetch = vi.fn(async () => new Response(JSON.stringify(FAKE)));
		// La hora, quieta en la mitad de una ventana de 10 minutos (así el test no cae en el borde).
		const windowMs = ACCOUNT_GEOCODE_RATE_LIMIT.windowSeconds * 1000;
		const now = Math.floor(Date.now() / windowMs) * windowMs + windowMs / 2;
		const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
		onTestFinished(() => clock.mockRestore());
		// La misma dirección: sale de la memoria, así el límite de todo el sitio no se mete.
		for (let i = 0; i < ACCOUNT_GEOCODE_RATE_LIMIT.limit; i++) {
			const res = await call({ address: 'Calle Inventada 123' }, { member: me, fetch });
			expect(res.status).toBe(200);
		}
		const res = await call({ address: 'Calle Inventada 123' }, { member: me, fetch });
		expect(res.status).toBe(429);
		expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
		expect((await res.json()).error).toMatch(/Hiciste muchas búsquedas seguidas/);
		// Nominatim se llamó una sola vez (lo demás salió de la memoria).
		expect(fetch).toHaveBeenCalledTimes(1);

		const other = await member('otra-cuenta');
		expect((await call({ address: 'Calle Inventada 123' }, { member: other })).status).toBe(200);
	});

	it('el bucket por cuenta no lleva el id de la cuenta en claro', async () => {
		const me = await member('bucket-anonimo');
		await call({ address: 'Calle Inventada 123' }, { member: me });
		const { results } = await t.db.prepare('SELECT bucket FROM rate_limits').all();
		const buckets = results.map((r) => String(r.bucket));
		expect(buckets.some((b) => b.startsWith('nominatim:a:'))).toBe(true);
		expect(buckets.some((b) => b.includes(me.id))).toBe(false);
	});

	it('dos búsquedas distintas seguidas: la segunda espera el segundo del sitio (429)', async () => {
		const me = await member('dos-seguidas');
		expect((await call({ address: 'Calle Inventada 123' }, { member: me })).status).toBe(200);
		const res = await call({ address: 'Calle Falsa 456' }, { member: me });
		// Si justo cambió el segundo entre las dos llamadas, la segunda pasa: se reintenta una vez.
		const second =
			res.status === 200 ? await call({ address: 'Calle Falsa 789' }, { member: me }) : res;
		expect(second.status).toBe(429);
		expect((await second.json()).error).toMatch(/Esperá un segundo/);
	});

	it('si Nominatim falla, 503 con mensaje', async () => {
		const me = await member('nominatim-falla');
		const fetch = vi.fn(async () => new Response('oops', { status: 500 }));
		const res = await call({ address: 'Calle Inventada 123' }, { member: me, fetch });
		expect(res.status).toBe(503);
		expect((await res.json()).error).toMatch(/No pudimos buscar/);
	});
});
