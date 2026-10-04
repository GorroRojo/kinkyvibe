/**
 * De dónde salen las etiquetas del sitio: la base (con etiquetas importadas); sin base o sin
 * etiquetas, el archivo como respaldo.
 *
 * (La prueba «apagado» se sacó con el interruptor `etiquetas_db`: el modo «archivo» ya no existe.
 * No es aflojar las pruebas: es sacar un modo.)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import hardcodedTags from '$lib/utils/hardcodedTags.js';
import { importTags } from './importer.js';
import { clearTagSourceCache, tagManagerOf, tagSourceFrom } from './source.js';

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
	it('sin base, o sin etiquetas en la base: el archivo (respaldo)', async () => {
		expect(await tagSourceFrom(null)).toMatchObject({ fromDb: false, rawTags: hardcodedTags });
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

	it('sin base: el archivo', async () => {
		expect((await tagSourceFrom(null, {})).fromDb).toBe(false);
	});
});
