/**
 * La migración 0010 reconstruye `orders` otra vez (canal `manual`, medio `otro`, precio 0 en las
 * manuales y `admin_note`). Se aplica sobre una base con datos hasta 0009 para comprobar que no
 * pierde filas (ni el canal de las ventas en la puerta), que las foreign keys siguen valiendo y
 * que los CHECK nuevos funcionan.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let before;

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0010')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

const NOW = Date.parse('2026-10-01T12:00:00Z');

/** @param {string} id @param {Record<string, unknown>} [o] */
function order(id, o = {}) {
	const row = {
		id,
		event_slug: 'fiesta',
		ticket_type: 'general',
		quantity: 1,
		unit_price: 8000,
		subtotal: 8000,
		total: 8000,
		payment_method: 'transferencia',
		buyer_name: 'Persona de Prueba',
		buyer_email: 'prueba@example.com',
		status: 'approved',
		created_at: NOW,
		updated_at: NOW,
		expires_at: NOW,
		...o
	};
	const cols = Object.keys(row);
	return t.db
		.prepare(`INSERT INTO orders (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
		.bind(...Object.values(row));
}

describe('migración 0010 (entradas cargadas a mano)', () => {
	it('conserva órdenes (con su canal) y entradas, y agrega manual, otro, precio 0 y nota', async () => {
		await t.db.batch([
			order('a', { client_hash: 'h' }),
			order('b', { payment_method: 'efectivo', channel: 'puerta', confirmed_by: 'gorrite' }),
			t.db.prepare(
				`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, token)
				VALUES ('t1', 'b', 'fiesta', 'general', 'Persona de Prueba', 'tok1')`
			)
		]);
		// Antes de 0010: ni manual ni otro.
		await expect(order('c', { channel: 'manual' }).run()).rejects.toThrow(/CHECK/);

		const sql = await readFile(path.join('migrations', '0010_manual_orders.sql'), 'utf8');
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await t.db.batch(statements.map((s) => t.db.prepare(s)));

		const rows = (await t.db.prepare('SELECT * FROM orders ORDER BY id').all()).results;
		expect(rows.map((r) => [r.id, r.channel, r.payment_method, r.client_hash])).toEqual([
			['a', 'online', 'transferencia', 'h'],
			['b', 'puerta', 'efectivo', null]
		]);
		expect(rows[1].confirmed_by).toBe('gorrite');
		const fks = (await t.db.prepare('PRAGMA foreign_key_list(tickets)').all()).results;
		expect(fks.map((f) => f.table)).toEqual(['orders']);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM tickets').first())?.n).toBe(1);

		// Manual: cortesía (precio 0, gratis), efectivo, otro y nota.
		const free = { unit_price: 0, subtotal: 0, total: 0, payment_method: 'gratis' };
		await order('c', { ...free, channel: 'manual', admin_note: 'Invitación' }).run();
		await order('d', { channel: 'manual', payment_method: 'efectivo' }).run();
		await order('e', { channel: 'manual', payment_method: 'otro' }).run();
		expect(
			(await t.db.prepare("SELECT admin_note FROM orders WHERE id = 'c'").first())?.admin_note
		).toBe('Invitación');
		// Online: ni precio 0 (salvo a la gorra), ni efectivo, ni otro.
		await expect(order('f', free).run()).rejects.toThrow(/CHECK/);
		await expect(order('g', { payment_method: 'otro' }).run()).rejects.toThrow(/CHECK/);
		await expect(order('h', { payment_method: 'efectivo' }).run()).rejects.toThrow(/CHECK/);
		await expect(order('i', { channel: 'web' }).run()).rejects.toThrow(/CHECK/);

		const idx = (await t.db.prepare("PRAGMA index_list('orders')").all()).results.map(
			(r) => r.name
		);
		for (const name of [
			'orders_event_type_status',
			'orders_event_created',
			'orders_discount_code',
			'orders_event_client',
			'orders_event_email',
			'orders_needs_review',
			'orders_email_status'
		]) {
			expect(idx).toContain(name);
		}
	});
});
