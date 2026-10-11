/**
 * Etiquetas → «Guardar»: cada etiqueta se guarda al momento, de a UN cambio por vez (decisión de
 * gorrite: ya no hay lista de «cambios por guardar»). Lo de siempre sigue igual: solo admins,
 * valida contra lo que hay en la base ahora, queda en Actividad y renombrar sin alias primero
 * muestra cuántas publicaciones cambian.
 * D1 de miniflare, etiquetas y publicaciones inventadas.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { listAudit } from '$lib/server/admin/audit.js';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { loadTagRecords } from '$lib/server/etiquetas/read.js';
import { clearTagSourceCache } from '$lib/server/etiquetas/source.js';
import { saveObject } from '$lib/server/objects/save.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

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
	clearTagSourceCache();
	await importTags(t.db, { rawTags: structuredClone(RAW) }, { actor: 'admin-de-prueba' });
});
afterEach(async () => {
	(await import('$lib/server/contenido/repo.js')).setContentDB(null);
	vi.doUnmock('$lib/server/eventos');
	vi.resetModules();
});

const RAW = [
	{ id: 'root', children: ['Categoría Inventada'] },
	{ id: 'Categoría Inventada', children: ['Etiqueta de Prueba', 'Otra de Prueba'] },
	{ id: 'Etiqueta de Prueba' },
	{ id: 'Otra de Prueba' }
];

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/** La página con el contenido en la base (como en producción) y un repo que no escribe nada. */
async function page() {
	vi.resetModules();
	/** @type {any[]} */
	const commits = [];
	vi.doMock('$lib/server/eventos', async (importOriginal) => {
		const { withContentDb } = await import('$lib/server/contenido/repo.js');
		return {
			.../** @type {any} */ (await importOriginal()),
			getRepoClient: async () =>
				withContentDb({
					getFile: async () => null,
					getDirTexts: async () => [],
					commitFiles: async (/** @type {string} */ _token, /** @type {any} */ c) => {
						commits.push(c);
						return { url: 'https://example.com/commit/prueba' };
					}
				})
		};
	});
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	return { mod: await import('./+page.server.js'), commits };
}

/**
 * @param {'guardar' | 'previsualizar'} action
 * @param {Record<string, string>} form
 * @param {any} [user]
 */
const post = (action, form, user = admin) =>
	/** @type {any} */ (
		fakeRequestEvent({ platform: t.platform, path: `/admin/etiquetas?/${action}`, user, form })
	);

/** @param {unknown} op */
const one = (op) => ({ op: JSON.stringify(op) });

const record = async (/** @type {string} */ key) =>
	(await loadTagRecords(t.db, { role: 'admin', id: 'admin-de-prueba' })).find((r) => r.key === key);

