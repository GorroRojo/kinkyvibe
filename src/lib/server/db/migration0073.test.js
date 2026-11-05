/**
 * La migración 0073 suma las relaciones al historial (`object_revisions.edges`) para que deshacer
 * (docs/conector-claude.md) pueda devolver las etiquetas, las personas, la imagen y el lugar. Se
 * aplica sobre una base con todas las migraciones anteriores y datos inventados:
 *
 * - la versión actual de un evento que ya estaba en el historial recibe sus relaciones (y las
 *   versiones viejas quedan sin, como estaban);
 * - un perfil sin historial (el panel los guardaba sin) entra con su versión actual, quién y cuándo;
 * - una imagen (otro tipo) no se toca;
 * - correr las sentencias de datos otra vez no cambia nada;
 * - lo que guarda el código después (revisionStatement) trae sus relaciones.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';
import { listRevisions, revisionStatement } from '../contenido/revisions.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let before;
/** @type {string[]} */
let statements;

const NOW = Date.parse('2026-10-01T12:00:00Z');

/** @type {Record<string, number>} */
const ids = {};

/**
 * @param {string} type
 * @param {string} slug
 * @param {Record<string, unknown>} data
 * @param {number} [version]
 */
async function object(type, slug, data, version = 1) {
	const row = await t.db
		.prepare(
			`INSERT INTO objects (type, slug, title, data, visibility, version, created_at, created_by,
				updated_at, updated_by)
			VALUES (?1, ?2, ?3, ?4, 'public', ?5, ?6, 'admin-inventade', ?6, 'admin-inventade') RETURNING id`
		)
		.bind(type, slug, `Título ${slug}`, JSON.stringify(data), version, NOW)
		.first();
	ids[slug] = Number(row?.id);
	return ids[slug];
}

/** @param {number} objectId @param {number} version @param {string} title */
const oldRevision = (objectId, version, title) =>
	t.db
		.prepare(
			`INSERT INTO object_revisions (object_id, version, slug, title, data, visibility, saved_at,
				saved_by, source)
			VALUES (?1, ?2, 'evento-inventado', ?3, '{}', 'public', ?4, 'admin-inventade', 'panel')`
		)
		.bind(objectId, version, title, NOW)
		.run();

/** @param {number} from @param {string} kind @param {number} to @param {number} [position] */
const edge = (from, kind, to, position = 0) =>
	t.db
		.prepare(
			`INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
			VALUES (?1, ?2, ?3, ?4, '{"at":[0]}', ?5, 'panel')`
		)
		.bind(from, kind, to, position, NOW)
		.run();

const runData = () => t.db.batch(statements.slice(1).map((s) => t.db.prepare(s)));

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0073')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
	await t.db
		.prepare(
			`INSERT INTO object_types (type, origin, created_at) VALUES ('perfil', 'core', ?1),
				('evento', 'core', ?1), ('etiqueta', 'core', ?1), ('imagen', 'core', ?1)`
		)
		.bind(NOW)
		.run();
	const tag = await object('etiqueta', 'cuerdas', { key: 'Cuerdas' });
	const person = await object('perfil', 'persona-inventada', { kind: 'persona' });
	const event = await object('evento', 'evento-inventado', { start: '2031-01-01T20:00-03:00' }, 2);
	await object('imagen', 'imagen-inventada', { key: 'img/x.webp', mime: 'image/webp', size: 1 });
	await edge(event, 'etiqueta', tag);
	await edge(event, 'persona', person);
	await oldRevision(event, 1, 'Antes');
	await oldRevision(event, 2, 'Ahora');

	const sql = await readFile(path.join('migrations', '0073_historial_con_relaciones.sql'), 'utf8');
	statements = unstable_splitSqlQuery(sql);
	await t.db.batch(statements.map((s) => t.db.prepare(s)));
});

afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

describe('migración 0073', () => {
	it('la versión actual de un evento recibe sus relaciones; las viejas quedan sin', async () => {
		const [now, old] = await listRevisions(t.db, ids['evento-inventado']);
		expect(old.edges).toBeNull();
		expect(now.edges?.map((e) => [e.kind, e.slug, e.key])).toEqual([
			['etiqueta', 'cuerdas', 'Cuerdas'],
			['persona', 'persona-inventada', null]
		]);
		expect(now.edges?.[0].data).toEqual({ at: [0] });
	});

	it('un perfil y una etiqueta sin historial entran con su versión actual; una imagen no', async () => {
		const [p] = await listRevisions(t.db, ids['persona-inventada']);
		expect(p).toMatchObject({
			version: 1,
			source: 'migracion',
			savedBy: 'admin-inventade',
			savedAt: NOW,
			edges: []
		});
		expect(await listRevisions(t.db, ids['cuerdas'])).toHaveLength(1);
		expect(await listRevisions(t.db, ids['imagen-inventada'])).toEqual([]);
	});

	it('correr las sentencias de datos otra vez no cambia nada', async () => {
		const all = async () =>
			(await t.db.prepare('SELECT * FROM object_revisions ORDER BY id').all()).results;
		const first = await all();
		await runData();
		expect(await all()).toEqual(first);
	});

	it('lo que se guarda después trae sus relaciones', async () => {
		await t.db
			.prepare('UPDATE objects SET version = 3, updated_at = ?2 WHERE id = ?1')
			.bind(ids['evento-inventado'], NOW + 1)
			.run();
		await revisionStatement(
			t.db,
			{ id: ids['evento-inventado'], type: 'evento', slug: 'evento-inventado' },
			'claude',
			'Mel'
		).run();
		const [last] = await listRevisions(t.db, ids['evento-inventado']);
		expect(last).toMatchObject({ version: 3, source: 'claude', confirmedBy: 'Mel' });
		expect(last.edges?.map((e) => e.kind)).toEqual(['etiqueta', 'persona']);
	});
});
