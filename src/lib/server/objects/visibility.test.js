/**
 * Las reglas de visibilidad, y que `canSee` (en JS) y `visibleWhere` (en SQL) digan exactamente
 * lo mismo para cada combinación de rol (anónime, autore sin ser admin, otre con cuenta, admin),
 * visibilidad y borrado.
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
const creator = { role: 'member', id: 'cuenta-autora' };
/** @type {import('./visibility.js').Viewer} */
const admin = { role: 'admin', id: 'admin-inventade' };

describe('canSee', () => {
	it('visible por defecto; members solo con cuenta; hidden solo admins y quien lo creó', () => {
		const by = 'cuenta-autora';
		const pub = { visibility: 'public', deleted_at: null, created_by: by };
		const mem = { visibility: 'members', deleted_at: null, created_by: by };
		const hid = { visibility: 'hidden', deleted_at: null, created_by: by };
		expect([pub, mem, hid].map((o) => canSee(o, ANON))).toEqual([true, false, false]);
		expect([pub, mem, hid].map((o) => canSee(o, member))).toEqual([true, true, false]);
		expect([pub, mem, hid].map((o) => canSee(o, creator))).toEqual([true, true, true]);
		expect([pub, mem, hid].map((o) => canSee(o, admin))).toEqual([true, true, true]);
	});

	it('lo borrado no lo ve nadie, salvo admins que lo piden para deshacer (ni quien lo creó)', () => {
		const gone = { visibility: 'public', deleted_at: 1, created_by: 'cuenta-autora' };
		expect(canSee(gone, ANON)).toBe(false);
		expect(canSee(gone, admin)).toBe(false);
		expect(canSee(gone, creator)).toBe(false);
		expect(canSee(gone, creator, { includeDeleted: true })).toBe(false);
		expect(canSee(gone, member, { includeDeleted: true })).toBe(false);
		expect(canSee(gone, admin, { includeDeleted: true })).toBe(true);
	});

	it('ante la duda no se muestra (rol o visibilidad desconocidos, sin viewer, id vacío)', () => {
		expect(canSee({ visibility: 'secreto' }, admin)).toBe(false);
		expect(canSee({ visibility: 'members' }, /** @type {any} */ ({ role: 'dios' }))).toBe(false);
		expect(canSee({ visibility: 'public' }, null)).toBe(true);
		expect(canSee({ visibility: 'members' }, undefined)).toBe(false);
		// Un "anónime" con id no cuenta como autore; un id vacío tampoco.
		const hid = { visibility: 'hidden', created_by: '' };
		expect(canSee(hid, { role: 'member', id: '' })).toBe(false);
		expect(
			canSee({ ...hid, created_by: 'x' }, /** @type {any} */ ({ role: 'anon', id: 'x' }))
		).toBe(false);
	});

	it('visibleWhere no acepta alias raros y pasa el id como parámetro, nunca en el SQL', () => {
		expect(() => visibleWhere(ANON, 'o; DROP TABLE objects')).toThrow(/alias/);
		const sneaky = /** @type {import('./visibility.js').Viewer} */ ({
			role: 'member',
			id: "x' OR 1=1 --"
		});
		const where = visibleWhere(sneaky, 'o');
		expect(where.sql).not.toContain('OR 1=1');
		expect(where.params).toEqual(["x' OR 1=1 --"]);
		expect(visibleWhere(ANON, 'o').params).toEqual([]);
		expect(visibleWhere(admin, 'o').params).toEqual([]);
	});
});

