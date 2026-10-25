/**
 * GET /api/sigo (botón «Seguir»): 404 con `lo_que_sigo` apagado o si no hay nada que seguir;
 * sin sesión solo `{ member: false }`; con sesión, si **esta** cuenta lo sigue (nunca de otra).
 * D1 de miniflare; datos inventados.
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

/** @param {{ sigo?: string }} [flags] */
async function modules({ sigo = '1' } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { LO_QUE_SIGO_ENABLED: sigo }
	}));
	return {
		api: await import('./+server.js'),
		page: await import('../../(content)/mi-rincon/sigo/+page.server.js'),
		perfil: await import('../../(content)/amigues/[profile]/+page.server.js')
	};
}

/**
 * @param {string} tipo
 * @param {string} clave
 * @param {any} [member]
 */
const get = (tipo, clave, member) =>
	fakeRequestEvent({
		platform: t.platform,
		path: `/api/sigo?${new URLSearchParams({ tipo, clave })}`,
		member
	});

describe('GET /api/sigo', () => {
	for (const flags of [{ sigo: '0' }]) {
		it(`apagado (${JSON.stringify(flags)}): 404`, async () => {
			const m = await modules(flags);
			const member = await makeAccount(t.db, 'apagado');
			expect(await thrown(() => m.api.GET(get('etiqueta', 'shibari', member)))).toMatchObject({
				status: 404
			});
		});
	}

	it('sin sesión: member false, y 404 si la etiqueta no existe', async () => {
		const m = await modules();
		const r = await m.api.GET(get('etiqueta', 'shibari'));
		expect(await r.json()).toEqual({ member: false });
		expect(r.headers.get('cache-control')).toContain('no-store');
		expect(await thrown(() => m.api.GET(get('etiqueta', 'no-existe-inventada')))).toMatchObject({
			status: 404
		});
		expect(await thrown(() => m.api.GET(get('cuenta', 'x')))).toMatchObject({ status: 404 });
	});

	it('sin sesión, un perfil: member false (el botón «Seguir» lleva a /ingresar, como en la wiki)', async () => {
		const m = await modules();
		const r = await m.api.GET(get('perfil', '12345'));
		expect(await r.json()).toEqual({ member: false });
	});

	it('con sesión: si esta cuenta lo sigue, con la clave canónica', async () => {
		const m = await modules();
		const a = await makeAccount(t.db, 'api-a');
		const b = await makeAccount(t.db, 'api-b');
		expect(await (await m.api.GET(get('etiqueta', 'Shibari', a))).json()).toEqual({
			member: true,
			kind: 'etiqueta',
			key: 'shibari',
			following: false
		});
		await m.page.actions.seguir(
			fakeRequestEvent({
				platform: t.platform,
				path: '/mi-rincon/sigo',
				member: a,
				form: { tipo: 'etiqueta', clave: 'shibari' }
			})
		);
		expect((await (await m.api.GET(get('etiqueta', 'shibari', a))).json()).following).toBe(true);
		expect((await (await m.api.GET(get('etiqueta', 'shibari', b))).json()).following).toBe(false);
	});

	it('perfiles: 404 si la cuenta no lo puede ver', async () => {
		const m = await modules();
		const a = await makeAccount(t.db, 'api-perfil');
		const hidden = await makeProfile(t.db, { title: 'Oculto Inventado', visibility: 'hidden' });
		const venue = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		expect(await thrown(() => m.api.GET(get('perfil', String(hidden.id), a)))).toMatchObject({
			status: 404
		});
		expect(await (await m.api.GET(get('perfil', String(venue.id), a))).json()).toMatchObject({
			member: true,
			kind: 'perfil',
			following: false
		});
	});
});

describe('la página de un perfil trae «Seguir» con la carga (lo mismo que GET /api/sigo)', () => {
	/**
	 * @param {any} m
	 * @param {string} slug
	 * @param {any} [member]
	 */
	const load = async (m, slug, member) =>
		/** @type {any} */ (
			await m.perfil.load(
				fakeRequestEvent({
					platform: t.platform,
					path: `/amigues/${slug}`,
					params: { profile: slug },
					member
				})
			)
		);

	it('sin sesión, con sesión (y si lo sigue) y apagado', async () => {
		const m = await modules();
		const a = await makeAccount(t.db, 'perfil-carga');
		const venue = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const slug = String(venue.slug);
		expect((await load(m, slug)).follow).toEqual({ member: false });
		const before = await load(m, slug, a);
		expect(before.follow).toEqual({
			member: true,
			kind: 'perfil',
			key: String(venue.id),
			following: false
		});
		await m.page.actions.seguir(
			fakeRequestEvent({
				platform: t.platform,
				path: '/mi-rincon/sigo',
				member: a,
				form: { tipo: 'perfil', clave: String(venue.id) }
			})
		);
		const after = await load(m, slug, a);
		expect(after.follow).toEqual(
			await (await m.api.GET(get('perfil', String(venue.id), a))).json()
		);
		expect(after.follow.following).toBe(true);

		const off = await modules({ sigo: '0' });
		expect((await load(off, slug, a)).follow).toBeNull();
	});
});
