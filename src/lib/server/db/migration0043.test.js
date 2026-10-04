/**
 * La migración 0043 pasa a edges `persona` los perfiles de `data.personas` del material (como la
 * 0035 con los eventos). Se aplica sobre una base con todas las migraciones anteriores y datos
 * inventados, y se compara con lo que hace el código: la lista que arma `withPersonaEdges`
 * después de migrar es la misma que había antes (como la lee `reshapePersonas`), y lo que queda en
 * `data` lo acepta el tipo `material`. Correrla dos veces no cambia nada la segunda.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';
import { withPersonaEdges } from '../contenido/personasEdges.js';
import { reshapePersonas } from '../../utils/personasList.js';
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
async function personaEdges(slug) {
	const { results } = await t.db
		.prepare(
			`SELECT e.data, e.created_by, o.slug FROM edges e JOIN objects o ON o.id = e.to_id
			WHERE e.from_id = ?1 AND e.kind = 'persona' ORDER BY e.position, e.id`
		)
		.bind(ids[slug])
		.all();
	return results.map((r) => ({
		slug: String(r.slug),
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
		if (f.endsWith('.sql') && f < '0043')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);

	await t.db
		.prepare(
			`INSERT INTO object_types (type, origin, created_at) VALUES ('perfil', 'core', ?1),
				('evento', 'core', ?1), ('material', 'core', ?1)`
		)
		.bind(NOW)
		.run();
	await object('perfil', 'colectivo-inventado', { kind: 'proyecto' });
	await object('perfil', 'oculta-inventada', { kind: 'persona' }, { visibility: 'hidden' });
	await object('perfil', 'borrado-inventado', { kind: 'persona' }, { deleted: true });

	// La lista única: un perfil con dos roles, uno oculto, uno borrado, uno que no existe y nombres.
	await object('material', 'guia-mezcla', {
		summary: 'Guía inventada',
		personas: [
			{ name: 'Autore Inventade', role: 'Autore' },
			{ profile: 'colectivo-inventado', role: 'Ilustra' },
			{ profile: 'borrado-inventado', role: 'Edita' },
			{ profile: 'oculta-inventada', role: 'Autore' },
			{ profile: 'colectivo-inventado', role: 'Edita' },
			{ profile: 'no-existe-inventade', role: 'Traduce' },
			{ name: 'Persona Sin Perfil', role: 'Fotografía' }
		]
	});
	// Solo perfiles vivos: `personas` se va.
	await object('material', 'solo-perfiles', {
		summary: 'Otra guía',
		personas: [{ profile: 'oculta-inventada', role: 'Autore' }]
	});
	// La forma de antes: `authors` (Autore) y `extra.personas`; sin más `extra`, `extra` se va.
	await object('material', 'forma-vieja', {
		summary: 'Fanzine inventado',
		authors: [' Autore Vieje ', 'Otre Autore'],
		extra: {
			personas: [
				{ perfil: 'colectivo-inventado', rol: 'Ilustra' },
				{ nombre: 'Nombre Libre', rol: 'Fotografía' },
				{ perfil: '', rol: 'Vacía' }
			]
		}
	});
	// La forma de antes con más `extra`: queda lo demás.
	await object('material', 'forma-vieja-extra', {
		summary: 'Video inventado',
		authors: ['Autore Inventade'],
		extra: { color: 'violeta', personas: [{ perfil: 'oculta-inventada', rol: 'Edita' }] }
	});
	// No se tocan: sin perfiles vivos, una fila que el tipo no acepta, un texto suelto, ya con
	// edges, un evento (lo hizo la 0035).
	await object('material', 'sin-vivos', {
		personas: [
			{ name: 'Une', role: 'Autore' },
			{ profile: 'borrado-inventado', role: 'Edita' }
		]
	});
	await object('material', 'fila-rara', {
		personas: [{ profile: 'colectivo-inventado', role: 'Autore', color: 'violeta' }]
	});
	await object('material', 'sin-rol', {
		personas: [{ profile: 'colectivo-inventado', role: 'Autore' }, { profile: 'oculta-inventada' }]
	});
	await object('material', 'texto-suelto', {
		personas: ['colectivo-inventado', { profile: 'colectivo-inventado', role: 'Autore' }]
	});
	await object('material', 'ya-migrado', {
		personas: [{ profile: 'colectivo-inventado', role: 'Autore' }]
	});
	await object('evento', 'evento-inventado', {
		start: START,
		personas: [{ profile: 'colectivo-inventado', role: 'Organiza' }]
	});
	await t.db
		.prepare(
			`INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
			VALUES (?1, 'persona', ?2, 0, '{"roles":["Edita"],"at":[1]}', ?3, 'panel')`
		)
		.bind(ids['ya-migrado'], ids['oculta-inventada'], NOW)
		.run();
	// Importado de un .md y sin editar: sigue sin editar. Importado y editado: sigue editado.
	await object('material', 'importado', {
		personas: [
			{ profile: 'colectivo-inventado', role: 'Autore' },
			{ name: 'Suelte', role: 'Edita' }
		]
	});
	await object('material', 'editado', {
		personas: [{ profile: 'colectivo-inventado', role: 'Autore' }]
	});
	await t.db.batch([
		t.db.prepare('UPDATE objects SET version = 2 WHERE id = ?1').bind(ids.editado),
		t.db
			.prepare(
				`INSERT INTO content_sources (object_id, category, legacy_slug, source_hash,
					imported_version, imported_at, updated_at)
				VALUES (?1, 'material', 'Importado_Inventado', ?3, 1, ?4, ?4),
					(?2, 'material', 'editado', ?3, 1, ?4, ?4)`
			)
			.bind(ids.importado, ids.editado, 'a'.repeat(64), NOW)
	]);

	const sql = await readFile(path.join('migrations', '0043_material_personas_edges.sql'), 'utf8');
	statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await runMigration();
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

const materialType = /** @type {import('../objects/types/index.js').CoreType} */ (
	coreTypes.get('material')
);
const MIGRATED = [
	'guia-mezcla',
	'solo-perfiles',
	'forma-vieja',
	'forma-vieja-extra',
	'importado',
	'editado'
];

