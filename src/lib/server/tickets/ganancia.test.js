/**
 * La ganancia de varios eventos en una consulta (ganancia.js): da lo mismo que la cuenta de
 * Gastos y reparto con las órdenes una por una (la suma en SQL no cambia nada), usa lo guardado de
 * la cuenta y, cerrada, el número del cierre. Eventos y personas inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { insertOrder } from '$lib/server/admin/testRows.js';
import { computeAccount, emptyAccount, eventIncome, shownAccount } from '$lib/admin/reparto.js';
import { eventProfit } from '$lib/admin/ganancia.js';
import { listOrders } from './orders.js';
import { closeAccount, getVenueRule, saveAccount, saveVenueRule } from './cuentas.js';
import { profitsQuery } from './ganancia.js';
import { runQuery } from '$lib/server/db/batch.js';
import { withSales } from '$lib/server/eventos/panelList.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';
import { setEventVenue } from '$lib/server/amigues/venues.js';

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

/**
 * Órdenes variadas: MP con recargo, Fondo, solidaria, puerta, extras, reembolsada.
 * @param {string} slug
 */
async function seed(slug) {
	const db = t.db;
	await insertOrder(db, { slug, quantity: 2, unitPrice: 10000, surcharge: 420 });
	await insertOrder(db, { slug, unitPrice: 10000, fondoAmount: 5000, surcharge: 105 });
	await insertOrder(db, { slug, unitPrice: 10000, contribution: 3000, method: 'transferencia' });
	const door = await insertOrder(db, { slug, unitPrice: 12000, method: 'transferencia' });
	await db
		.prepare(`UPDATE orders SET channel = 'puerta', payment_method = 'efectivo' WHERE id = ?1`)
		.bind(door)
		.run();
	const extra = await insertOrder(db, { slug, unitPrice: 10000, method: 'transferencia' });
	await db.prepare(`UPDATE orders SET extras_amount = 4000 WHERE id = ?1`).bind(extra).run();
	await insertOrder(db, { slug, unitPrice: 10000, status: 'refunded' });
}

