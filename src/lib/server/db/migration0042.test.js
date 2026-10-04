/**
 * La migración 0042 pasa a edges `etiqueta` las etiquetas de los eventos y del material
 * (`data.tags` → un edge por etiqueta viva, con sus lugares en la lista). Se aplica sobre una base
 * con todas las migraciones anteriores y datos inventados, y se compara con lo que hace el código:
 * la lista que arma `withTagEdges` después de migrar es la misma que había antes, y lo que queda en
 * `data` lo acepta el tipo. Correrla dos veces no cambia nada la segunda.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';
import { withTagEdges } from '../contenido/etiquetasEdges.js';
import { coreTypes, validateData } from '../objects/types/index.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let before;
/** @type {string[]} */
let statements;

const NOW = Date.parse('2026-10-01T12:00:00Z');
const START = '2026-11-01T20:00-03:00';

/** @type {Record<string, number>} */
const ids = {};
/** @type {Record<string, Record<string, any>>} */
const original = {};

/**
 * @param {string} type
 * @param {string} slug
 * @param {Record<string, unknown>} data
 * @param {{ deleted?: boolean, visibility?: string }} [opts]
 */
async function object(type, slug, data, { deleted = false, visibility = 'public' } = {}) {
	const row = await t.db
		.prepare(
			`INSERT INTO objects (type, slug, title, data, visibility, created_at, created_by, updated_at,
				updated_by, deleted_at)
			VALUES (?1, ?2, ?3, ?4, ?7, ?5, 'admin-inventade', ?5, 'admin-inventade', ?6) RETURNING id`
		)
		.bind(type, slug, `Título ${slug}`, JSON.stringify(data), NOW, deleted ? NOW : null, visibility)
		.first();
	ids[slug] = Number(row?.id);
	original[slug] = data;
	return ids[slug];
}

/** @param {string} slug */
async function dataOf(slug) {
	const row = await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(ids[slug]).first();
	return JSON.parse(String(row?.data));
}

/** @param {string} slug */
async function tagEdges(slug) {
	const { results } = await t.db
		.prepare(
			`SELECT e.data, e.position, e.created_by, json_extract(o.data, '$.key') AS key
			FROM edges e JOIN objects o ON o.id = e.to_id
			WHERE e.from_id = ?1 AND e.kind = 'etiqueta' ORDER BY e.position, e.id`
		)
		.bind(ids[slug])
		.all();
	return results.map((r) => ({
		key: String(r.key),
		data: r.data == null ? null : JSON.parse(String(r.data)),
		createdBy: r.created_by
	}));
}

/** @param {string} slug */
const version = async (slug) =>
	Number(
		(await t.db.prepare('SELECT version FROM objects WHERE id = ?1').bind(ids[slug]).first())
			?.version
	);

const runMigration = () => t.db.batch(statements.map((s) => t.db.prepare(s)));

/** Todo lo que la migración puede tocar, para comparar dos corridas. */
async function snapshot() {
	const all = async (/** @type {string} */ sql) => (await t.db.prepare(sql).all()).results;
	return {
		objects: await all('SELECT id, version, data FROM objects ORDER BY id'),
		edges: await all('SELECT * FROM edges ORDER BY id'),
		revisions: await all('SELECT id FROM object_revisions ORDER BY id'),
		sources: await all('SELECT * FROM content_sources ORDER BY object_id')
	};
}

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0042')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);

	await t.db
		.prepare(
			`INSERT INTO object_types (type, origin, created_at) VALUES ('perfil', 'core', ?1),
				('evento', 'core', ?1), ('material', 'core', ?1), ('etiqueta', 'core', ?1)`
		)
		.bind(NOW)
		.run();
	await object('etiqueta', 'cuerdas', { key: 'Cuerdas' });
	await object('etiqueta', 'fiesta', { key: 'Fiesta Inventada' }, { visibility: 'hidden' });
	// Un alias: se apunta a él tal cual (su `key` es el que nombra el post).
	await object('etiqueta', 'alias-viejo', { key: 'Alias Viejo' });
	await object('etiqueta', 'borrada', { key: 'Borrada' }, { deleted: true });

	// Etiquetas vivas (una repetida, una oculta, un alias), una borrada y un nombre suelto.
	await object('evento', 'mezcla', {
		start: START,
		tags: ['Sin Etiqueta', 'Cuerdas', 'Borrada', 'Fiesta Inventada', 'Cuerdas', 'Alias Viejo']
	});
	// Solo etiquetas vivas: `tags` se va.
	await object('evento', 'solo-etiquetas', { start: START, tags: ['Cuerdas'] });
	await object('material', 'guia-inventada', {
		summary: 'Una guía inventada',
		tags: ['Fiesta Inventada', 'Otra Cosa']
	});
	// No se tocan: sin etiquetas vivas, con algo que no es texto, ya con edges, otro tipo.
	await object('evento', 'sin-vivas', { start: START, tags: ['Borrada', 'Nada'] });
	await object('evento', 'no-texto', { start: START, tags: ['Cuerdas', 3] });
	await object('evento', 'ya-migrado', { start: START, tags: ['Cuerdas'] });
	await object('perfil', 'perfil-con-etiquetas', { kind: 'persona', tags: ['Cuerdas'] });
	await t.db
		.prepare(
			`INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
			VALUES (?1, 'etiqueta', ?2, 0, '{"at":[1]}', ?3, 'panel')`
		)
		.bind(ids['ya-migrado'], ids['fiesta'], NOW)
		.run();
	// Importado de un .md y sin editar: sigue sin editar. Importado y editado: sigue editado.
	await object('evento', 'importado', { start: START, tags: ['Cuerdas', 'Suelta'] });
	await object('evento', 'editado', { start: START, tags: ['Cuerdas'] });
	await t.db.batch([
		t.db.prepare('UPDATE objects SET version = 2 WHERE id = ?1').bind(ids.editado),
		t.db
			.prepare(
				`INSERT INTO content_sources (object_id, category, legacy_slug, source_hash,
					imported_version, imported_at, updated_at)
				VALUES (?1, 'calendario', 'Importado_2026-BDSM', ?3, 1, ?4, ?4),
					(?2, 'calendario', 'editado', ?3, 1, ?4, ?4)`
			)
			.bind(ids.importado, ids.editado, 'a'.repeat(64), NOW)
	]);

	const sql = await readFile(path.join('migrations', '0042_etiquetas_edges.sql'), 'utf8');
	statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await runMigration();
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

