import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { logAdminAction } from './audit.js';
import { auditFacets, auditFilterQuery, parseAuditFilters, queryAudit } from './activity.js';

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

const uno = { user: { id: 1, login: 'admin-uno' } };
const dos = { user: { id: 2, login: 'admin-dos' } };

async function seed() {
	let now = 1000;
	/** @param {any} who @param {string} action @param {string} targetType @param {string} targetId */
	const add = (who, action, targetType, targetId) =>
		logAdminAction(
			t.db,
			who,
			{ action, targetType, targetId, summary: `${action} ${targetId}` },
			{ now: now++ }
		);
	await add(uno, 'transfer.confirm', 'order', 'o1');
	await add(dos, 'transfer.cancel', 'order', 'o2');
	await add(uno, 'order.refund', 'order', 'o1');
	await add(dos, 'discount.create', 'discount', 'AMIGUES');
	await add(uno, 'transferencia.rara', 'order', 'o3');
}

describe('queryAudit', () => {
	it('filtra por familia de acciones (sin confundir prefijos) y por acción exacta', async () => {
		await seed();
		const fam = await queryAudit(t.db, { type: 'transfer' });
		expect(fam.map((e) => e.action)).toEqual(['transfer.cancel', 'transfer.confirm']);
		expect((await queryAudit(t.db, { type: 'order.refund' })).map((e) => e.targetId)).toEqual([
			'o1'
		]);
	});
	it('filtra por admin y objeto, y pagina por id', async () => {
		await seed();
		expect((await queryAudit(t.db, { actor: 'admin-dos' })).length).toBe(2);
		expect((await queryAudit(t.db, { targetType: 'order', targetId: 'o1' })).length).toBe(2);
		const first = await queryAudit(t.db, { limit: 2 });
		const next = await queryAudit(t.db, { limit: 2, before: first[1].id });
		expect(first.map((e) => e.id)).not.toContain(next[0].id);
		expect(next[0].id).toBeLessThan(first[1].id);
	});
	it('sin base: vacío', async () => {
		expect(await queryAudit(null)).toEqual([]);
		expect(await auditFacets(null)).toEqual({ actors: [], actions: [], targetTypes: [] });
	});
});

describe('auditFacets', () => {
	it('lista admins, acciones y tipos de objeto que aparecen', async () => {
		await seed();
		const f = await auditFacets(t.db);
		expect(f.actors).toEqual(['admin-dos', 'admin-uno']);
		expect(f.actions).toContain('discount.create');
		expect(f.targetTypes).toEqual(['discount', 'order']);
	});
});

describe('filtros en la URL', () => {
	it('parseAuditFilters normaliza y descarta valores raros', () => {
		const f = parseAuditFilters(
			new URLSearchParams('admin=admin-uno&tipo=order.refund&objeto=order&id=o1&antes=33')
		);
		expect(f).toEqual({
			actor: 'admin-uno',
			type: 'order.refund',
			targetType: 'order',
			targetId: 'o1',
			before: 33
		});
		const bad = parseAuditFilters(new URLSearchParams("tipo=a'b&antes=-1"));
		expect(bad.type).toBeUndefined();
		expect(bad.before).toBeUndefined();
	});
	it('auditFilterQuery arma el query string (ida y vuelta)', () => {
		const f = { actor: 'admin-uno', type: 'transfer' };
		const q = auditFilterQuery(f, { before: 10 });
		expect(q).toBe('?admin=admin-uno&tipo=transfer&antes=10');
		expect(parseAuditFilters(new URLSearchParams(q.slice(1)))).toMatchObject({ ...f, before: 10 });
		expect(auditFilterQuery({})).toBe('');
	});
});
