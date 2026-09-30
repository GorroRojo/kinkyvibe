/**
 * saveObject contra un D1 real de miniflare: crear, editar, conflicto de versión, slugs,
 * edges y foreign keys.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '../db/testing.js';
import { ObjectError, VersionConflictError } from './errors.js';
import { getEdges } from './edges.js';
import { saveObject, slugify } from './save.js';

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

const ADMIN = { role: /** @type {const} */ ('admin'), id: 'admin-inventade' };
const ctx = { actor: 'admin-inventade', now: Date.parse('2026-10-01T12:00:00Z') };
const START = '2026-10-02T20:00-03:00';

/** @param {Record<string, unknown>} [extra] */
function newLugar(extra = {}) {
	return saveObject(t.db, { type: 'lugar', title: 'Salón Inventado', ...extra }, ctx);
}

/**
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<any>}
 */
async function caught(fn) {
	try {
		await fn();
	} catch (error) {
		return error;
	}
	throw new Error('se esperaba un error');
}

describe('crear y editar', () => {
	it('crea con versión 1, slug desde el título y registra el tipo núcleo', async () => {
		const o = await saveObject(
			t.db,
			{
				type: 'evento',
				title: '¡Córdoba! Taller Inventado',
				data: { start: START, summary: ' hola ' }
			},
			ctx
		);
		expect(o).toMatchObject({
			type: 'evento',
			slug: 'cordoba-taller-inventado',
			version: 1,
			visibility: 'public',
			data: { start: START, summary: 'hola' },
			created_by: 'admin-inventade',
			deleted_at: null
		});
		const type = await t.db
			.prepare("SELECT origin FROM object_types WHERE type = 'evento'")
			.first();
		expect(type).toEqual({ origin: 'core' });
	});

	it('editar sube la versión; lo que no se manda queda como estaba', async () => {
		const o = await newLugar({ data: { city: 'Ciudad Inventada' } });
		const e = await saveObject(
			t.db,
			{ id: o.id, type: 'lugar', version: 1, title: 'Otro nombre' },
			ctx
		);
		expect(e).toMatchObject({
			version: 2,
			title: 'Otro nombre',
			slug: o.slug,
			data: { city: 'Ciudad Inventada' }
		});
	});

	it('datos inválidos: error con cada campo, y no se guarda nada', async () => {
		const err = await caught(() =>
			saveObject(
				t.db,
				{ type: 'evento', title: '', slug: 'Con Espacios', data: { start: 'mañana' } },
				ctx
			)
		);
		expect(err).toBeInstanceOf(ObjectError);
		expect(err.code).toBe('invalid');
		expect(err.errors.map((/** @type {any} */ e) => e.path).sort()).toEqual([
			'slug',
			'start',
			'title'
		]);
		const n = await t.db.prepare('SELECT count(*) AS n FROM objects').first();
		expect(n).toEqual({ n: 0 });
	});

	it('tipo desconocido, sin actor, sin versión al editar, id inexistente', async () => {
		expect((await caught(() => saveObject(t.db, { type: 'nave', title: 'x' }, ctx))).code).toBe(
			'unknown_type'
		);
		expect(
			(await caught(() => saveObject(t.db, { type: 'lugar', title: 'x' }, { actor: '' }))).code
		).toBe('invalid');
		const o = await newLugar();
		expect((await caught(() => saveObject(t.db, { id: o.id, type: 'lugar' }, ctx))).code).toBe(
			'invalid'
		);
		expect(
			(await caught(() => saveObject(t.db, { id: 999, type: 'lugar', version: 1 }, ctx))).status
		).toBe(404);
		expect(
			(await caught(() => saveObject(t.db, { id: o.id, type: 'evento', version: 1 }, ctx))).code
		).toBe('invalid');
	});

	it('slug repetido dentro del tipo: 409; en otro tipo se puede', async () => {
		await newLugar({ slug: 'mismo' });
		const err = await caught(() => newLugar({ slug: 'mismo' }));
		expect(err).toMatchObject({ code: 'slug_taken', status: 409 });
		const ev = await saveObject(
			t.db,
			{ type: 'evento', title: 'x', slug: 'mismo', data: { start: START } },
			ctx
		);
		expect(ev.slug).toBe('mismo');
	});

	it('borrar es suave y se deshace', async () => {
		const o = await newLugar();
		const gone = await saveObject(
			t.db,
			{ id: o.id, type: 'lugar', version: 1, deleted: true },
			ctx
		);
		expect(gone.deleted_at).toBe(ctx.now);
		const back = await saveObject(
			t.db,
			{ id: o.id, type: 'lugar', version: 2, deleted: false },
			ctx
		);
		expect(back).toMatchObject({ deleted_at: null, version: 3 });
	});

	it('slugify saca tildes y signos', () => {
		expect(slugify('  ¡Ñandú  Picante! 2026 ')).toBe('nandu-picante-2026');
	});
});

