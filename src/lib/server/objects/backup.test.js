/**
 * Backup de los objetos ida y vuelta con el esquema real (migración 0012): el volcado no copia
 * las tablas sombra de `objects_fts`, la recrea con 'rebuild' al final, y en la base restaurada
 * andan la búsqueda, el chequeo de integridad, las foreign keys y el control de versión.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { dumpDatabase } from '../backup/dump.js';
import { createTestDB } from '../db/testing.js';
import { VersionConflictError } from './errors.js';
import { checkObjectsIntegrity } from './integrity.js';
import { getEdges } from './edges.js';
import { searchObjects } from './read.js';
import { saveObject } from './save.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ADMIN = { role: /** @type {const} */ ('admin'), id: 'admin-inventade' };
const ctx = { actor: 'admin-inventade', now: Date.parse('2026-10-01T12:00:00Z') };

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let source;
/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let target;
/** @type {Record<string, number>} */
const ids = {};

beforeAll(async () => {
	source = await createTestDB();
	const lugar = await saveObject(
		source.db,
		{ type: 'lugar', title: 'Galpón Ñandú', data: { city: 'Córdoba Inventada' } },
		ctx
	);
	const borrado = await saveObject(source.db, { type: 'lugar', title: 'Lugar que se borra' }, ctx);
	await saveObject(source.db, { id: borrado.id, type: 'lugar', version: 1, deleted: true }, ctx);
	const evento = await saveObject(
		source.db,
		{
			type: 'evento',
			title: 'Taller de nudos inventado',
			visibility: 'members',
			data: { start: '2026-10-02T20:00-03:00', body: "Con comillas 'simples' y; punto y coma" },
			edges: { lugar: [lugar.id] }
		},
		ctx
	);
	// Una edición más, para que el índice tenga borrados y reinserciones.
	await saveObject(
		source.db,
		{ id: evento.id, type: 'evento', version: 1, title: 'Taller de nudos (edición 2)' },
		ctx
	);
	Object.assign(ids, { lugar: lugar.id, borrado: borrado.id, evento: evento.id });
	target = await createTestDB({ migrate: false });
});
afterAll(async () => {
	await source?.dispose();
	await target?.dispose();
});

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function rows(db) {
	const objects = await db.prepare('SELECT * FROM objects ORDER BY id').all();
	const edges = await db.prepare('SELECT * FROM edges ORDER BY id').all();
	const types = await db.prepare('SELECT * FROM object_types ORDER BY type').all();
	return { objects: objects.results, edges: edges.results, types: types.results };
}

describe('backup de objetos', () => {
	it('ida y vuelta: mismas filas, índice reconstruido, reglas activas', async () => {
		const { sql, stats } = await dumpDatabase(source.db, { now: new Date(ctx.now) });

		// Las tablas sombra no se copian; la FTS externa se reconstruye al final, después de los
		// triggers (que no se disparan al restaurar porque se crean después de las filas).
		const shadow = Object.keys(stats.perTable).filter((n) => n.startsWith('objects_fts'));
		expect(shadow).toEqual([]);
		expect(stats.rebuilt).toEqual(['objects_fts']);
		expect(sql).not.toMatch(/INSERT INTO "objects_fts_(data|idx|docsize|config)"/);
		const rebuildAt = sql.indexOf(
			'INSERT INTO "objects_fts" ("objects_fts") VALUES (\'rebuild\');'
		);
		const triggerAt = sql.search(/CREATE TRIGGER (?:IF NOT EXISTS )?objects_fts_update/);
		expect(triggerAt).toBeGreaterThan(0);
		expect(rebuildAt).toBeGreaterThan(triggerAt);
		expect(stats.perTable).toMatchObject({ objects: 3, edges: 1, object_types: 2 });

		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await target.db.batch(statements.map((s) => target.db.prepare(s)));

		expect(await rows(target.db)).toEqual(await rows(source.db));
		expect(await checkObjectsIntegrity(target.db)).toEqual([]);

		// La búsqueda anda (sin tildes, con prefijo) y respeta la visibilidad.
		const found = await searchObjects(target.db, 'nandu', ADMIN);
		expect(found.map((o) => o.id)).toEqual([ids.lugar]);
		expect((await searchObjects(target.db, 'edicion', ADMIN)).map((o) => o.id)).toEqual([
			ids.evento
		]);
		expect(await searchObjects(target.db, 'edicion', { role: 'anon' })).toEqual([]);
		expect(await searchObjects(target.db, 'borra', ADMIN)).toEqual([]);

		expect((await getEdges(target.db, ids.evento, ADMIN)).map((e) => e.object.id)).toEqual([
			ids.lugar
		]);

		// Después de restaurar se sigue guardando: la versión se controla y los triggers de
		// búsqueda siguen andando; los ids nuevos no reusan los viejos.
		await expect(
			saveObject(target.db, { id: ids.evento, type: 'evento', version: 1, title: 'x' }, ctx)
		).rejects.toBeInstanceOf(VersionConflictError);
		const nuevo = await saveObject(target.db, { type: 'lugar', title: 'Sótano Zapallo' }, ctx);
		expect(nuevo.id).toBeGreaterThan(ids.evento);
		expect((await searchObjects(target.db, 'zapallo', ADMIN)).map((o) => o.id)).toEqual([nuevo.id]);
		expect(await checkObjectsIntegrity(target.db)).toEqual([]);
		await expect(
			target.db
				.prepare(
					"INSERT INTO edges (from_id, kind, to_id, created_at, created_by) VALUES (?1, 'lugar', 9999, 0, 't')"
				)
				.bind(ids.evento)
				.run()
		).rejects.toThrow(/FOREIGN KEY/);
	});
});