describe('en la base', () => {
	/** @type {Record<string, number>} */
	const ids = {};
	const AUTHORS = /** @type {const} */ (['admin-inventade', 'cuenta-autora']);

	beforeAll(async () => {
		for (const actor of AUTHORS) {
			const ctx = { actor };
			for (const visibility of /** @type {const} */ (['public', 'members', 'hidden'])) {
				for (const deleted of [false, true]) {
					const slug = `lugar-${actor}-${visibility}-${deleted ? 'borrado' : 'vivo'}`;
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
		}
		const ctx = { actor: 'admin-inventade' };
		const ev = await saveObject(
			t.db,
			{
				type: 'evento',
				title: 'Evento inventado',
				data: { start: '2026-10-02T20:00-03:00' },
				edges: { lugar: [ids['lugar-cuenta-autora-hidden-vivo']] }
			},
			ctx
		);
		ids.evento = ev.id;
	});

	/** @type {[string, import('./visibility.js').Viewer, boolean][]} */
	const cases = [
		['anon', ANON, false],
		['otre con cuenta', member, false],
		['autore sin ser admin', creator, false],
		['admin', admin, false],
		['admin + borrados', admin, true],
		['otre con cuenta + borrados (no le da nada extra)', member, true],
		['autore + borrados (no le da nada extra)', creator, true]
	];

	it.each(cases)('canSee y visibleWhere coinciden: %s', async (_name, viewer, includeDeleted) => {
		const where = visibleWhere(viewer, 'objects', { includeDeleted });
		const { results } = await t.db
			.prepare(`SELECT id FROM objects WHERE type = 'lugar' AND ${where.sql} ORDER BY id`)
			.bind(...where.params)
			.all();
		const { results: all } = await t.db
			.prepare(
				"SELECT id, visibility, deleted_at, created_by FROM objects WHERE type = 'lugar' ORDER BY id"
			)
			.all();
		expect(all.length).toBe(12);
		const expected = all.filter((o) => canSee(/** @type {any} */ (o), viewer, { includeDeleted }));
		expect(results.map((r) => r.id)).toEqual(expected.map((r) => r.id));
		expect(expected.length).toBeGreaterThan(0);
	});

	it('quien lo creó ve su oculto; otre con cuenta no; nadie ve el oculto ajeno salvo admins', async () => {
		const own = ids['lugar-cuenta-autora-hidden-vivo'];
		const others = ids['lugar-admin-inventade-hidden-vivo'];
		expect(await getObject(t.db, { id: own }, creator)).toMatchObject({ visibility: 'hidden' });
		expect(await getObject(t.db, { id: own }, member)).toBeNull();
		expect(await getObject(t.db, { id: others }, creator)).toBeNull();
		expect(await getObject(t.db, { id: own }, admin)).not.toBeNull();
	});

	it('getObject devuelve null (no "prohibido") si no se puede ver', async () => {
		const hidden = ids['lugar-admin-inventade-hidden-vivo'];
		const gone = ids['lugar-admin-inventade-public-borrado'];
		expect(await getObject(t.db, { id: hidden }, ANON)).toBeNull();
		expect(await getObject(t.db, { id: hidden }, admin)).toMatchObject({ visibility: 'hidden' });
		expect(
			await getObject(t.db, { type: 'lugar', slug: 'lugar-admin-inventade-members-vivo' }, member)
		).not.toBeNull();
		expect(await getObject(t.db, { id: gone }, admin)).toBeNull();
		expect(await getObject(t.db, { id: gone }, admin, { includeDeleted: true })).not.toBeNull();
	});

	it('la búsqueda aplica la misma regla', async () => {
		const slugs = async (/** @type {any} */ v) =>
			(await searchObjects(t.db, 'zanahoria', v)).map((o) => o.slug).sort();
		const live = (/** @type {string} */ who, /** @type {string[]} */ vis) =>
			vis.map((v) => `lugar-${who}-${v}-vivo`);
		const both = (/** @type {string[]} */ vis) =>
			[...live('admin-inventade', vis), ...live('cuenta-autora', vis)].sort();
		expect(await slugs(ANON)).toEqual(both(['public']));
		expect(await slugs(member)).toEqual(both(['public', 'members']));
		expect(await slugs(creator)).toEqual(
			[...both(['public', 'members']), 'lugar-cuenta-autora-hidden-vivo'].sort()
		);
		expect(await slugs(admin)).toEqual(both(['public', 'members', 'hidden']));
		// Filtrar por tipo sigue andando con el parámetro de autore en el medio.
		expect(await searchObjects(t.db, 'zanahoria', creator, { type: 'evento' })).toEqual([]);
		// Operadores de FTS5 en lo que escribe la persona no rompen la consulta.
		expect(await searchObjects(t.db, 'zanahoria" OR "x', ANON)).toEqual([]);
	});

	it('un edge hacia algo oculto solo lo ven admins y quien creó el destino', async () => {
		expect(await getEdges(t.db, ids.evento, ANON)).toEqual([]);
		expect(await getEdges(t.db, ids.evento, member)).toEqual([]);
		for (const viewer of [admin, creator]) {
			const seen = await getEdges(t.db, ids.evento, viewer);
			expect(seen.map((e) => [e.kind, e.object.slug])).toEqual([
				['lugar', 'lugar-cuenta-autora-hidden-vivo']
			]);
		}
		const own = ids['lugar-cuenta-autora-hidden-vivo'];
		const incoming = await getEdges(t.db, own, creator, { direction: 'in', kind: 'lugar' });
		expect(incoming.map((e) => e.object.id)).toEqual([ids.evento]);
		// Otre con cuenta no ve ni el objeto de origen oculto ni sus edges.
		expect(await getEdges(t.db, own, member, { direction: 'in' })).toEqual([]);
	});

	it('quién creó y quién editó solo lo ven les admins', async () => {
		const own = ids['lugar-cuenta-autora-public-vivo'];
		for (const viewer of [ANON, member, creator]) {
			const o = await getObject(t.db, { id: own }, viewer);
			expect([o?.created_by, o?.updated_by]).toEqual(['', '']);
			for (const found of await searchObjects(t.db, 'zanahoria', viewer)) {
				expect([found.created_by, found.updated_by]).toEqual(['', '']);
			}
		}
		expect((await getObject(t.db, { id: own }, admin))?.created_by).toBe('cuenta-autora');
		const [edge] = await getEdges(t.db, ids.evento, creator);
		expect(edge.object.created_by).toBe('');
	});
});
