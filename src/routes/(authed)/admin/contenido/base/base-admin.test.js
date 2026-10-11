/**
 * Contenido → En la base: solo admins y «Descargar todo» (los eventos y el material de la base,
 * como .md en un .tar). Ya no hay importación (decisión 0032: no quedan .md en el repo). D1 de
 * miniflare; los datos son los .md inventados de src/lib/server/contenido/fixtures, cargados en la
 * base (datos falsos).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { runImport } from '$lib/server/contenido/importer.js';
import { fixtureFiles } from '$lib/server/contenido/testing.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

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
	vi.resetModules();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

async function modules() {
	vi.resetModules();
	return {
		page: await import('./+page.server.js'),
		download: await import('./descargar.tar/+server.js')
	};
}

/** @param {{ user?: any, token?: string | null }} [o] */
function fakeEvent({ user, token } = {}) {
	const url = new URL('/admin/contenido/base', 'https://kinkyvibe.ar');
	return /** @type {any} */ ({
		url,
		params: {},
		platform: t.platform,
		locals: {
			user: user === undefined ? admin : user,
			user_token: token === undefined ? 'token-de-prueba' : token
		},
		setHeaders: () => {},
		request: new Request(url)
	});
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

describe('solo admins', () => {
	it('sin sesión, al login; sin permiso, 403', async () => {
		const m = await modules();
		for (const call of [
			() => m.page.load(fakeEvent({ user: null, token: null })),
			() => m.download.GET(fakeEvent({ user: null, token: null }))
		]) {
			expect((await thrown(call))?.status).toBe(303);
		}
		const intruder = { id: 1, login: 'no-es-admin' };
		expect((await thrown(() => m.download.GET(fakeEvent({ user: intruder }))))?.status).toBe(403);
	});
});

describe('«Descargar todo»', () => {
	it('los .md de la base en un .tar (sin los borrados, con los ocultos marcados)', async () => {
		for (const category of ['calendario', 'material']) {
			await runImport(t.db, category, fixtureFiles(category), {
				actor: 'prueba',
				limit: 10_000
			});
		}
		const m = await modules();
		const res = await m.download.GET(fakeEvent());
		expect(res.headers.get('content-type')).toBe('application/x-tar');
		const text = new TextDecoder().decode(await res.arrayBuffer());
		expect(text).toContain('calendario/fiesta-inventada-2031-01.md');
		expect(text).toContain('calendario/Encuentro-Pasado-BDSM-2025-05.md');
		expect(text).toContain('material/guia-inventada-de-nudos.md');
		expect(text).toContain('title: Fiesta Inventada de Prueba');
		expect(text).toContain('force_unpublished: true'); // la oculta va, marcada
		const audit = await t.db
			.prepare("SELECT summary FROM admin_audit WHERE action = 'contenido.download'")
			.all();
		expect(audit.results).toHaveLength(1);
	});
});