const typeOf = (/** @type {string} */ type) =>
	/** @type {import('../objects/types/index.js').CoreType} */ (coreTypes.get(type));

describe('migración 0042: etiquetas → edges `etiqueta`', () => {
	it('un edge por etiqueta viva (también oculta o alias), con sus lugares y en orden', async () => {
		expect((await tagEdges('mezcla')).map(({ key, data }) => ({ key, data }))).toEqual([
			{ key: 'Cuerdas', data: { at: [1, 4] } },
			{ key: 'Fiesta Inventada', data: { at: [3] } },
			{ key: 'Alias Viejo', data: { at: [5] } }
		]);
		expect((await tagEdges('mezcla'))[0].createdBy).toBe('migracion-0042');
		expect(await tagEdges('guia-inventada')).toEqual([
			expect.objectContaining({ key: 'Fiesta Inventada', data: { at: [0] } })
		]);
	});

	it('en `data` quedan los nombres sin etiqueta viva, en orden', async () => {
		expect((await dataOf('mezcla')).tags).toEqual(['Sin Etiqueta', 'Borrada']);
		expect(await dataOf('solo-etiquetas')).toEqual({ start: START });
		expect(await dataOf('guia-inventada')).toEqual({
			summary: 'Una guía inventada',
			tags: ['Otra Cosa']
		});
	});

	it('el código arma la misma lista que había antes, y el tipo acepta lo que queda', async () => {
		for (const [slug, type] of [
			['mezcla', 'evento'],
			['solo-etiquetas', 'evento'],
			['guia-inventada', 'material'],
			['importado', 'evento'],
			['editado', 'evento']
		]) {
			const data = await dataOf(slug);
			expect(validateData(typeOf(type), data).ok, slug).toBe(true);
			const edges = (await tagEdges(slug)).map(({ key, data: d }) => ({ key, data: d }));
			expect(withTagEdges(data, edges), slug).toEqual(original[slug]);
		}
	});

	it('lo que no tiene etiquetas vivas, tiene algo raro, ya tenía edges o es de otro tipo, no se toca', async () => {
		for (const slug of ['sin-vivas', 'no-texto', 'ya-migrado', 'perfil-con-etiquetas']) {
			expect(await dataOf(slug), slug).toEqual(original[slug]);
			expect(await version(slug), slug).toBe(1);
		}
		expect((await tagEdges('ya-migrado')).map((e) => e.key)).toEqual(['Fiesta Inventada']);
		const perfil = await t.db
			.prepare('SELECT count(*) AS n FROM edges WHERE from_id = ?1')
			.bind(ids['perfil-con-etiquetas'])
			.first();
		expect(perfil?.n).toBe(0);
	});

	it('cada post que cambia sube su versión y deja su revisión', async () => {
		expect(await version('mezcla')).toBe(2);
		expect(await version('editado')).toBe(3);
		const { results } = await t.db
			.prepare(
				`SELECT object_id, version, data, saved_by, source FROM object_revisions ORDER BY object_id`
			)
			.all();
		expect(results.map((r) => Number(r.object_id))).toEqual(
			['mezcla', 'solo-etiquetas', 'guia-inventada', 'importado', 'editado'].map((s) => ids[s])
		);
		const rev = results.find((r) => Number(r.object_id) === ids.mezcla);
		expect(rev).toMatchObject({ version: 2, saved_by: 'migracion-0042', source: 'migracion' });
		expect(JSON.parse(String(rev?.data))).toEqual(await dataOf('mezcla'));
	});

	it('lo importado sin editar sigue sin editar; lo editado, editado', async () => {
		const sources = await t.db
			.prepare(
				`SELECT s.legacy_slug, s.imported_version, o.version FROM content_sources s
				JOIN objects o ON o.id = s.object_id ORDER BY s.legacy_slug`
			)
			.all();
		expect(sources.results).toEqual([
			{ legacy_slug: 'Importado_2026-BDSM', imported_version: 2, version: 2 },
			{ legacy_slug: 'editado', imported_version: 1, version: 3 }
		]);
	});

	it('no deja la tabla de trabajo, y correrla de nuevo no cambia nada', async () => {
		expect(
			await t.db.prepare("SELECT name FROM sqlite_master WHERE name = 'm0042_tags'").first()
		).toBeNull();
		const first = await snapshot();
		await runMigration();
		expect(await snapshot()).toEqual(first);
	});
});
