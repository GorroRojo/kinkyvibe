/**
 * De dónde salen las etiquetas del sitio: el archivo, o la base con el interruptor prendido (y
 * con etiquetas importadas).
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
	it('apagado: el archivo', async () => {
		const s = await tagSourceFrom(t.db, { flagOn: false });
		expect(s).toMatchObject({ fromDb: false, rawTags: hardcodedTags });
	});

	it('prendido pero sin etiquetas en la base: el archivo', async () => {
		expect((await tagSourceFrom(t.db, { flagOn: true })).fromDb).toBe(false);
	});

	it('prendido y con etiquetas: la base, y se recuerda hasta que se olvida', async () => {
		await importTags(t.db, { rawTags: structuredClone(RAW) }, { actor: 'admin-de-prueba' });
		const s = await tagSourceFrom(t.db, { flagOn: true, now: 1 });
		expect(s.fromDb).toBe(true);
		const tags = tagManagerOf(s);
		expect(tags.get('atar').id).toBe('ataduras');
		expect(tags.get('ataduras').getAllParents()).toContain('prácticas');
		// La lista sigue siendo datos (sin las funciones que agrega tagsFactory).
		expect(() => structuredClone(s.rawTags)).not.toThrow();
		expect(tagManagerOf(s)).toBe(tags);

		await resetDB(t.db);
		expect(await tagSourceFrom(t.db, { flagOn: true, now: 2 })).toBe(s);
		clearTagSourceCache();
		expect((await tagSourceFrom(t.db, { flagOn: true, now: 3 })).fromDb).toBe(false);
	});

	it('sin base: el archivo', async () => {
		expect((await tagSourceFrom(null, { flagOn: true })).fromDb).toBe(false);
	});
});