describe('versión (edición concurrente)', () => {
	it('guardar con una versión vieja falla con un error claro y no pisa nada', async () => {
		const o = await newLugar();
		await saveObject(t.db, { id: o.id, type: 'lugar', version: 1, title: 'Cambio de Ale' }, ctx);
		const err = await caught(() =>
			saveObject(t.db, { id: o.id, type: 'lugar', version: 1, title: 'Cambio de Sol' }, ctx)
		);
		expect(err).toBeInstanceOf(VersionConflictError);
		expect(err).toMatchObject({ code: 'version_conflict', status: 409, expected: 1, current: 2 });
		expect(err.message).toMatch(/Recargá/);
		const row = await t.db
			.prepare('SELECT title, version FROM objects WHERE id = ?1')
			.bind(o.id)
			.first();
		expect(row).toEqual({ title: 'Cambio de Ale', version: 2 });
	});

	it('si otro guardado se mete entre la lectura y la escritura, el trigger aborta toda la tanda', async () => {
		const place = await newLugar({ slug: 'lugar-a' });
		const other = await newLugar({ slug: 'lugar-b' });
		const ev = await saveObject(
			t.db,
			{ type: 'evento', title: 'Evento', data: { start: START }, edges: { lugar: [place.id] } },
			ctx
		);
		// Una base que, justo antes de escribir, deja pasar otro guardado del mismo objeto.
		const racing = /** @type {import('@cloudflare/workers-types').D1Database} */ (
			/** @type {unknown} */ ({
				prepare: (/** @type {string} */ sql) => t.db.prepare(sql),
				batch: async (/** @type {any[]} */ statements) => {
					await saveObject(
						t.db,
						{ id: ev.id, type: 'evento', version: 1, title: 'Ganó el otro' },
						ctx
					);
					return t.db.batch(statements);
				}
			})
		);
		const err = await caught(() =>
			saveObject(
				racing,
				{ id: ev.id, type: 'evento', version: 1, title: 'Perdió', edges: { lugar: [other.id] } },
				ctx
			)
		);
		expect(err).toBeInstanceOf(VersionConflictError);
		expect(err.current).toBe(2);
		const row = await t.db
			.prepare('SELECT title, version FROM objects WHERE id = ?1')
			.bind(ev.id)
			.first();
		expect(row).toEqual({ title: 'Ganó el otro', version: 2 });
		// Los edges de la tanda abortada tampoco se escribieron.
		const edges = await getEdges(t.db, ev.id, ADMIN);
		expect(edges.map((e) => e.object.id)).toEqual([place.id]);
	});

	it('la base misma rechaza un UPDATE que no sube la versión en 1', async () => {
		const o = await newLugar();
		await expect(
			t.db.prepare("UPDATE objects SET title = 'x' WHERE id = ?1").bind(o.id).run()
		).rejects.toThrow(/objects_version_conflict/);
		await expect(
			t.db.prepare("UPDATE objects SET title = 'x', version = 5 WHERE id = ?1").bind(o.id).run()
		).rejects.toThrow(/objects_version_conflict/);
	});
});