describe('profitsQuery', () => {
	it('da lo mismo que la cuenta con las órdenes una por una', async () => {
		await seed('uno');
		await seed('dos');
		const account = {
			...emptyAccount(),
			venue: { kind: /** @type {const} */ ('porcentaje'), pct: 20 },
			expenses: [
				{ id: 'x', concept: 'Luces', amount: 15000, paidBy: '', paidAt: '', keep: 'cobra' }
			]
		};
		const r = await saveAccount(t.db, { slug: 'uno', data: account, version: 0, by: 'admin' });
		expect(r).toEqual({ ok: true, version: 1 });

		const profits = await runQuery(t.db, profitsQuery(['uno', 'dos', 'nada']));
		for (const slug of ['uno', 'dos']) {
			const income = eventIncome(await listOrders(t.db, slug));
			const expected = eventProfit({ income, account: slug === 'uno' ? account : null });
			expect(profits.get(slug)).toEqual(expected);
		}
		// Con gastos: lugar al 20 % y luces.
		const uno = profits.get('uno');
		const income = eventIncome(await listOrders(t.db, 'uno'));
		expect(uno?.amount).toBe(computeAccount(income, account).profit);
		expect(uno?.noExpenses).toBe(false);
		expect(uno?.venueDefault).toBe(false);
		expect(uno?.closed).toBe(false);
		// Sin cuenta guardada y sin lugar: lo que muestra Gastos y reparto (la regla de talleres).
		const dos = profits.get('dos');
		const dosIncome = eventIncome(await listOrders(t.db, 'dos'));
		expect(dos?.amount).toBe(computeAccount(dosIncome, emptyAccount()).profit);
		expect(dos?.noExpenses).toBe(false);
		expect(dos?.venueDefault).toBe(true);
		// Sin ventas ni cierre: nada.
		expect(profits.has('nada')).toBe(false);
	});

	it('con la cuenta cerrada, el número del cierre', async () => {
		await seed('uno');
		const summary = {
			tickets: 7,
			presale: 1,
			door: 1,
			fondo_net: 0,
			other_income: 0,
			income_total: 90000,
			venue: 0,
			fees: 0,
			other_expenses: 30000,
			expenses_total: 30000,
			caja: 60000,
			profit: 60000
		};
		await closeAccount(t.db, {
			slug: 'uno',
			title: 'Uno',
			date: '2026-10-01',
			summary: /** @type {any} */ (summary),
			snapshot: {},
			by: 'admin'
		});
		const profits = await runQuery(t.db, profitsQuery(null));
		expect(profits.get('uno')).toEqual({
			amount: 60000,
			closed: true,
			noExpenses: false,
			venueDefault: false,
			income: 90000,
			expenses: 30000
		});
	});

	it('sin cuenta guardada: la regla por defecto del lugar, como Gastos y reparto (en la misma tanda)', async () => {
		await seed('con-lugar');
		await seed('lugar-sin-regla');
		const venue = await makeProfile(t.db, { title: 'Sala Inventada', kind: 'lugar' });
		const bare = await makeProfile(t.db, { title: 'Patio Inventado', kind: 'lugar' });
		/** @type {[string, number][]} */
		const pairs = [
			['con-lugar', venue.id],
			['lugar-sin-regla', bare.id]
		];
		for (const [slug, venueId] of pairs) {
			await makeEvent(t.db, slug);
			const linked = await setEventVenue(t.db, {
				eventSlug: slug,
				venueId,
				privacy: null,
				by: 'admin'
			});
			expect(linked).toEqual({ ok: true });
		}
		await saveVenueRule(t.db, {
			venueId: venue.id,
			rule: { kind: 'fijo', amount: 20000 },
			by: 'admin'
		});

		const q = profitsQuery(['con-lugar', 'lugar-sin-regla']);
		expect(q.statements(t.db)).toHaveLength(4);
		const profits = await runQuery(t.db, q);
		for (const [slug, venueId] of pairs) {
			const income = eventIncome(await listOrders(t.db, slug));
			// Lo mismo que arma la página para una cuenta sin guardar.
			const shown = shownAccount(null, await getVenueRule(t.db, venueId));
			expect(profits.get(slug)?.amount).toBe(computeAccount(income, shown).profit);
			expect(profits.get(slug)?.venueDefault).toBe(true);
		}
		const conLugar = profits.get('con-lugar');
		expect(conLugar?.expenses).toBe(20000);
		expect(conLugar?.amount).toBe((conLugar?.income ?? 0) - 20000);

		// Con la cuenta guardada, manda lo guardado (no la regla del lugar).
		const saved = { ...emptyAccount(), venue: { kind: /** @type {const} */ ('fijo'), amount: 0 } };
		await saveAccount(t.db, { slug: 'con-lugar', data: saved, version: 0, by: 'admin' });
		const after = (await runQuery(t.db, profitsQuery(['con-lugar']))).get('con-lugar');
		expect(after).toMatchObject({ noExpenses: true, venueDefault: false, expenses: 0 });
		expect(after?.amount).toBe(after?.income);
	});

	it('sin eventos, sin consultas', async () => {
		const q = profitsQuery([]);
		expect(q.statements(t.db)).toEqual([]);
		expect(await runQuery(t.db, q)).toEqual(new Map());
	});
});

describe('Panel → Eventos (withSales)', () => {
	/** @param {string} slug @param {boolean} sellsTickets */
	const row = (slug, sellsTickets) => /** @type {any} */ ({ slug, sellsTickets, i: 0 });

	it('con Gastos y reparto, la ganancia de los que venden entradas; apagado, nada', async () => {
		await seed('uno');
		const rows = [row('uno', true), row('sin-entradas', false), row('sin-ventas', true)];
		const on = await withSales(t.db, rows, 1, { profits: true });
		const expected = (await runQuery(t.db, profitsQuery(['uno']))).get('uno');
		expect(on.map((e) => e.profit)).toEqual([expected, null, null]);
		const off = await withSales(t.db, rows, 1);
		expect(off.some((e) => 'profit' in e)).toBe(false);
	});
});
