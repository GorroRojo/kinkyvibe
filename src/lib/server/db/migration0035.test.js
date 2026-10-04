/**
 * La migración 0035 pasa a edges las relaciones de los eventos: «sucede en» (`event_venues` →
 * edge `lugar`, con el nivel propio en `edges.data`) y los perfiles de `data.personas` (→ edges
 * `persona` con roles y lugares). Se aplica sobre una base con todas las migraciones anteriores y
 * datos inventados, y se compara con lo que hace el código: la lista que arma `withPersonaEdges`
 * después de migrar es la misma que había antes (como la lee `reshapePersonas`), y lo que queda en
 * `data` lo acepta el tipo `evento`.
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
 * @param {{ deleted?: boolean }} [opts]
 */
async function object(type, slug, data, { deleted = false } = {}) {
	const row = await t.db
		.prepare(
			`INSERT INTO objects (type, slug, title, data, created_at, created_by, updated_at, updated_by,
				deleted_at)
			VALUES (?1, ?2, ?3, ?4, ?5, 'admin-inventade', ?5, 'admin-inventade', ?6) RETURNING id`
		)
		.bind(type, slug, `Título ${slug}`, JSON.stringify(data), NOW, deleted ? NOW : null)
		.first();
	ids[slug] = Number(row?.id);
	if (type === 'evento') original[slug] = data;
	return ids[slug];
}

/** @param {string} slug */
async function eventData(slug) {
	const row = await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(ids[slug]).first();
	return JSON.parse(String(row?.data));
}

/** @param {string} slug @param {string} kind */
async function edgesOf(slug, kind) {
	const { results } = await t.db
		.prepare(
			`SELECT e.data, e.created_by, e.created_at, o.slug FROM edges e JOIN objects o ON o.id = e.to_id
			WHERE e.from_id = ?1 AND e.kind = ?2 ORDER BY e.position, e.id`
		)
		.bind(ids[slug], kind)
		.all();
	return results.map((r) => ({
		slug: String(r.slug),
		data: r.data == null ? null : JSON.parse(String(r.data)),
		createdBy: r.created_by,
		createdAt: r.created_at
	}));
}