describe('edges y foreign keys', () => {
	it('crea edges junto con el objeto nuevo y los reemplaza al editar', async () => {
		const a = await newLugar({ slug: 'a' });
		const b = await newLugar({ slug: 'b' });
		const ev = await saveObject(
			t.db,
			{
				type: 'evento',
				title: 'Evento',
				data: { start: START },
				edges: { lugar: [{ to: a.id, data: { sala: 'Sala 2' } }] }
			},
			ctx
		);
		let edges = await getEdges(t.db, ev.id, ADMIN);
		expect(edges.map((e) => [e.kind, e.object.id, e.data])).toEqual([
			['lugar', a.id, { sala: 'Sala 2' }]
		]);

		await saveObject(
			t.db,
			{ id: ev.id, type: 'evento', version: 1, edges: { lugar: [b.id] } },
			ctx
		);
		edges = await getEdges(t.db, ev.id, ADMIN);
		expect(edges.map((e) => e.object.id)).toEqual([b.id]);

		// Sin `edges` en el guardado: quedan como están. Con lista vacía: se sacan.
		await saveObject(t.db, { id: ev.id, type: 'evento', version: 2, title: 'Otro' }, ctx);
		expect((await getEdges(t.db, ev.id, ADMIN)).length).toBe(1);
		await saveObject(t.db, { id: ev.id, type: 'evento', version: 3, edges: { lugar: [] } }, ctx);
		expect(await getEdges(t.db, ev.id, ADMIN)).toEqual([]);
	});

	it('valida kind, cantidad, tipo del destino y que exista', async () => {
		const a = await newLugar({ slug: 'a' });
		const b = await newLugar({ slug: 'b' });
		const ev = await saveObject(t.db, { type: 'evento', title: 'E', data: { start: START } }, ctx);
		/** @param {any} edges */
		const save = (edges) =>
			saveObject(t.db, { type: 'evento', title: 'X', data: { start: START }, edges }, ctx);
		expect((await caught(() => save({ organiza: [a.id] }))).code).toBe('invalid');
		expect((await caught(() => save({ lugar: [a.id, b.id] }))).code).toBe('invalid');
		expect((await caught(() => save({ lugar: [ev.id] }))).code).toBe('invalid_reference');
		expect((await caught(() => save({ lugar: [9999] }))).code).toBe('invalid_reference');
		expect((await caught(() => save({ lugar: ['1'] }))).code).toBe('invalid');
		const gone = await saveObject(
			t.db,
			{ id: a.id, type: 'lugar', version: 1, deleted: true },
			ctx
		);
		expect((await caught(() => save({ lugar: [gone.id] }))).code).toBe('invalid_reference');
	});

	it('D1 hace cumplir las foreign keys (y no se pueden apagar)', async () => {
		const a = await newLugar();
		const insertEdge = (/** @type {number} */ to) =>
			t.db
				.prepare(
					"INSERT INTO edges (from_id, kind, to_id, created_at, created_by) VALUES (?1, 'lugar', ?2, 0, 'test')"
				)
				.bind(a.id, to)
				.run();
		await expect(insertEdge(9999)).rejects.toThrow(/FOREIGN KEY/);
		await t.db.prepare('PRAGMA foreign_keys = OFF').run();
		expect(await t.db.prepare('PRAGMA foreign_keys').first()).toEqual({ foreign_keys: 1 });
		await expect(insertEdge(9999)).rejects.toThrow(/FOREIGN KEY/);
		// Un objeto de un tipo que no está en object_types, tampoco.
		await expect(
			t.db
				.prepare(
					"INSERT INTO objects (type, slug, title, created_at, created_by, updated_at, updated_by) VALUES ('nave', 'x', 'x', 0, 't', 0, 't')"
				)
				.run()
		).rejects.toThrow(/FOREIGN KEY/);
	});

	it('purgar un objeto (DELETE de verdad) se lleva sus edges; un tipo en uso no se borra', async () => {
		const a = await newLugar();
		const ev = await saveObject(
			t.db,
			{ type: 'evento', title: 'E', data: { start: START }, edges: { lugar: [a.id] } },
			ctx
		);
		await t.db.prepare('DELETE FROM objects WHERE id = ?1').bind(a.id).run();
		expect(await t.db.prepare('SELECT count(*) AS n FROM edges').first()).toEqual({ n: 0 });
		expect(ev.id).toBeGreaterThan(0);
		await expect(
			t.db.prepare("DELETE FROM object_types WHERE type = 'evento'").run()
		).rejects.toThrow(/FOREIGN KEY/);
	});
});
