/**
 * De dónde salen las etiquetas del sitio: la base (con etiquetas importadas); sin base o sin
 * etiquetas, el archivo como respaldo.
 *
 * (La prueba «apagado» se sacó con el interruptor `etiquetas_db`: el modo «archivo» ya no existe.
 * No es aflojar las pruebas: es sacar un modo.)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { fallbackTagList } from '$lib/utils/tagFallback.js';
import { importTags } from './importer.js';
import { currentSiteTags, setSiteTagList } from '$lib/utils/siteTags.js';
import { tagManager, wikiTagManager } from '$lib/utils/stores.js';
import { get } from 'svelte/store';
import {
	applySiteTags,
	clearTagSourceCache,
	refreshTagSourceAhead,
	tagManagerOf,
	tagSourceFreshness,
	tagSourceFrom
} from './source.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const RAW = [
	{ id: 'root', children: ['prácticas'] },
	{ id: 'prácticas', children: ['ataduras'], color: 'darkblue' },
	{ id: 'ataduras', aka: ['atar'] }
];

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
});

describe('tagSourceFrom', () => {
	it('sin base, o sin etiquetas en la base: el árbol de respaldo (vacío en la app; en las pruebas, el de la semilla)', async () => {
		expect(await tagSourceFrom(null)).toMatchObject({ fromDb: false });
		expect((await tagSourceFrom(null)).rawTags).toBe(fallbackTagList());
		expect((await tagSourceFrom(t.db, {})).fromDb).toBe(false);
	});

	it('con etiquetas: la base, y se recuerda hasta que se olvida', async () => {
		await importTags(t.db, { rawTags: structuredClone(RAW) }, { actor: 'admin-de-prueba' });
		const s = await tagSourceFrom(t.db, { now: 1 });
		expect(s.fromDb).toBe(true);
		const tags = tagManagerOf(s);
		expect(tags.get('atar').id).toBe('ataduras');
		expect(tags.get('ataduras').getAllParents()).toContain('prácticas');
		// La lista sigue siendo datos (sin las funciones que agrega tagsFactory).
		expect(() => structuredClone(s.rawTags)).not.toThrow();
		expect(tagManagerOf(s)).toBe(tags);

		await resetDB(t.db);
		expect(await tagSourceFrom(t.db, { now: 2 })).toBe(s);
		clearTagSourceCache();
		expect((await tagSourceFrom(t.db, { now: 3 })).fromDb).toBe(false);
	});

	it('al volver a leer sin cambios, la misma lista (así no se rearman árboles ni posts)', async () => {
		await importTags(t.db, { rawTags: structuredClone(RAW) }, { actor: 'admin-de-prueba' });
		const s = await tagSourceFrom(t.db, { now: 1 });
		// Pasó el tiempo de caché: se lee de nuevo, pero no cambió nada.
		const again = await tagSourceFrom(t.db, { now: 1 + 60_000 });
		expect(again).toBe(s);
		// Cambió algo: una lista nueva.
		await importTags(
			t.db,
			{ rawTags: [...structuredClone(RAW), { id: 'nueva de prueba' }] },
			{ actor: 'admin-de-prueba' }
		);
		const changed = await tagSourceFrom(t.db, { now: 1 + 120_000 });
		expect(changed).not.toBe(s);
		expect(changed.rawTags.some((e) => e.id === 'nueva de prueba')).toBe(true);
	});

	it('se renueva antes de vencer sin esperar; si la lectura falla o el panel guardó, queda lo de antes', async () => {
		await importTags(t.db, { rawTags: structuredClone(RAW) }, { actor: 'admin-de-prueba' });
		const s = await tagSourceFrom(t.db, { now: 1 });
		expect(tagSourceFreshness(1 + 15_000)).toBe('fresh');
		expect(tagSourceFreshness(1 + 25_000)).toBe('aging');
		expect(tagSourceFreshness(1 + 30_000)).toBe('stale');
		// Con tiempo de sobra, no se lee nada.
		/** @type {Promise<unknown>[]} */
		const tasks = [];
		const waitUntil = (/** @type {Promise<unknown>} */ p) => void tasks.push(p);
		refreshTagSourceAhead(t.db, { now: 1 + 15_000, waitUntil });
		expect(tasks).toEqual([]);
		// Si la lectura falla, sigue lo recordado (y vence cuando vencía).
		const broken = /** @type {any} */ ({
			prepare: () => ({ bind: () => ({}) }),
			batch: async () => {
				throw new Error('base caída de prueba');
			}
		});
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		refreshTagSourceAhead(broken, { now: 1 + 25_000, waitUntil });
		await Promise.all(tasks.splice(0));
		quiet.mockRestore();
		expect(await tagSourceFrom(t.db, { now: 1 + 29_000 })).toBe(s);
		expect(tagSourceFreshness(1 + 30_000)).toBe('stale');
		// Por vencer: se lee de nuevo sin esperar y se recuerda 30 s desde esa lectura.
		await importTags(
			t.db,
			{ rawTags: [...structuredClone(RAW), { id: 'nueva de prueba' }] },
			{ actor: 'admin-de-prueba' }
		);
		refreshTagSourceAhead(t.db, { now: 1 + 25_000, waitUntil });
		expect(tasks).toHaveLength(1);
		await Promise.all(tasks.splice(0));
		const fresh = await tagSourceFrom(t.db, { now: 1 + 50_000 });
		expect(fresh.rawTags.some((e) => e.id === 'nueva de prueba')).toBe(true);
		// Si el panel guarda mientras se renueva, lo leído no se recuerda.
		refreshTagSourceAhead(t.db, { now: 1 + 50_000, waitUntil });
		clearTagSourceCache();
		await Promise.all(tasks.splice(0));
		expect(tagSourceFreshness(1 + 50_000)).toBe('stale');
	});

	it('sin base: el archivo', async () => {
		expect((await tagSourceFrom(null, {})).fromDb).toBe(false);
	});
});

describe('tagManagerOf', () => {
	it('un árbol por lista, el mismo que usan `currentSiteTags()` y los stores', async () => {
		const source = { rawTags: structuredClone(RAW), fromDb: true, wiki: [] };
		try {
			await applySiteTags(undefined, { source });
			const tree = tagManagerOf(source);
			expect(tagManagerOf(source)).toBe(tree);
			expect(currentSiteTags()).toBe(tree);
			expect(get(tagManager)).toBe(tree);
			expect(get(wikiTagManager)).toBe(tree);
			expect(tree.get('atar').id).toBe('ataduras');

			const otra = { rawTags: structuredClone(RAW), fromDb: true, wiki: [] };
			expect(tagManagerOf(otra)).not.toBe(tree);
		} finally {
			setSiteTagList(null);
		}
	});
});
