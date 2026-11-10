/**
 * La migración 0082 reconstruye `orders` para sumar `payment_method = 'paypal'` y las columnas de
 * PayPal. Se aplica sobre una base con datos hasta 0081 para comprobar que no pierde órdenes,
 * entradas, extras, ni las filas de las tablas con `ON DELETE CASCADE` hacia `orders`
 * (`order_answers`, `free_order_choices`), que el `DROP TABLE` borraría sin la copia.
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
		if (f.endsWith('.sql') && f < '0082')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

const NOW = Date.parse('2026-11-01T12:00:00Z');
const ACCOUNT = '11111111-1111-4111-8111-111111111111';

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
		payment_method: 'mercadopago',
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

describe('migración 0082 (PayPal en las entradas)', () => {
	it('conserva todo (también lo que borraría la cascada) y acepta PayPal', async () => {
		await t.db.batch([
			t.db
				.prepare('INSERT INTO accounts (id, email, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)')
				.bind(ACCOUNT, 'prueba@example.com', NOW),
			order('a', { mp_fee_amount: 300, account_id: ACCOUNT, extras_amount: 0 }),
			order('b', {
				unit_price: 0,
				subtotal: 0,
				total: 0,
				payment_method: 'gratis',
				fondo_option: 'gorra'
			}),
			t.db.prepare(
				`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, token)
				VALUES ('t1', 'a', 'fiesta', 'general', 'Persona de Prueba', 'tok1')`
			),
			t.db.prepare(
				`INSERT INTO order_answers (order_id, answers, created_at) VALUES ('a', '[]', ${NOW})`
			),
			t.db.prepare(
				`INSERT INTO free_order_choices (account_id, order_id, mine, created_at)
				VALUES ('${ACCOUNT}', 'b', 1, ${NOW})`
			)
		]);
		await expect(order('c', { payment_method: 'paypal' }).run()).rejects.toThrow(/CHECK/);

		const sql = await readFile(path.join('migrations', '0082_paypal_entradas.sql'), 'utf8');
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await t.db.batch(statements.map((s) => t.db.prepare(s)));

		const rows = (await t.db.prepare('SELECT * FROM orders ORDER BY id').all()).results;
		expect(rows.map((r) => [r.id, r.payment_method, r.mp_fee_amount, r.account_id])).toEqual([
			['a', 'mercadopago', 300, ACCOUNT],
			['b', 'gratis', null, null]
		]);
		/** @param {string} table */
		const count = async (table) =>
			(await t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n;
		expect(await count('tickets')).toBe(1);
		expect(await count('order_answers')).toBe(1);
		expect(await count('free_order_choices')).toBe(1);
		expect(
			(await t.db.prepare('PRAGMA foreign_key_check').all()).results,
			'sin foreign keys rotas'
		).toEqual([]);
		const tables = (
			await t.db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'kv_bak_%'").all()
		).results;
		expect(tables).toEqual([]);

		// PayPal: solo online, con sus columnas; una orden de PayPal por orden de PayPal.
		await order('c', {
			payment_method: 'paypal',
			status: 'pending',
			paypal_order_id: 'PPORDER1',
			usd_amount_cents: 650,
			rate_base: 1250.5,
			rate_adjustment_pct: -4
		}).run();
		await expect(
			order('d', { payment_method: 'paypal', paypal_order_id: 'PPORDER1' }).run()
		).rejects.toThrow(/UNIQUE/);
		await expect(order('e', { payment_method: 'paypal', channel: 'puerta' }).run()).rejects.toThrow(
			/CHECK/
		);
		const idx = (await t.db.prepare("PRAGMA index_list('orders')").all()).results.map(
			(r) => r.name
		);
		for (const name of [
			'orders_event_type_status',
			'orders_email_lower',
			'orders_client_sale_id',
			'orders_to_invoice',
			'orders_paypal_order'
		]) {
			expect(idx).toContain(name);
		}
	});
});
