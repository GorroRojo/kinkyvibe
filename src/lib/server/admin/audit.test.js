import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit, logAdminAction, sanitizeDetail } from './audit.js';

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

const locals = { user: { id: 1234, login: 'admin-de-prueba' } };

describe('logAdminAction', () => {
	it('guarda quién, qué, sobre qué y cuándo', async () => {
		const ok = await logAdminAction(
			t.db,
			locals,
			{
				action: 'transfer.confirm',
				targetType: 'order',
				targetId: 'ord_1',
				summary: 'Confirmó la transferencia KV-AAAA',
				detail: { event: 'evento-x', tickets: 2 }
			},
			{ now: 1000 }
		);
		expect(ok).toBe(true);
		const [e] = await listAudit(t.db);
		expect(e).toMatchObject({
			at: 1000,
			actorId: 1234,
			actorLogin: 'admin-de-prueba',
			action: 'transfer.confirm',
			targetType: 'order',
			targetId: 'ord_1',
			summary: 'Confirmó la transferencia KV-AAAA',
			detail: { event: 'evento-x', tickets: 2 }
		});
	});

	it('nunca guarda DNI, tokens ni datos bancarios en el detalle', async () => {
		await logAdminAction(t.db, locals, {
			action: 'settings.save',
			summary: 'Guardó los ajustes',
			detail: {
				dni: '30111222',
				buyer_dni: '30111222',
				userToken: 'gho_x',
				CBU: '0000',
				alias: 'mi.alias',
				nested: { password: 'x', 'access-token': 'y', ok: 'sí' },
				fields: ['alias', 'cbu']
			}
		});
		const [e] = await listAudit(t.db);
		expect(e.detail).toEqual({ nested: { ok: 'sí' }, fields: ['alias', 'cbu'] });
		const raw = await t.db.prepare('SELECT detail FROM admin_audit').first();
		expect(String(raw?.detail)).not.toMatch(/30111222|gho_x|mi\.alias/);
	});

	it('sin base de datos no hace nada y no tira error', async () => {
		expect(await logAdminAction(null, locals, { action: 'a', summary: 'b' })).toBe(false);
		expect(await listAudit(null)).toEqual([]);
	});

	it('nunca tira error aunque falle la base', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = /** @type {any} */ ({
			prepare: () => {
				throw new Error('boom');
			}
		});
		await expect(logAdminAction(broken, locals, { action: 'a', summary: 'b' })).resolves.toBe(
			false
		);
		await expect(listAudit(broken)).resolves.toEqual([]);
		spy.mockRestore();
	});

	it('rechaza entradas sin action o summary', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await logAdminAction(t.db, locals, { action: '', summary: 'x' })).toBe(false);
		expect(await logAdminAction(t.db, locals, /** @type {any} */ ({ action: 'x' }))).toBe(false);
		expect(await listAudit(t.db)).toEqual([]);
		spy.mockRestore();
	});

	it('sin usuario anota "desconocide" y recorta textos largos', async () => {
		await logAdminAction(t.db, {}, { action: 'x', summary: 'y'.repeat(2000), targetId: 42 });
		const [e] = await listAudit(t.db);
		expect(e.actorLogin).toBe('desconocide');
		expect(e.actorId).toBe(null);
		expect(e.summary.length).toBe(500);
		expect(e.targetId).toBe('42');
	});
});

describe('listAudit', () => {
	beforeEach(async () => {
		for (let i = 1; i <= 5; i++) {
			await logAdminAction(
				t.db,
				locals,
				{
					action: 'x',
					targetType: i % 2 ? 'event' : 'order',
					targetId: i % 2 ? 'evento-a' : `ord_${i}`,
					summary: `acción ${i}`
				},
				{ now: i * 1000 }
			);
		}
	});

	it('de la más nueva a la más vieja, con límite y paginación', async () => {
		const first = await listAudit(t.db, { limit: 2 });
		expect(first.map((e) => e.summary)).toEqual(['acción 5', 'acción 4']);
		const next = await listAudit(t.db, { limit: 2, before: first[1].id });
		expect(next.map((e) => e.summary)).toEqual(['acción 3', 'acción 2']);
	});

	it('filtra por objetivo', async () => {
		const ev = await listAudit(t.db, { targetType: 'event', targetId: 'evento-a' });
		expect(ev.map((e) => e.summary)).toEqual(['acción 5', 'acción 3', 'acción 1']);
		const one = await listAudit(t.db, { targetType: 'order', targetId: 'ord_2' });
		expect(one).toHaveLength(1);
	});

	it('acota el límite', async () => {
		expect(await listAudit(t.db, { limit: 0 })).toHaveLength(1);
		expect(await listAudit(t.db, { limit: 10_000 })).toHaveLength(5);
	});
});

describe('sanitizeDetail', () => {
	it('recorta textos, limita profundidad y descarta lo raro', () => {
		expect(sanitizeDetail('a'.repeat(400))).toHaveLength(301);
		expect(sanitizeDetail({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({
			a: { b: { c: { d: null } } }
		});
		expect(sanitizeDetail(() => 1)).toBe(null);
		expect(sanitizeDetail(Infinity)).toBe(null);
	});
});