/** @param {string} slug */
const version = async (slug) =>
	Number(
		(await t.db.prepare('SELECT version FROM objects WHERE id = ?1').bind(ids[slug]).first())
			?.version
	);

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0035')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);

	await t.db
		.prepare(
			`INSERT INTO object_types (type, origin, created_at) VALUES ('perfil', 'core', ?1),
				('evento', 'core', ?1)`
		)
		.bind(NOW)
		.run();
	await object('perfil', 'colectivo-a', { kind: 'proyecto' });
	await object('perfil', 'persona-b', { kind: 'persona' });
	await object('perfil', 'borrade-c', { kind: 'persona' }, { deleted: true });
	await object('perfil', 'galpon-inventado', { kind: 'lugar', venue_privacy: 'public' });
	await object('perfil', 'casa-inventada', { kind: 'lugar', venue_privacy: 'name' });

	// La lista única, con perfiles (uno con dos roles), nombres, uno borrado y uno que no existe.
	await object('evento', 'mezcla', {
		start: START,
		personas: [
			{ name: 'Nombre Inventado', role: 'Organiza' },
			{ profile: 'colectivo-a', role: 'Facilita' },
			{ name: 'Foto Libre', role: 'Fotografía' },
			{ profile: 'persona-b', role: 'Organiza' },
			{ profile: 'colectivo-a', role: 'Enseña' },
			{ profile: 'no-existe', role: 'Organiza' },
			{ profile: 'borrade-c', role: 'Diseño' }
		]
	});
	// Solo perfiles: `personas` se va.
	await object('evento', 'solo-perfiles', {
		start: START,
		personas: [{ profile: 'persona-b', role: 'Organiza' }]
	});
	// La forma de antes (authors + extra.personas), con espacios de más y una fila vacía.
	await object('evento', 'forma-vieja', {
		start: START,
		authors: ['Organizadore Uno', ' Organizadore Dos '],
		extra: {
			personas: [
				{ perfil: 'colectivo-a', rol: 'Facilita' },
				{ nombre: 'Libre', rol: 'Fotografía' },
				{ perfil: '', rol: '' }
			],
			color: 'violeta'
		}
	});
	// Forma vieja sin otros datos en `extra`: `extra` se va.
	await object('evento', 'forma-vieja-sola', {
		start: START,
		authors: ['Organizadore Uno'],
		extra: { personas: [{ perfil: 'persona-b', rol: 'Enseña' }] }
	});
	// Sin perfiles vivos: no se tocan.
	await object('evento', 'sin-perfiles', {
		start: START,
		personas: [
			{ name: 'Nombre Inventado', role: 'Organiza' },
			{ profile: 'no-existe', role: 'Facilita' }
		]
	});
	await object('evento', 'forma-vieja-sin-perfiles', {
		start: START,
		authors: ['Organizadore Uno'],
		extra: { personas: [{ perfil: 'no-existe', rol: 'Facilita' }] }
	});
	// Importado de un .md y sin editar: sigue sin editar.
	await object('evento', 'importado', {
		start: START,
		personas: [{ profile: 'colectivo-a', role: 'Organiza' }]
	});
	await t.db
		.prepare(
			`INSERT INTO content_sources (object_id, category, legacy_slug, source_hash, imported_version,
				imported_at, updated_at)
			VALUES (?1, 'calendario', 'Importado_2026-BDSM', ?2, 1, ?3, ?3)`
		)
		.bind(ids.importado, 'a'.repeat(64), NOW)
		.run();
	// Importado y editado después (versión 2, importado en la 1): sigue editado.
	await object('evento', 'editado', {
		start: START,
		personas: [{ profile: 'colectivo-a', role: 'Organiza' }]
	});
	await t.db.batch([
		t.db.prepare('UPDATE objects SET version = 2 WHERE id = ?1').bind(ids.editado),
		t.db
			.prepare(
				`INSERT INTO content_sources (object_id, category, legacy_slug, source_hash,
					imported_version, imported_at, updated_at)
				VALUES (?1, 'calendario', 'editado', ?2, 1, ?3, ?3)`
			)
			.bind(ids.editado, 'b'.repeat(64), NOW)
	]);
	// Ya tiene un edge `persona` (lo guardó el código nuevo): no se toca.
	await object('evento', 'ya-migrado', {
		start: START,
		personas: [{ profile: 'persona-b', role: 'Organiza' }]
	});
	await object('evento', 'con-lugar', { start: START });
	await t.db
		.prepare(
			`INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by) VALUES
				(?1, 'persona', ?2, 0, '{"roles":["Facilita"],"at":[0]}', ?4, 'panel'),
				(?3, 'lugar', ?5, 0, NULL, ?4, 'panel')`
		)
		.bind(ids['ya-migrado'], ids['colectivo-a'], ids['con-lugar'], NOW, ids['galpon-inventado'])
		.run();

	// «Sucede en»: por la dirección vieja del .md, por la del objeto, de un evento que la base no
	// tiene, y de uno que ya tiene edge `lugar`.
	const link = (/** @type {string} */ slug, /** @type {string} */ venue, privacy = null) =>
		t.db
			.prepare(
				`INSERT INTO event_venues (event_slug, venue_id, privacy, created_at, created_by, updated_at,
					updated_by)
				VALUES (?1, ?2, ?3, ?4, 'admin-que-vinculo', ?5, 'otre-admin')`
			)
			.bind(slug, ids[venue], privacy, NOW - 1000, NOW);
	await t.db.batch([
		link('Importado_2026-BDSM', 'casa-inventada', /** @type {any} */ ('hidden')),
		link('mezcla', 'galpon-inventado'),
		link('solo-perfiles', 'casa-inventada', /** @type {any} */ ('address')),
		link('no-esta-en-la-base', 'galpon-inventado'),
		link('con-lugar', 'casa-inventada', /** @type {any} */ ('name')),
		// Un evento importado se busca por su dirección vieja, no por la del objeto.
		link('importado', 'galpon-inventado')
	]);

	const sql = await readFile(path.join('migrations', '0035_relaciones_edges.sql'), 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await t.db.batch(statements.map((s) => t.db.prepare(s)));
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

const evento = /** @type {import('../objects/types/index.js').CoreType} */ (
	coreTypes.get('evento')
);

describe('migración 0035: «sucede en» → edges `lugar`', () => {
	it('cada vínculo de un evento en la base es un edge con su nivel, su fecha y quién lo hizo', async () => {
		expect(await edgesOf('importado', 'lugar')).toEqual([
			{
				slug: 'casa-inventada',
				data: { privacy: 'hidden' },
				createdBy: 'admin-que-vinculo',
				createdAt: NOW - 1000
			}
		]);
		expect(await edgesOf('mezcla', 'lugar')).toEqual([
			expect.objectContaining({ slug: 'galpon-inventado', data: null })
		]);
		expect(await edgesOf('solo-perfiles', 'lugar')).toEqual([
			expect.objectContaining({ slug: 'casa-inventada', data: { privacy: 'address' } })
		]);
	});

	it('no pisa un lugar que ya era edge ni inventa eventos', async () => {
		expect(await edgesOf('con-lugar', 'lugar')).toEqual([
			expect.objectContaining({ slug: 'galpon-inventado', data: null, createdBy: 'panel' })
		]);
		const { results } = await t.db
			.prepare("SELECT count(*) AS n FROM edges WHERE kind = 'lugar'")
			.all();
		expect(results[0].n).toBe(4);
	});

	it('la tabla vieja queda como estaba', async () => {
		const { results } = await t.db.prepare('SELECT count(*) AS n FROM event_venues').all();
		expect(results[0].n).toBe(6);
	});
});

describe('migración 0035: personas → edges `persona`', () => {
	it('un edge por perfil vivo, con sus roles y sus lugares', async () => {
		expect((await edgesOf('mezcla', 'persona')).map(({ slug, data }) => ({ slug, data }))).toEqual([
			{ slug: 'colectivo-a', data: { roles: ['Facilita', 'Enseña'], at: [1, 4] } },
			{ slug: 'persona-b', data: { roles: ['Organiza'], at: [3] } }
		]);
		expect((await edgesOf('mezcla', 'persona'))[0].createdBy).toBe('migracion-0035');
	});

	it('en `data` quedan los nombres y las direcciones sin perfil vivo, en orden', async () => {
		expect((await eventData('mezcla')).personas).toEqual([
			{ name: 'Nombre Inventado', role: 'Organiza' },
			{ name: 'Foto Libre', role: 'Fotografía' },
			{ profile: 'no-existe', role: 'Organiza' },
			{ profile: 'borrade-c', role: 'Diseño' }
		]);
		expect(await eventData('solo-perfiles')).toEqual({ start: START });
	});

	it('la forma de antes pasa a la lista única (como al guardarla)', async () => {
		expect(await eventData('forma-vieja')).toEqual({
			start: START,
			extra: { color: 'violeta' },
			personas: [
				{ name: 'Organizadore Uno', role: 'Organiza' },
				{ name: 'Organizadore Dos', role: 'Organiza' },
				{ name: 'Libre', role: 'Fotografía' }
			]
		});
		expect((await edgesOf('forma-vieja', 'persona')).map((e) => e.data)).toEqual([
			{ roles: ['Facilita'], at: [2] }
		]);
		expect(await eventData('forma-vieja-sola')).toEqual({
			start: START,
			personas: [{ name: 'Organizadore Uno', role: 'Organiza' }]
		});
	});

	it('el código arma la misma lista que había antes, y el tipo acepta lo que queda', async () => {
		for (const slug of [
			'mezcla',
			'solo-perfiles',
			'forma-vieja',
			'forma-vieja-sola',
			'importado'
		]) {
			const data = await eventData(slug);
			expect(validateData(evento, data).ok, slug).toBe(true);
			const edges = (await edgesOf(slug, 'persona')).map(({ slug: s, data: d }) => ({
				slug: s,
				data: d
			}));
			expect(withPersonaEdges(data, edges).personas, slug).toEqual(
				reshapePersonas(original[slug], 'calendario').personas
			);
		}
	});

	it('lo que no tiene perfiles vivos, o ya tenía edges, no se toca', async () => {
		for (const slug of ['sin-perfiles', 'forma-vieja-sin-perfiles', 'ya-migrado', 'con-lugar']) {
			expect(await eventData(slug), slug).toEqual(original[slug]);
			expect(await version(slug), slug).toBe(1);
		}
		expect((await edgesOf('ya-migrado', 'persona')).map((e) => e.slug)).toEqual(['colectivo-a']);
	});

	it('cada evento que cambia sube su versión y deja su revisión', async () => {
		expect(await version('mezcla')).toBe(2);
		expect(await version('editado')).toBe(3);
		const { results } = await t.db
			.prepare(
				`SELECT object_id, version, data, saved_by, source FROM object_revisions ORDER BY object_id`
			)
			.all();
		expect(results.map((r) => Number(r.object_id))).toEqual(
			['mezcla', 'solo-perfiles', 'forma-vieja', 'forma-vieja-sola', 'importado', 'editado'].map(
				(s) => ids[s]
			)
		);
		const rev = results.find((r) => Number(r.object_id) === ids.mezcla);
		expect(rev).toMatchObject({ version: 2, saved_by: 'migracion-0035', source: 'migracion' });
		expect(JSON.parse(String(rev?.data))).toEqual(await eventData('mezcla'));
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

	it('no deja la tabla de trabajo', async () => {
		expect(
			await t.db.prepare("SELECT name FROM sqlite_master WHERE name = 'm0035_personas'").first()
		).toBeNull();
	});
});
