/**
 * Contenido → En la base: solo admins; el estado (cuántos coinciden, qué revisar), la importación
 * de a tandas, el registro en Actividad y el CSV, para eventos y material. D1 de miniflare; los .md
 * son los inventados de src/lib/server/contenido/fixtures (datos falsos).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const fixtures = vi.hoisted(() => ({ files: /** @type {Record<string, any[]>} */ ({}) }));
vi.mock('$lib/server/contenido/bundle.js', () => ({
	bundledSourceFiles: async (/** @type {string} */ category) =>
		structuredClone(fixtures.files[category] ?? [])
}));

const metas = /** @type {Record<string, Record<string, any> | undefined>} */ (
	import.meta.glob('/src/lib/server/contenido/fixtures/*/*.md', {
		import: 'metadata',
		eager: true
	})
);
const raws = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/server/contenido/fixtures/*/*.md', {
		query: '?raw',
		import: 'default',
		eager: true
	})
);
for (const path of Object.keys(raws).sort()) {
	const [category, file] = path.split('/').slice(-2);
	(fixtures.files[category] ??= []).push({
		legacySlug: file.replace(/\.md$/, ''),
		raw: raws[path],
		meta: metas[path] ?? null
	});
}

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
		csv: await import('./importacion.csv/+server.js')
	};
}

/** @param {{ form?: Record<string, string>, user?: any, token?: string | null }} [o] */
function fakeEvent({ form, user, token } = {}) {
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
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		})
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
	it('sin sesión, al login; sin permiso, 403; no se escribe nada', async () => {
		const m = await modules();
		for (const call of [
			() => m.page.load(fakeEvent({ user: null, token: null })),
			() => m.page.actions.importar(fakeEvent({ form: {}, user: null, token: null })),
			() => m.csv.GET(fakeEvent({ user: null, token: null }))
		]) {
			expect((await thrown(call))?.status).toBe(303);
		}
		const intruder = { id: 1, login: 'no-es-admin' };
		expect(
			(await thrown(() => m.page.actions.importar(fakeEvent({ form: {}, user: intruder }))))?.status
		).toBe(403);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM objects').first())?.n).toBe(0);
	});
});

describe('importar desde el panel', () => {
	it('muestra qué haría, importa, queda en Actividad y después todo coincide', async () => {
		const m = await modules();
		const before = /** @type {any} */ (await m.page.load(fakeEvent()));
		expect(before.categories.map((/** @type {any} */ c) => c.key)).toEqual([
			'calendario',
			'material'
		]);
		expect(before.categories[0].status).toMatchObject({
			files: 8,
			imported: 0,
			pending: 7,
			problems: 1
		});

		const r = /** @type {any} */ (
			await m.page.actions.importar(fakeEvent({ form: { categoria: 'calendario' } }))
		);
		expect(r.importResult).toMatchObject({ remaining: 0, summary: { created: 7, error: 0 } });
		const audit = await t.db
			.prepare("SELECT summary FROM admin_audit WHERE action = 'contenido.import'")
			.all();
		expect(audit.results).toHaveLength(1);

		const after = /** @type {any} */ (await m.page.load(fakeEvent()));
		expect(after.categories[0].status).toMatchObject({
			imported: 7,
			same: 7,
			pending: 0,
			drift: 0,
			problems: 1
		});
		// Para revisar: el roto (no se puede leer) y los que tienen avisos (fin al día siguiente). El
		// HTML libre es solo una nota: se ve igual que hoy.
		expect(after.categories[0].rows.map((/** @type {any} */ r) => r.legacySlug)).toEqual([
			'fiesta-inventada-2031-01',
			'roto-2031-06'
		]);

		const csv = await (await m.csv.GET(fakeEvent())).text();
		expect(csv).toContain('fiesta-inventada-2031-01');
		expect(csv).toContain('sin cambios');
	});

	it('lo que hay para revisar queda guardado para «Para revisar» del panel (Inicio y menú)', async () => {
		const m = await modules();
		const snapshot = async () =>
			/** @type {any} */ (
				await t.db
					.prepare(
						"SELECT count, detail, computed_by FROM review_snapshots WHERE source = 'importacion'"
					)
					.first()
			);
		expect(await snapshot()).toBeNull();
		const before = /** @type {any} */ (await m.page.load(fakeEvent()));
		const rowsOf = (/** @type {any} */ data) =>
			data.categories.map((/** @type {any} */ c) => [c.key, c.rows.length]);
		expect(await snapshot()).toEqual({
			count: before.categories.reduce(
				(/** @type {number} */ n, /** @type {any} */ c) => n + c.rows.length,
				0
			),
			detail: JSON.stringify(Object.fromEntries(rowsOf(before))),
			computed_by: admin.login
		});
		// Después de importar, la página se vuelve a cargar y lo guardado se actualiza.
		await m.page.actions.importar(fakeEvent({ form: { categoria: 'calendario' } }));
		const after = /** @type {any} */ (await m.page.load(fakeEvent()));
		expect((await snapshot())?.detail).toBe(JSON.stringify(Object.fromEntries(rowsOf(after))));
		expect(Object.fromEntries(rowsOf(after)).calendario).toBe(2);
	});

	it('«Descargar todo»: los .md de la base en un .tar (sin los borrados), solo admins', async () => {
		const m = await modules();
		await m.page.actions.importar(fakeEvent({ form: { categoria: 'calendario' } }));
		await m.page.actions.importar(fakeEvent({ form: { categoria: 'material' } }));
		const download = await import('./descargar.tar/+server.js');
		expect((await thrown(() => download.GET(fakeEvent({ user: null, token: null }))))?.status).toBe(
			303
		);
		const res = await download.GET(fakeEvent());
		expect(res.headers.get('content-type')).toBe('application/x-tar');
		const text = new TextDecoder().decode(await res.arrayBuffer());
		expect(text).toContain('calendario/fiesta-inventada-2031-01.md');
		expect(text).toContain('calendario/Encuentro-Pasado-BDSM-2025-05.md');
		expect(text).toContain('material/guia-inventada-de-nudos.md');
		expect(text).toContain('title: Fiesta Inventada de Prueba');
		expect(text).toContain('force_unpublished: true'); // la oculta va, marcada
	});

	it('material: el que usa un componente sin registrar no se importa', async () => {
		const m = await modules();
		const r = /** @type {any} */ (
			await m.page.actions.importar(fakeEvent({ form: { categoria: 'material' } }))
		);
		expect(r.importResult.summary).toMatchObject({ created: 1 });
		const after = /** @type {any} */ (await m.page.load(fakeEvent()));
		const material = after.categories[1];
		expect(material.status).toMatchObject({ files: 2, imported: 1, same: 1, problems: 1 });
		expect(
			material.rows.find((/** @type {any} */ x) => x.legacySlug === 'mapa-interactivo-inventado')
				?.message
		).toMatch(/componente/);
		expect(
			(await m.page.actions.importar(fakeEvent({ form: { categoria: 'wiki' } })))?.status
		).toBe(400);
	});
});