describe('Etiquetas → Guardar (al momento, de a un cambio)', () => {
	it('un cambio de una etiqueta se guarda al momento y queda en Actividad', async () => {
		const { mod, commits } = await page();
		const res = await mod.actions.guardar(
			post(
				'guardar',
				one({ type: 'update', id: 'Etiqueta de Prueba', set: { icon: '🪢', color: '#aa66cc' } })
			)
		);
		expect(res).toMatchObject({ saved: { db: true, files: 1, posts: 0 } });
		expect((await record('Etiqueta de Prueba'))?.data).toMatchObject({
			icon: '🪢',
			color: '#aa66cc'
		});
		const audit = await listAudit(t.db, { targetType: 'tags' });
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({ action: 'tags.edit' });
		expect(audit[0].summary).toMatch(/^Etiquetas \(base\): /);
		expect(commits).toHaveLength(0);
	});

	it('mover (también arrastrando) se guarda al momento', async () => {
		const { mod } = await page();
		const res = await mod.actions.guardar(
			post(
				'guardar',
				one({
					type: 'move',
					id: 'Otra de Prueba',
					from: 'Categoría Inventada',
					to: 'Etiqueta de Prueba'
				})
			)
		);
		expect(res).toMatchObject({ saved: { db: true } });
		expect((await record('Otra de Prueba'))?.parents.map((p) => p.key)).toEqual([
			'Etiqueta de Prueba'
		]);
	});

	it('una lista de cambios no se acepta: nada escrito', async () => {
		const { mod } = await page();
		const res = await mod.actions.guardar(
			post('guardar', {
				op: JSON.stringify([
					{ type: 'update', id: 'Etiqueta de Prueba', set: { icon: '🪢' } },
					{ type: 'update', id: 'Otra de Prueba', set: { icon: '🌶' } }
				])
			})
		);
		expect(res).toMatchObject({ status: 400, data: { error: 'Guardá de a un cambio por vez.' } });
		// El campo viejo (`ops`, la lista por guardar) tampoco.
		expect(
			await mod.actions.guardar(
				post('guardar', {
					ops: JSON.stringify([{ type: 'update', id: 'Etiqueta de Prueba', set: { icon: '🪢' } }])
				})
			)
		).toMatchObject({ status: 400, data: { error: 'No hay cambios.' } });
		expect((await record('Etiqueta de Prueba'))?.data?.icon).toBeUndefined();
		expect(await listAudit(t.db, { targetType: 'tags' })).toEqual([]);
	});

	it('validación: JSON roto, un cambio inválido o imposible → 400, nada escrito', async () => {
		const { mod } = await page();
		expect(await mod.actions.guardar(post('guardar', { op: '{roto' }))).toMatchObject({
			status: 400,
			data: { error: 'Cambio inválido.' }
		});
		expect(
			await mod.actions.guardar(post('guardar', one({ type: 'update', id: 'Etiqueta de Prueba' })))
		).toMatchObject({ status: 400 });
		// Ya existe: lo valida contra lo que hay en la base ahora.
		expect(
			await mod.actions.guardar(
				post(
					'guardar',
					one({ type: 'create', id: 'Otra de Prueba', parent: 'Categoría Inventada' })
				)
			)
		).toMatchObject({ status: 400 });
		expect(await listAudit(t.db, { targetType: 'tags' })).toEqual([]);
	});

	it('sin permiso: una cuenta que no es admin no guarda', async () => {
		const { mod } = await page();
		const err = await thrown(() =>
			mod.actions.guardar(
				post('guardar', one({ type: 'update', id: 'Etiqueta de Prueba', set: { icon: '🪢' } }), {
					id: 1,
					login: 'alguien-de-prueba'
				})
			)
		);
		expect(err?.status).toBe(403);
		expect((await record('Etiqueta de Prueba'))?.data?.icon).toBeUndefined();
	});

	it('renombrar dejando el alias (lo de siempre): al momento, el nombre viejo queda como alias', async () => {
		const { mod, commits } = await page();
		const res = await mod.actions.guardar(
			post(
				'guardar',
				one({
					type: 'rename',
					from: 'Etiqueta de Prueba',
					to: 'Etiqueta Renombrada',
					keepAlias: true
				})
			)
		);
		expect(res).toMatchObject({ saved: { db: true, posts: 0 } });
		expect((await record('Etiqueta de Prueba'))?.aliasOf).toBe('Etiqueta Renombrada');
		expect(commits).toHaveLength(0);
	});

	it('renombrar sin alias: la vista previa dice cuántas publicaciones cambian; al guardar, cambian en la base', async () => {
		await saveObject(
			t.db,
			{
				type: 'evento',
				slug: 'evento-de-prueba',
				title: 'Evento de prueba',
				data: { start: '2031-05-01T20:00:00-03:00', tags: ['Etiqueta Sin Declarar'] }
			},
			{ actor: 'admin-de-prueba' }
		);
		const { mod: m, commits } = await page();
		// Primero se suma al árbol (al momento) y después se renombra sin alias.
		expect(
			await m.actions.guardar(
				post(
					'guardar',
					one({ type: 'create', id: 'Etiqueta Sin Declarar', parent: 'Categoría Inventada' })
				)
			)
		).toMatchObject({ saved: { db: true } });
		const op = one({
			type: 'rename',
			from: 'Etiqueta Sin Declarar',
			to: 'Etiqueta Declarada',
			keepAlias: false
		});
		const preview = await m.actions.previsualizar(post('previsualizar', op));
		expect(preview).toMatchObject({ preview: { posts: { total: 1 } } });
		// La vista previa no escribe nada.
		expect(await record('Etiqueta Sin Declarar')).toBeTruthy();
		expect(await m.actions.guardar(post('guardar', op))).toMatchObject({
			saved: { db: true, posts: 1 }
		});
		expect(await record('Etiqueta Sin Declarar')).toBeUndefined();
		const row = /** @type {any} */ (
			await t.db.prepare("SELECT data FROM objects WHERE slug = 'evento-de-prueba'").first()
		);
		expect(JSON.parse(row.data).tags).toEqual(['Etiqueta Declarada']);
		expect(commits).toHaveLength(0);
	});
});
