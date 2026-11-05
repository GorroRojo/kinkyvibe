/**
 * La migración 0077 (extras en la compra): solo agrega. Sobre una base con todas las migraciones
 * anteriores y filas inventadas escritas como las escribe el código de `main` (sin nombrar nada
 * nuevo), la migración se aplica sin tocarlas, los valores por defecto son los de siempre y los
 * INSERT de `main` siguen andando. Después, las reglas de `order_extras`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';

const FILE = path.join('migrations', '0077_extras_compra.sql');
const NOW = Date.parse('2026-11-04T12:00:00Z');

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let before;

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0077')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

/** Una orden como la escribe `main` (sin `extras_amount`). @param {string} id */
function mainOrder(id) {
	return t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
				buyer_name, buyer_email, status, created_at, updated_at, expires_at)
			VALUES (?1, 'evento-de-prueba', 'general', 2, 1000, 2000, 2000, 'Persona de Prueba',
				'persona@example.com', 'approved', ?2, ?2, ?2)`
		)
		.bind(id, NOW)
		.run();
}

/** Un link de puerta como lo escribe `main` (sin `scope`). @param {string} id */
function mainDoorLink(id) {
	return t.db
		.prepare(
			`INSERT INTO door_links (id, event_slug, token_hash, label, created_by, created_at, expires_at)
			VALUES (?1, 'evento-de-prueba', ?2, 'voluntarie', 'admin-inventade', ?3, ?4)`
		)
		.bind(id, `hash-${id}`, NOW, NOW + 3_600_000)
		.run();
}

/**
 * @param {Record<string, unknown>} over
 */
function extraRow(over) {
	const row = {
		order_id: 'orden-1',
		event_slug: 'evento-de-prueba',
		extra_id: 'trago',
		name: 'Trago',
		unit_price: 3000,
		quantity: 2,
		created_at: NOW,
		...over
	};
	const cols = Object.keys(row);
	return t.db
		.prepare(
			`INSERT INTO order_extras (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`
		)
		.bind(...Object.values(row))
		.run();
}

describe('migración 0077 (extras en la compra)', () => {
	it('solo agrega: lo de antes queda igual y los INSERT de main siguen andando', async () => {
		await mainOrder('orden-vieja');
		await mainDoorLink('link-viejo');

		const sql = await readFile(FILE, 'utf8');
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await t.db.batch(statements.map((s) => t.db.prepare(s)));

		const old = await t.db
			.prepare("SELECT total, extras_amount FROM orders WHERE id = 'orden-vieja'")
			.first();
		expect(old).toEqual({ total: 2000, extras_amount: 0 });
		const link = await t.db.prepare("SELECT scope FROM door_links WHERE id = 'link-viejo'").first();
		expect(link).toEqual({ scope: 'puerta' });

		// El código de main, después de la migración.
		await mainOrder('orden-1');
		await mainDoorLink('link-nuevo');
		const fresh = await t.db
			.prepare("SELECT extras_amount FROM orders WHERE id = 'orden-1'")
			.first();
		expect(fresh?.extras_amount).toBe(0);
	});

	it('extras_amount no puede ser negativo y el scope es puerta o barra', async () => {
		await expect(
			t.db.prepare("UPDATE orders SET extras_amount = -1 WHERE id = 'orden-1'").run()
		).rejects.toThrow(/CHECK/);
		await expect(
			t.db.prepare("UPDATE door_links SET scope = 'otra' WHERE id = 'link-nuevo'").run()
		).rejects.toThrow(/CHECK/);
		await t.db.prepare("UPDATE door_links SET scope = 'barra' WHERE id = 'link-nuevo'").run();
	});

	it('order_extras: cantidad desde 1 (el tope), nunca más entregados que comprados', async () => {
		// Cantidad 0: el CHECK con nombre que usa el tope para deshacer la tanda.
		await expect(extraRow({ quantity: 0 })).rejects.toThrow(/extras_stock/);
		await expect(extraRow({ unit_price: -1 })).rejects.toThrow(/CHECK/);
		await extraRow({});
		// Uno por extra en cada orden.
		await expect(extraRow({})).rejects.toThrow(/UNIQUE|PRIMARY/);
		const deliver = () =>
			t.db
				.prepare(
					`UPDATE order_extras SET delivered = delivered + 1
					WHERE order_id = 'orden-1' AND extra_id = 'trago'`
				)
				.run();
		await deliver();
		await deliver();
		await expect(deliver()).rejects.toThrow(/CHECK/);
		await expect(
			t.db.prepare("UPDATE order_extras SET delivered = -1 WHERE order_id = 'orden-1'").run()
		).rejects.toThrow(/CHECK/);
		const row = await t.db
			.prepare("SELECT quantity, delivered FROM order_extras WHERE order_id = 'orden-1'")
			.first();
		expect(row).toEqual({ quantity: 2, delivered: 2 });
	});
});
