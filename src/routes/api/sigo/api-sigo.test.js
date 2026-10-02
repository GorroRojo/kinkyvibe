/**
 * GET /api/sigo (botón «Seguir»): 404 con un interruptor apagado o si no hay nada que seguir;
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

/** @param {{ sigo?: string, cuentas?: string }} [flags] */
async function modules({ sigo = '1', cuentas = '1' } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { LO_QUE_SIGO_ENABLED: sigo, CUENTAS_ENABLED: cuentas, ETIQUETAS_DB_ENABLED: '0' }
	}));
	return {
		api: await import('./+server.js'),
		page: await import('../../(content)/mi-rincon/sigo/+page.server.js')
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
	for (const flags of [{ sigo: '0' }, { cuentas: '0' }]) {
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
