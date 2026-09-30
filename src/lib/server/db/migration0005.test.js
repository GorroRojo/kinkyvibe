/**
 * La migración 0005 reconstruye `orders` (nuevo CHECK de `payment_method` y columna `channel`).
 * Acá se aplica sobre una base con datos de 0002/0003 (órdenes, entradas, envíos) para comprobar
 * que no pierde filas, que las foreign keys siguen valiendo y que los CHECK nuevos funcionan.
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
	// Solo las migraciones anteriores a 0005.
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0005')
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
		buyer_dni: '30000000',
		status: 'approved',
		created_at: NOW,
		updated_at: NOW,
		expires_at: NOW,
		needs_review: null,
		...o
	};
	const cols = Object.keys(row);
	return t.db
		.prepare(`INSERT INTO orders (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
		.bind(...Object.values(row));
}

describe('migración 0005 (venta en la puerta)', () => {
	it('conserva órdenes, entradas y envíos, y agrega efectivo + canal', async () => {
		await t.db.batch([
			order('a', { needs_review: 'late_payment', review_detail: 'x', client_hash: 'h' }),
			order('b', {
				payment_method: 'mercadopago',
				status: 'refunded',
				surcharge_amount: 160,
				total: 8160
			}),
			t.db
				.prepare(
					`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, token, code, checked_in_at, checked_in_by)
					VALUES ('t1', 'a', 'fiesta', 'general', 'Persona de Prueba', 'tok1', 'ABC234', ?1, 'gorrite')`
				)
				.bind(NOW),
			t.db.prepare(
				`INSERT INTO reminder_sends (order_id, reminder_id, sent_at) VALUES ('a', 'h48', 1)`
			),
			t.db.prepare(
				`INSERT INTO stream_link_sends (order_id, link_hash, sent_at) VALUES ('b', 'x', 1)`
			)
		]);
		// Antes de 0005 el efectivo no existe.
		await expect(order('c', { payment_method: 'efectivo' }).run()).rejects.toThrow(/CHECK/);

		const sql = await readFile(path.join('migrations', '0005_door_sales.sql'), 'utf8');
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await t.db.batch(statements.map((s) => t.db.prepare(s)));

		const rows = (await t.db.prepare('SELECT * FROM orders ORDER BY id').all()).results;
		expect(rows.map((r) => [r.id, r.status, r.channel, r.needs_review, r.client_hash])).toEqual([
			['a', 'approved', 'online', 'late_payment', 'h'],
			['b', 'refunded', 'online', null, null]
		]);
		expect(rows[1].surcharge_amount).toBe(160);
		const ticket = await t.db.prepare('SELECT * FROM tickets WHERE id = ?1').bind('t1').first();
		expect(ticket?.checked_in_by).toBe('gorrite');
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM reminder_sends').first())?.n).toBe(1);

		// Las foreign keys siguen apuntando a `orders`.
		const fks = (await t.db.prepare('PRAGMA foreign_key_list(tickets)').all()).results;
		expect(fks.map((f) => f.table)).toEqual(['orders']);
		await expect(
			t.db
				.prepare(
					`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, token)
					VALUES ('t2', 'no-existe', 'fiesta', 'general', 'X', 'tok2')`
				)
				.run()
		).rejects.toThrow(/FOREIGN KEY/);

		// Efectivo solo en la puerta; los índices están.
		await expect(order('c', { payment_method: 'efectivo' }).run()).rejects.toThrow(/CHECK/);
		await order('c', { payment_method: 'efectivo', channel: 'puerta' }).run();
		await expect(order('d', { channel: 'web' }).run()).rejects.toThrow(/CHECK/);
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
