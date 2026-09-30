/**
 * Las reglas de visibilidad, y que `canSee` (en JS) y `visibleWhere` (en SQL) digan exactamente
 * lo mismo para cada combinación de rol, visibilidad y borrado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '../db/testing.js';
import { getEdges } from './edges.js';
import { getObject, searchObjects } from './read.js';
import { saveObject } from './save.js';
import { ANON, canSee, visibleWhere } from './visibility.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

/** @type {import('./visibility.js').Viewer} */
const member = { role: 'member', id: 'cuenta-inventada' };
/** @type {import('./visibility.js').Viewer} */
const admin = { role: 'admin', id: 'admin-inventade' };

describe('canSee', () => {
	it('visible por defecto; members solo con cuenta; hidden solo admins', () => {
		const pub = { visibility: 'public', deleted_at: null };
		const mem = { visibility: 'members', deleted_at: null };
		const hid = { visibility: 'hidden', deleted_at: null };
		expect([pub, mem, hid].map((o) => canSee(o, ANON))).toEqual([true, false, false]);
		expect([pub, mem, hid].map((o) => canSee(o, member))).toEqual([true, true, false]);
		expect([pub, mem, hid].map((o) => canSee(o, admin))).toEqual([true, true, true]);
	});

	it('lo borrado no lo ve nadie, salvo admins que lo piden para deshacer', () => {
		const gone = { visibility: 'public', deleted_at: 1 };
		expect(canSee(gone, ANON)).toBe(false);
		expect(canSee(gone, admin)).toBe(false);
		expect(canSee(gone, member, { includeDeleted: true })).toBe(false);
		expect(canSee(gone, admin, { includeDeleted: true })).toBe(true);
	});

	it('ante la duda no se muestra (rol o visibilidad desconocidos, sin viewer)', () => {
		expect(canSee({ visibility: 'secreto' }, admin)).toBe(false);
		expect(canSee({ visibility: 'members' }, /** @type {any} */ ({ role: 'dios' }))).toBe(false);
		expect(canSee({ visibility: 'public' }, null)).toBe(true);
		expect(canSee({ visibility: 'members' }, undefined)).toBe(false);
	});

	it('visibleWhere no acepta alias raros (no se arma SQL con texto de afuera)', () => {
		expect(() => visibleWhere(ANON, 'o; DROP TABLE objects')).toThrow(/alias/);
	});
});

describe('en la base', () => {
	/** @type {Record<string, number>} */
	const ids = {};

	beforeAll(async () => {
		const ctx = { actor: 'admin-inventade' };
		for (const visibility of /** @type {const} */ (['public', 'members', 'hidden'])) {
			for (const deleted of [false, true]) {
				const slug = `lugar-${visibility}-${deleted ? 'borrado' : 'vivo'}`;
				const o = await saveObject(
					t.db,
					{ type: 'lugar', title: `Salón zanahoria ${slug}`, slug, visibility },
					ctx
				);
				ids[slug] = deleted
					? (
							await saveObject(
								t.db,
								{ id: o.id, type: 'lugar', version: o.version, deleted: true },
								ctx
							)
						).id
					: o.id;
			}
		}
		const ev = await saveObject(
			t.db,
			{
				type: 'evento',
				title: 'Evento inventado',
				data: { start: '2026-10-02T20:00-03:00' },
				edges: { lugar: [ids['lugar-hidden-vivo']] }
			},
			ctx
		);
		ids.evento = ev.id;
	});

	/** @type {[string, import('./visibility.js').Viewer, boolean][]} */
	const cases = [
		['anon', ANON, false],
		['member', member, false],
		['admin', admin, false],
		['admin + borrados', admin, true],
		['member + borrados (no le da nada extra)', member, true]
	];

	it.each(cases)('canSee y visibleWhere coinciden: %s', async (_name, viewer, includeDeleted) => {
		const { results } = await t.db
			.prepare(
				`SELECT id, visibility, deleted_at FROM objects WHERE type = 'lugar' AND ${visibleWhere(viewer, 'objects', { includeDeleted })} ORDER BY id`
			)
			.all();
		const { results: all } = await t.db
			.prepare("SELECT id, visibility, deleted_at FROM objects WHERE type = 'lugar' ORDER BY id")
			.all();
		const expected = all.filter((o) => canSee(/** @type {any} */ (o), viewer, { includeDeleted }));
		expect(results.map((r) => r.id)).toEqual(expected.map((r) => r.id));
		expect(expected.length).toBeGreaterThan(0);
	});

	it('getObject devuelve null (no "prohibido") si no se puede ver', async () => {
		expect(await getObject(t.db, { id: ids['lugar-hidden-vivo'] }, ANON)).toBeNull();
		expect(await getObject(t.db, { id: ids['lugar-hidden-vivo'] }, admin)).toMatchObject({
			visibility: 'hidden'
		});
		expect(
			await getObject(t.db, { type: 'lugar', slug: 'lugar-members-vivo' }, member)
		).not.toBeNull();
		expect(await getObject(t.db, { id: ids['lugar-public-borrado'] }, admin)).toBeNull();
		expect(
			await getObject(t.db, { id: ids['lugar-public-borrado'] }, admin, { includeDeleted: true })
		).not.toBeNull();
	});

	it('la búsqueda aplica la misma regla', async () => {
		const titles = async (/** @type {any} */ v) =>
			(await searchObjects(t.db, 'zanahoria', v)).map((o) => o.slug).sort();
		expect(await titles(ANON)).toEqual(['lugar-public-vivo']);
		expect(await titles(member)).toEqual(['lugar-members-vivo', 'lugar-public-vivo']);
		expect(await titles(admin)).toEqual([
			'lugar-hidden-vivo',
			'lugar-members-vivo',
			'lugar-public-vivo'
		]);
		// Operadores de FTS5 en lo que escribe la persona no rompen la consulta.
		expect(await searchObjects(t.db, 'zanahoria" OR "x', ANON)).toEqual([]);
	});

	it('un edge hacia algo oculto no se muestra a quien no lo puede ver', async () => {
		expect(await getEdges(t.db, ids.evento, ANON)).toEqual([]);
		const seen = await getEdges(t.db, ids.evento, admin);
		expect(seen.map((e) => [e.kind, e.object.slug])).toEqual([['lugar', 'lugar-hidden-vivo']]);
		const incoming = await getEdges(t.db, ids['lugar-hidden-vivo'], admin, { direction: 'in' });
		expect(incoming.map((e) => e.object.id)).toEqual([ids.evento]);
	});
});
