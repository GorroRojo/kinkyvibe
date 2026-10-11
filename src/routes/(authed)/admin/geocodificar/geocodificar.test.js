/**
 * POST /admin/geocodificar («Buscar en el mapa» del editor de lugares): solo admins, mensajes en
 * castellano y el límite de un pedido por segundo. `fetch` es de mentira: nunca se llama a
 * Nominatim de verdad.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearGeocodeCache } from '$lib/server/geocode/nominatim.js';
import { POST } from './+server.js';

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

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const FAKE = [{ lat: '-34.6', lon: '-58.4', display_name: 'Calle Inventada 123, Argentina' }];

/**
 * @param {Record<string, unknown>} body
 * @param {{ user?: any, token?: string | null, fetch?: any }} [o]
 */
function call(body, o = {}) {
	const url = new URL('http://localhost/admin/geocodificar');
	const request = new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const locals = {
		user: o.user === undefined ? admin : o.user,
		user_token: o.token === undefined ? 'token-de-prueba' : o.token
	};
	const fetch = o.fetch ?? vi.fn(async () => new Response(JSON.stringify(FAKE)));
	return POST(/** @type {any} */ ({ url, request, locals, platform: t.platform, fetch }));
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
	} catch (e) {
		return /** @type {any} */ (e);
	}
	return null;
}

describe('/admin/geocodificar', () => {
	it('sin sesión redirige al login y no busca nada', async () => {
		const fetch = vi.fn();
		const e = await thrown(() =>
			call({ address: 'Calle Inventada 123' }, { user: null, token: null, fetch })
		);
		expect(e?.status).toBe(303);
		expect(e?.location).toContain('/login');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('une usuarie que no es admin recibe 403 y no busca nada', async () => {
		const fetch = vi.fn();
		const e = await thrown(() =>
			call({ address: 'Calle Inventada 123' }, { user: { id: 1, login: 'no-admin' }, fetch })
		);
		expect(e?.status).toBe(403);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('une admin recibe los resultados', async () => {
		const res = await call({ address: 'Calle Inventada 123', city: 'CABA' });
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toContain('no-store');
		expect(await res.json()).toEqual({
			results: [{ lat: -34.6, lng: -58.4, label: 'Calle Inventada 123, Argentina' }]
		});
	});

	it('sin resultados, un mensaje amable', async () => {
		const fetch = vi.fn(async () => new Response('[]'));
		const res = await call({ address: 'Calle Que No Existe 999' }, { fetch });
		expect(await res.json()).toEqual({
			results: [],
			error: 'No encontramos esa dirección. Probá agregando la ciudad o el barrio.'
		});
	});

	it('sin dirección, 400 con mensaje', async () => {
		const res = await call({ address: '' });
		expect(res.status).toBe(400);
		expect((await res.json()).error).toMatch(/dirección/);
	});

	it('dos búsquedas distintas seguidas: la segunda espera (429)', async () => {
		expect((await call({ address: 'Calle Inventada 123' })).status).toBe(200);
		const res = await call({ address: 'Calle Falsa 456' });
		// Si justo cambió el segundo entre las dos llamadas, la segunda pasa: se reintenta una vez.
		const second = res.status === 200 ? await call({ address: 'Calle Falsa 789' }) : res;
		expect(second.status).toBe(429);
		expect(second.headers.get('retry-after')).toBeTruthy();
		expect((await second.json()).error).toMatch(/Esperá un segundo/);
	});

	it('si Nominatim falla, 503 con mensaje', async () => {
		const fetch = vi.fn(async () => new Response('oops', { status: 500 }));
		const res = await call({ address: 'Calle Inventada 123' }, { fetch });
		expect(res.status).toBe(503);
		expect((await res.json()).error).toMatch(/No pudimos buscar/);
	});
});
