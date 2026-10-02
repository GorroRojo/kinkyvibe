/**
 * Mi rincón → Lo que sigo: con un interruptor apagado (`lo_que_sigo` o `cuentas`) todo da 404;
 * sin sesión lleva a /ingresar (y de vuelta a la página del botón «Seguir», solo si es de este
 * sitio); con sesión, seguir, cambiar opciones, dejar de seguir y el CSV, siempre solo lo de esa
 * cuenta. D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeAccount, makeProfile } from '$lib/server/amigues/testing.js';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';

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
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** @param {{ sigo?: string, cuentas?: string }} [flags] */
async function modules({ sigo = '1', cuentas = '1' } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { LO_QUE_SIGO_ENABLED: sigo, CUENTAS_ENABLED: cuentas, ETIQUETAS_DB_ENABLED: '0' }
	}));
	return {
		page: await import('./+page.server.js'),
		csv: await import('./sigo.csv/+server.js'),
		rincon: await import('../+page.server.js')
	};
}

/** @param {Parameters<typeof fakeRequestEvent>[0] extends infer O ? Omit<O, 'platform'> : never} o */
const ev = (o) => fakeRequestEvent({ platform: t.platform, path: '/mi-rincon/sigo', ...o });

describe('interruptores', () => {
	for (const flags of [{ sigo: '0' }, { cuentas: '0' }]) {
		it(`apagado (${JSON.stringify(flags)}): 404 en la página, las acciones y el CSV`, async () => {
			const m = await modules(flags);
			const member = await makeAccount(t.db, 'apagado');
			const notFound = { status: 404 };
			expect(await thrown(() => m.page.load(ev({ member })))).toMatchObject(notFound);
			expect(
				await thrown(() =>
					m.page.actions.seguir(ev({ member, form: { tipo: 'etiqueta', clave: 'shibari' } }))
				)
			).toMatchObject(notFound);
			expect(await thrown(() => m.csv.GET(ev({ member })))).toMatchObject(notFound);
			const { results } = await t.db.prepare('SELECT * FROM follows').all();
			expect(results).toEqual([]);
		});
	}

	it('Mi rincón muestra el link solo con los dos prendidos', async () => {
		const member = await makeAccount(t.db, 'link');
		let m = await modules({ sigo: '0' });
		expect(
			/** @type {any} */ (await m.rincon.load(ev({ path: '/mi-rincon', member }))).sigoOn
		).toBe(false);
		m = await modules();
		expect(
			/** @type {any} */ (await m.rincon.load(ev({ path: '/mi-rincon', member }))).sigoOn
		).toBe(true);
	});
});

describe('sin sesión', () => {
	it('la página lleva a /ingresar', async () => {
		const m = await modules();
		expect(await thrown(() => m.page.load(ev({})))).toMatchObject({
			status: 303,
			location: '/ingresar?next=%2Fmi-rincon%2Fsigo'
		});
	});
	it('«Seguir» lleva a /ingresar y vuelve a la página del botón (solo de este sitio)', async () => {
		const m = await modules();
		const form = { tipo: 'etiqueta', clave: 'shibari', volver: '/wiki/shibari' };
		expect(await thrown(() => m.page.actions.seguir(ev({ form })))).toMatchObject({
			status: 303,
			location: '/ingresar?next=%2Fwiki%2Fshibari'
		});
		const evil = { ...form, volver: 'https://example.com/robar' };
		expect(await thrown(() => m.page.actions.seguir(ev({ form: evil })))).toMatchObject({
			status: 303,
			location: '/ingresar?next=%2Fmi-rincon%2Fsigo'
		});
	});
});

describe('con sesión', () => {
	it('seguir una etiqueta (por alias), cambiar opciones, el CSV y dejar de seguir', async () => {
		const m = await modules();
		const member = await makeAccount(t.db, 'con-sesion');
		const r = /** @type {any} */ (
			await m.page.actions.seguir(ev({ member, form: { tipo: 'etiqueta', clave: 'Shibari' } }))
		);
		expect(r).toMatchObject({ ok: true, kind: 'etiqueta', key: 'shibari' });

		let data = /** @type {any} */ (await m.page.load(ev({ member })));
		expect(data.follows).toHaveLength(1);
		expect(data.follows[0]).toMatchObject({
			key: 'shibari',
			href: '/wiki/shibari',
			options: { calendario: true, mail_nuevo: true, recordatorio: false }
		});

		await m.page.actions.opciones(
			ev({ member, form: { tipo: 'etiqueta', clave: 'shibari', recordatorio: 'on' } })
		);
		data = await m.page.load(ev({ member }));
		expect(data.follows[0].options).toEqual({
			calendario: false,
			mail_nuevo: false,
			recordatorio: true
		});

		const res = await m.csv.GET(ev({ path: '/mi-rincon/sigo/sigo.csv', member }));
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		const text = await res.text();
		expect(text).toContain('Etiqueta');
		expect(text).toContain('https://kinkyvibe.ar/wiki/shibari');

		await m.page.actions.dejar(ev({ member, form: { tipo: 'etiqueta', clave: 'shibari' } }));
		data = await m.page.load(ev({ member }));
		expect(data.follows).toEqual([]);
	});

	it('no sigue etiquetas que no existen ni perfiles que no puede ver', async () => {
		const m = await modules();
		const member = await makeAccount(t.db, 'no-puede');
		const hidden = await makeProfile(t.db, { title: 'Oculto Inventado', visibility: 'hidden' });
		for (const form of [
			{ tipo: 'etiqueta', clave: 'esta-etiqueta-no-existe' },
			{ tipo: 'perfil', clave: String(hidden.id) },
			{ tipo: 'cuenta', clave: member.id }
		]) {
			const r = /** @type {any} */ (await m.page.actions.seguir(ev({ member, form })));
			expect(r.status).toBe(404);
		}
		const { results } = await t.db.prepare('SELECT * FROM follows').all();
		expect(results).toEqual([]);
	});

	it('sigue un lugar visible; otra cuenta no ve nada de eso', async () => {
		const m = await modules();
		const a = await makeAccount(t.db, 'sigue-lugar');
		const b = await makeAccount(t.db, 'otra-cuenta');
		const venue = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const r = /** @type {any} */ (
			await m.page.actions.seguir(
				ev({ member: a, form: { tipo: 'perfil', clave: String(venue.id) } })
			)
		);
		expect(r).toMatchObject({ ok: true, title: 'Lugar Inventado' });
		const mine = /** @type {any} */ (await m.page.load(ev({ member: a })));
		expect(mine.follows[0]).toMatchObject({ label: 'Lugar', title: 'Lugar Inventado' });
		const theirs = /** @type {any} */ (await m.page.load(ev({ member: b })));
		expect(theirs.follows).toEqual([]);
		const csv = await (await m.csv.GET(ev({ member: b }))).text();
		expect(csv).not.toContain('Lugar Inventado');
	});
});
