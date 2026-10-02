/**
 * Importación de etiquetas sobre el archivo REAL y los textos reales de la wiki, en una base de
 * prueba (D1 de miniflare): lo importado, leído de vuelta, da el mismo árbol; es idempotente; no
 * pisa ni revive lo tocado en el panel; y por tandas (`budget`) llega al mismo resultado.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import hardcodedTags from '$lib/utils/hardcodedTags.js';
import tagsFactory from '$lib/utils/tags.js';
import { saveObject } from '../objects/save.js';
import { TAG_TYPE } from '../objects/types/etiqueta.js';
import { freeTagSlug, importTags, summarizeTagImport } from './importer.js';
import { recordsToRawTags, tagsToRecords } from './model.js';
import { loadTagRecords } from './read.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const wikiRaw = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/wiki/*.md', { query: '?raw', import: 'default', eager: true })
);
const wikiFiles = Object.entries(wikiRaw).map(([p, raw]) => ({
	name: p.slice(p.lastIndexOf('/') + 1, -3),
	raw
}));
const fresh = () => JSON.parse(JSON.stringify(hardcodedTags));
const source = () => ({ rawTags: fresh(), wikiFiles });
const ACTOR = 'admin-de-prueba';

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

/** @param {string} key */
async function tagByKey(key) {
	const records = await loadTagRecords(t.db);
	return records.find((r) => r.key === key);
}

describe('importTags', () => {
	it('importa todo y, leído de la base, coincide con lo que sale del archivo', async () => {
		const expected = tagsToRecords(fresh(), wikiFiles).records;
		const preview = await importTags(t.db, source(), { actor: ACTOR, dryRun: true });
		expect(summarizeTagImport(preview.results).created).toBe(expected.length);
		const { count } = /** @type {any} */ (
			await t.db.prepare('SELECT count(*) AS count FROM objects').first()
		);
		expect(count).toBe(0); // la vista previa no escribe

		const run = await importTags(t.db, source(), { actor: ACTOR });
		const s = summarizeTagImport(run.results);
		expect(s).toMatchObject({ created: expected.length, error: 0, pending: 0 });

		const fromDb = await loadTagRecords(t.db);
		const strip = (/** @type {any[]} */ rs) =>
			rs.map(({ key, title, data, parents, related, aliasOf }) => ({
				key,
				title,
				data,
				parents,
				related,
				aliasOf
			}));
		expect(strip(fromDb)).toEqual(strip(expected));
		// Y el árbol que arma tagsFactory es el mismo que con los registros del archivo.
		const a = tagsFactory(/** @type {any} */ (recordsToRawTags(fromDb)));
		const b = tagsFactory(/** @type {any} */ (recordsToRawTags(expected)));
		expect(a.tagIDs()).toEqual(b.tagIDs());
		expect(a.get('Rancheadita Kinky').getAllParents()).toEqual(
			b.get('Rancheadita Kinky').getAllParents()
		);
		expect((await tagByKey('edad'))?.data.wiki_title).toBe('Juegos con la edad');
	});

	it('es idempotente: la segunda vez no cambia nada', async () => {
		await importTags(t.db, source(), { actor: ACTOR });
		const again = await importTags(t.db, source(), { actor: ACTOR });
		const s = summarizeTagImport(again.results);
		expect(s.unchanged).toBe(again.results.length);
		const { n } = /** @type {any} */ (
			await t.db.prepare('SELECT count(*) AS n FROM objects WHERE version > 2').first()
		);
		expect(n).toBe(0);
	});

	it('actualiza lo que cambió en el archivo, salvo lo editado o borrado en el panel', async () => {
		await importTags(t.db, source(), { actor: ACTOR });
		const bondage = /** @type {any} */ (await tagByKey('bondage'));
		const cine = /** @type {any} */ (await tagByKey('Cine para Sucixs'));
		// Une admin edita «bondage» y borra «Cine para Sucixs».
		await saveObject(
			t.db,
			{
				id: bondage.id,
				type: TAG_TYPE,
				version: bondage.version,
				data: { key: 'bondage', ...bondage.data, icon: '🔗' }
			},
			{ actor: ACTOR }
		);
		await saveObject(
			t.db,
			{ id: cine.id, type: TAG_TYPE, version: cine.version, deleted: true },
			{ actor: ACTOR }
		);
		// El archivo cambia en las dos y en una tercera.
		const raw = fresh();
		for (const e of raw) {
			if (e.id === 'bondage' || e.id === 'Cine para Sucixs' || e.id === 'cine') e.icon = '🆕';
		}
		const run = await importTags(t.db, { rawTags: raw, wikiFiles }, { actor: ACTOR });
		const byKey = Object.fromEntries(run.results.map((r) => [r.key, r.action]));
		expect(byKey.bondage).toBe('skipped_edited');
		expect(byKey['Cine para Sucixs']).toBe('skipped_deleted');
		expect(byKey.cine).toBe('updated');
		expect((await tagByKey('bondage'))?.data.icon).toBe('🔗');
		expect((await tagByKey('cine'))?.data.icon).toBe('🆕');
		expect(await tagByKey('Cine para Sucixs')).toBeUndefined();
	});

	it('no toca una etiqueta creada en el panel con el mismo nombre, pero la usa para relacionar', async () => {
		const panel = await saveObject(
			t.db,
			{ type: TAG_TYPE, title: 'Evento Recurrente', data: { key: 'evento recurrente' } },
			{ actor: ACTOR }
		);
		const run = await importTags(t.db, source(), { actor: ACTOR });
		expect(run.results.find((r) => r.key === 'evento recurrente')).toMatchObject({
			action: 'skipped_panel',
			id: panel.id
		});
		const picantearla = await tagByKey('Picantearla');
		expect(picantearla?.parents).toEqual([{ key: 'evento recurrente', orden: 0 }]);
		expect((await tagByKey('evento recurrente'))?.title).toBe('Evento Recurrente');
	});

	it('por tandas llega a lo mismo, sin perder relaciones', async () => {
		let rounds = 0;
		let pending = Infinity;
		while (pending > 0 && rounds < 30) {
			const run = await importTags(t.db, source(), { actor: ACTOR, budget: 120 });
			pending = run.pending;
			rounds++;
		}
		expect(pending).toBe(0);
		expect(rounds).toBeGreaterThan(2);
		const expected = tagsToRecords(fresh(), wikiFiles).records;
		const fromDb = await loadTagRecords(t.db);
		expect(fromDb.map((r) => [r.key, r.parents, r.related, r.aliasOf])).toEqual(
			expected.map((r) => [r.key, r.parents, r.related, r.aliasOf])
		);
	});

	it('direcciones internas libres («español» y «espanol»)', () => {
		const taken = new Set(['espanol']);
		expect(freeTagSlug('español', new Set())).toBe('espanol');
		expect(freeTagSlug('espanol', taken)).toBe('espanol-2');
		expect(freeTagSlug('¿?', new Set())).toBe('etiqueta');
	});
});
