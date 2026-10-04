/**
 * scripts/demo/cuirdas-por-anio.sql (solo para la base de previews): crea «Cuirdas Sudacas 2025» y
 * «Cuirdas Sudacas 2026» como hijas de «Cuirdas Sudacas», le suma a cada edición en la base la
 * etiqueta de su año (sin sacar la de la madre), dos veces sin duplicar nada, y deja datos que el
 * chequeo nocturno acepta. Sin «Cuirdas Sudacas» en la base, no hace nada. Eventos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB, resetDB } from '../../src/lib/server/db/testing.js';
import { saveObject } from '../../src/lib/server/objects/save.js';
import { checkObjectsIntegrity } from '../../src/lib/server/objects/integrity.js';
import { loadTagRecords } from '../../src/lib/server/etiquetas/read.js';
import { recordsToRawTags } from '../../src/lib/server/etiquetas/model.js';
import tagsFactory from '../../src/lib/utils/tags';
import { seriesParentOf, seriesTagIds } from '../../src/lib/utils/series.js';

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

const ctx = { actor: 'admin-de-prueba' };

async function applySeed() {
	const sql = await readFile('scripts/demo/cuirdas-por-anio.sql', 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await t.db.batch(statements.map((s) => t.db.prepare(s)));
}

/** @param {string} key @param {Record<string, unknown>} [data] @param {number[]} [parents] */
async function tag(key, data = {}, parents = []) {
	const saved = await saveObject(
		t.db,
		{
			type: 'etiqueta',
			title: key,
			data: { key, ...data },
			edges: { hijo_de: parents.map((to, orden) => ({ to, data: { orden } })) }
		},
		ctx
	);
	return saved.id;
}

/** @param {string} slug @param {string} start @param {string[]} tags */
async function evento(slug, start, tags) {
	const saved = await saveObject(
		t.db,
		{ type: 'evento', title: `Evento ${slug}`, slug, data: { start, tags } },
		ctx
	);
	return saved.id;
}

/** @param {number} id */
async function tagsOf(id) {
	const row = /** @type {any} */ (
		await t.db.prepare('SELECT data, version FROM objects WHERE id = ?1').bind(id).first()
	);
	return { tags: JSON.parse(row.data).tags, version: row.version };
}

describe('scripts/demo/cuirdas-por-anio.sql', () => {
	it('crea las series por año dentro de la madre y etiqueta cada edición con su año', async () => {
		const root = await tag('evento recurrente');
		const madre = await tag('Cuirdas Sudacas', { icon: '🪢' }, [root]);
		await tag('Otra Serie', {}, [root]);
		const dia1 = await evento('cuirdas-prueba-2025-1', '2025-06-19T20:00-03:00', [
			'cuerdas',
			'Cuirdas Sudacas'
		]);
		const taller = await evento('cuirdas-prueba-2026-1', '2026-07-10T15:00-03:00', [
			'Cuirdas Sudacas'
		]);
		const ajeno = await evento('otra-cosa-2026', '2026-07-10T15:00-03:00', ['Otra Serie']);
		expect(madre).toBeTruthy();

		await applySeed();
		await applySeed();

		expect(await tagsOf(dia1)).toEqual({
			tags: ['cuerdas', 'Cuirdas Sudacas', 'Cuirdas Sudacas 2025'],
			version: 2
		});
		expect(await tagsOf(taller)).toEqual({
			tags: ['Cuirdas Sudacas', 'Cuirdas Sudacas 2026'],
			version: 2
		});
		expect(await tagsOf(ajeno)).toEqual({ tags: ['Otra Serie'], version: 1 });

		// El árbol leído de la base: dos series hijas de «Cuirdas Sudacas», con su ícono, en orden.
		const tm = tagsFactory(/** @type {any} */ (recordsToRawTags(await loadTagRecords(t.db))));
		expect(tm.get('Cuirdas Sudacas')?.children).toEqual([
			'Cuirdas Sudacas 2025',
			'Cuirdas Sudacas 2026'
		]);
		expect(tm.get('Cuirdas Sudacas 2026')?.icon).toBe('🪢');
		const ids = seriesTagIds(tm);
		expect(ids).toEqual(expect.arrayContaining(['Cuirdas Sudacas 2025', 'Cuirdas Sudacas 2026']));
		expect(seriesParentOf(tm, 'Cuirdas Sudacas 2025', ids)).toBe('Cuirdas Sudacas');

		// Datos que el código de hoy acepta: el chequeo nocturno no encuentra nada.
		expect(await checkObjectsIntegrity(t.db)).toEqual([]);
	});

	it('sin «Cuirdas Sudacas» en la base (etiquetas sin importar), no hace nada', async () => {
		const dia1 = await evento('cuirdas-prueba-2025-1', '2025-06-19T20:00-03:00', [
			'Cuirdas Sudacas'
		]);
		await applySeed();
		expect(await tagsOf(dia1)).toEqual({ tags: ['Cuirdas Sudacas'], version: 1 });
		const n = await t.db
			.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'etiqueta'")
			.first();
		expect(n?.n).toBe(0);
	});
});