describe('migración 0043: personas del material → edges `persona`', () => {
	it('un edge por perfil vivo (también oculto), con sus roles y sus lugares', async () => {
		expect((await personaEdges('guia-mezcla')).map(({ slug, data }) => ({ slug, data }))).toEqual([
			{ slug: 'colectivo-inventado', data: { roles: ['Ilustra', 'Edita'], at: [1, 4] } },
			{ slug: 'oculta-inventada', data: { roles: ['Autore'], at: [3] } }
		]);
		expect((await personaEdges('guia-mezcla'))[0].createdBy).toBe('migracion-0043');
		// La forma de antes: los `at` cuentan sobre la lista única (los autores primero).
		expect((await personaEdges('forma-vieja')).map(({ slug, data }) => ({ slug, data }))).toEqual([
			{ slug: 'colectivo-inventado', data: { roles: ['Ilustra'], at: [2] } }
		]);
	});

	it('en `data` quedan los nombres y lo que no es un perfil vivo, en orden', async () => {
		expect((await dataOf('guia-mezcla')).personas).toEqual([
			{ name: 'Autore Inventade', role: 'Autore' },
			{ profile: 'borrado-inventado', role: 'Edita' },
			{ profile: 'no-existe-inventade', role: 'Traduce' },
			{ name: 'Persona Sin Perfil', role: 'Fotografía' }
		]);
		expect(await dataOf('solo-perfiles')).toEqual({ summary: 'Otra guía' });
		expect(await dataOf('forma-vieja')).toEqual({
			summary: 'Fanzine inventado',
			personas: [
				{ name: 'Autore Vieje', role: 'Autore' },
				{ name: 'Otre Autore', role: 'Autore' },
				{ name: 'Nombre Libre', role: 'Fotografía' }
			]
		});
		expect(await dataOf('forma-vieja-extra')).toEqual({
			summary: 'Video inventado',
			extra: { color: 'violeta' },
			personas: [{ name: 'Autore Inventade', role: 'Autore' }]
		});
	});

	it('el código arma la misma lista que había antes, y el tipo acepta lo que queda', async () => {
		for (const slug of MIGRATED) {
			const data = await dataOf(slug);
			expect(validateData(materialType, data).ok, slug).toBe(true);
			const edges = (await personaEdges(slug)).map(({ slug: s, data: d }) => ({
				slug: s,
				data: d
			}));
			expect(edges.length, slug).toBeGreaterThan(0);
			expect(withPersonaEdges(data, edges, 'material'), slug).toEqual(
				reshapePersonas(original[slug], 'material')
			);
		}
	});

	it('lo que no tiene perfiles vivos, tiene algo raro, ya tenía edges o es un evento, no se toca', async () => {
		for (const slug of [
			'sin-vivos',
			'fila-rara',
			'sin-rol',
			'texto-suelto',
			'ya-migrado',
			'evento-inventado'
		]) {
			expect(await dataOf(slug), slug).toEqual(original[slug]);
			expect(await version(slug), slug).toBe(1);
		}
		expect((await personaEdges('ya-migrado')).map((e) => e.slug)).toEqual(['oculta-inventada']);
		for (const slug of ['sin-vivos', 'fila-rara', 'sin-rol', 'texto-suelto', 'evento-inventado'])
			expect(await personaEdges(slug), slug).toEqual([]);
	});

	it('cada material que cambia sube su versión y deja su revisión', async () => {
		expect(await version('guia-mezcla')).toBe(2);
		expect(await version('editado')).toBe(3);
		const { results } = await t.db
			.prepare(
				`SELECT object_id, version, data, saved_by, source FROM object_revisions ORDER BY object_id`
			)
			.all();
		expect(results.map((r) => Number(r.object_id))).toEqual(MIGRATED.map((s) => ids[s]));
		const rev = results.find((r) => Number(r.object_id) === ids['guia-mezcla']);
		expect(rev).toMatchObject({ version: 2, saved_by: 'migracion-0043', source: 'migracion' });
		expect(JSON.parse(String(rev?.data))).toEqual(await dataOf('guia-mezcla'));
	});

	it('lo importado sin editar sigue sin editar; lo editado, editado', async () => {
		const sources = await t.db
			.prepare(
				`SELECT s.legacy_slug, s.imported_version, o.version FROM content_sources s
				JOIN objects o ON o.id = s.object_id ORDER BY s.legacy_slug`
			)
			.all();
		expect(sources.results).toEqual([
			{ legacy_slug: 'Importado_Inventado', imported_version: 2, version: 2 },
			{ legacy_slug: 'editado', imported_version: 1, version: 3 }
		]);
	});

	it('no deja la tabla de trabajo, y correrla de nuevo no cambia nada', async () => {
		expect(
			await t.db.prepare("SELECT name FROM sqlite_master WHERE name = 'm0043_personas'").first()
		).toBeNull();
		const first = await snapshot();
		await runMigration();
		expect(await snapshot()).toEqual(first);
	});
});
