/**
 * La migración 0076 suma «Facturada» a `orders` (`invoiced_at`, `invoiced_by`) y un índice parcial
 * para las que faltan. Se aplica sobre una base con todas las migraciones anteriores y una orden
 * inventada: la orden queda sin facturar, las columnas aceptan lo que escribe invoiced.js y el
 * índice existe.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';

const FILE = path.join('migrations', '0076_compras_facturadas.sql');

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let before;

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0076')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

describe('migración 0076 (compras facturadas)', () => {
	it('agrega las columnas vacías y el índice, y acepta la marca', async () => {
		await t.db
			.prepare(
				`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
					fondo_amount, fondo_contribution, subtotal, total, buyer_name, buyer_email, status,
					created_at, updated_at, expires_at)
				VALUES ('vieja', 'evento-de-prueba', 'general', 1, 10000, 'solidaria', 0, 0, 10000,
					10000, 'Persona Inventada', 'persona@example.com', 'approved', 1, 1, 2)`
			)
			.run();

		const sql = await readFile(FILE, 'utf8');
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await t.db.batch(statements.map((s) => t.db.prepare(s)));

		expect(
			await t.db.prepare("SELECT invoiced_at, invoiced_by FROM orders WHERE id = 'vieja'").first()
		).toEqual({ invoiced_at: null, invoiced_by: null });
		const index = await t.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'orders_to_invoice'")
			.first();
		expect(index?.name).toBe('orders_to_invoice');

		await t.db
			.prepare(
				"UPDATE orders SET invoiced_at = 5, invoiced_by = 'admin-inventade' WHERE id = 'vieja'"
			)
			.run();
		expect(
			await t.db.prepare("SELECT invoiced_at, invoiced_by FROM orders WHERE id = 'vieja'").first()
		).toEqual({ invoiced_at: 5, invoiced_by: 'admin-inventade' });
		// Una fecha inválida no entra.
		await expect(
			t.db.prepare("UPDATE orders SET invoiced_at = 0 WHERE id = 'vieja'").run()
		).rejects.toThrow(/CHECK/);
	});
});
