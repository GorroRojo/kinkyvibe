/**
 * PayPal sin credenciales (src/lib/server/paypal/index.js): el ajuste, los totales en dólares y en
 * pesos estimados, el reparto por mes Fondo, los retiros, y que las propinas de PayPal no se
 * mezclen con las de Mercado Pago. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	applyTipPayment,
	createTip,
	fondoTipTotals,
	tipReference,
	tipSummary
} from '$lib/server/propinas/index.js';
import { storeRate } from './rates.js';
import {
	addWithdrawal,
	deleteWithdrawal,
	fondoMonthOf,
	fondoMonthSplit,
	getAdjustment,
	lastFondoMonths,
	listWithdrawals,
	loadPaypalPanel,
	paypalTipTotals,
	quoteFor,
	setAdjustment,
	sumPaypal,
	validateWithdrawal
} from './index.js';

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

let n = 0;
/**
 * Una propina de PayPal como la va a guardar el cobro (todavía no existe): directo en la tabla.
 * @param {{ netCents: number, base: number | null, approvedAt: number, status?: string, destination?: string }} o
 */
async function paypalTip({
	netCents,
	base,
	approvedAt,
	status = 'approved',
	destination = 'fondo'
}) {
	n++;
	await t.db
		.prepare(
			`INSERT INTO tips (id, amount, status, post_category, post_slug, message, created_at,
				updated_at, approved_at, destination, source, provider, currency, usd_gross_cents,
				usd_net_cents, rate_base, paypal_order_id)
			VALUES (?1, 1, ?2, 'material', '', NULL, ?3, ?3, ?3, ?4, 'fondo', 'paypal', 'USD', ?5, ?6, ?7, ?8)`
		)
		.bind(
			crypto.randomUUID(),
			status,
			approvedAt,
			destination,
			netCents + 50,
			netCents,
			base,
			`ORDEN-PRUEBA-${n}`
		)
		.run();
}

/** Una propina de Mercado Pago aprobada al Fondo. @param {number} amount @param {number} at */
async function mpTip(amount, at) {
	const tip = await createTip(
		t.db,
		{ amount, message: null, category: 'material', slug: 'guia-de-prueba' },
		{ now: at - 1000 }
	);
	await applyTipPayment(
		t.db,
		{
			id: ++n,
			status: 'approved',
			external_reference: tipReference(tip.id),
			transaction_amount: amount,
			currency_id: 'ARS'
		},
		{ now: at }
	);
	return tip;
}

const OCT = { from: Date.parse('2026-10-05T03:00:00Z'), to: Date.parse('2026-11-05T03:00:00Z') };
const IN_OCT = Date.parse('2026-10-20T15:00:00Z');

describe('ajuste', () => {
	it('sin guardar es 0; se guarda y se lee', async () => {
		expect(await getAdjustment(t.db)).toEqual({ pct: 0, updatedAt: null, updatedBy: null });
		await setAdjustment(t.db, -4, { by: 'admin-de-prueba', now: 123 });
		expect(await getAdjustment(t.db)).toEqual({
			pct: -4,
			updatedAt: 123,
			updatedBy: 'admin-de-prueba'
		});
		await setAdjustment(t.db, 2.5, { by: 'otre-admin', now: 456 });
		expect((await getAdjustment(t.db)).pct).toBe(2.5);
	});
});

describe('totales de PayPal', () => {
	it('sin propinas de PayPal: ceros', async () => {
		expect(await paypalTipTotals(t.db, OCT, -4)).toEqual({ usd: 0, ars: 0, count: 0 });
	});

	it('suma lo neto y estima cada pago por separado, con su base y el ajuste de ahora', async () => {
		await paypalTip({ netCents: 1000, base: 1200, approvedAt: IN_OCT }); // 12.000 → 11.520 con −4
		await paypalTip({ netCents: 941, base: 1567.4, approvedAt: IN_OCT }); // 14.749 → 14.159,…
		// No cuentan: pendiente, reembolsada, de otro destino, de otro mes.
		await paypalTip({ netCents: 5000, base: 1200, approvedAt: IN_OCT, status: 'pending' });
		await paypalTip({ netCents: 5000, base: 1200, approvedAt: IN_OCT, status: 'refunded' });
		await paypalTip({ netCents: 5000, base: 1200, approvedAt: IN_OCT, destination: 'kinkyvibe' });
		await paypalTip({ netCents: 5000, base: 1200, approvedAt: OCT.to });
		expect(await paypalTipTotals(t.db, OCT, 0)).toEqual({
			usd: 19.41,
			ars: 12_000 + 14_749,
			count: 2
		});
		// 9,41 × 1567,40 × 0,96 = 14.159,26 → 14.159.
		expect(await paypalTipTotals(t.db, OCT, -4)).toEqual({
			usd: 19.41,
			ars: 11_520 + 14_159,
			count: 2
		});
	});

	it('un pago sin base suma dólares pero no pesos', () => {
		expect(
			sumPaypal(
				[
					{ usdNetCents: 1000, rateBase: null },
					{ usdNetCents: 1000, rateBase: 1000 }
				],
				0
			)
		).toEqual({ usdCents: 2000, ars: 10_000, count: 2 });
	});

	it('las de PayPal no entran en los totales de Mercado Pago (Inicio, panel, kv-fondo)', async () => {
		await mpTip(3000, IN_OCT);
		await paypalTip({ netCents: 1000, base: 1200, approvedAt: IN_OCT });
		expect(await fondoTipTotals(t.db, OCT)).toEqual({ count: 1, total: 3000 });
		const s = await tipSummary(t.db);
		expect(s.count).toBe(1);
		expect(s.total).toBe(3000);
		expect(s.byDestination.fondo).toEqual({ count: 1, total: 3000 });
		expect(s.byPost.reduce((a, p) => a + p.count, 0)).toBe(1);
	});

	it('un pago de Mercado Pago no toca una propina de PayPal', async () => {
		await paypalTip({ netCents: 1000, base: 1200, approvedAt: IN_OCT, status: 'pending' });
		const row = /** @type {any} */ (
			await t.db.prepare("SELECT id FROM tips WHERE provider = 'paypal'").first()
		);
		const r = await applyTipPayment(t.db, {
			id: 999,
			status: 'approved',
			external_reference: tipReference(row.id),
			transaction_amount: 1,
			currency_id: 'ARS'
		});
		expect(r.outcome).toBe('unknown-tip');
		const after = /** @type {any} */ (
			await t.db
				.prepare('SELECT status, mp_payment_id FROM tips WHERE id = ?1')
				.bind(row.id)
				.first()
		);
		expect(after).toEqual({ status: 'pending', mp_payment_id: null });
	});
});

describe('meses Fondo', () => {
	it('fondoMonthOf: del 5 al 4, en hora de Argentina', () => {
		expect(fondoMonthOf(Date.parse('2026-11-05T03:00:00Z'))).toBe('2026-11');
		expect(fondoMonthOf(Date.parse('2026-11-05T02:59:59Z'))).toBe('2026-10');
		expect(fondoMonthOf(Date.parse('2026-01-03T12:00:00Z'))).toBe('2025-12');
	});

	it('lastFondoMonths', () => {
		expect(lastFondoMonths(Date.parse('2026-02-10T12:00:00Z'), 4)).toEqual([
			'2026-02',
			'2026-01',
			'2025-12',
			'2025-11'
		]);
	});

	it('fondoMonthSplit: Mercado Pago, PayPal neto, PayPal en pesos y total por mes', async () => {
		await mpTip(3000, IN_OCT);
		await mpTip(1000, Date.parse('2026-09-10T15:00:00Z'));
		await paypalTip({ netCents: 1000, base: 1200, approvedAt: IN_OCT });
		await paypalTip({ netCents: 2000, base: 1000, approvedAt: Date.parse('2026-11-06T15:00:00Z') });
		const split = await fondoMonthSplit(t.db, {
			now: Date.parse('2026-11-10T12:00:00Z'),
			count: 3,
			adjustmentPct: -4
		});
		expect(split).toEqual([
			{
				month: '2026-11',
				mpArs: 0,
				mpCount: 0,
				paypalUsdCents: 2000,
				paypalArs: 19_200,
				paypalCount: 1,
				totalArs: 19_200
			},
			{
				month: '2026-10',
				mpArs: 3000,
				mpCount: 1,
				paypalUsdCents: 1000,
				paypalArs: 11_520,
				paypalCount: 1,
				totalArs: 14_520
			},
			{
				month: '2026-09',
				mpArs: 1000,
				mpCount: 1,
				paypalUsdCents: 0,
				paypalArs: 0,
				paypalCount: 0,
				totalArs: 1000
			}
		]);
	});
});

describe('cotización con el ajuste', () => {
	it('quoteFor: base, ajuste, efectiva, día del dato y si es viejo', async () => {
		expect(await quoteFor(t.db, { day: '2026-11-02', adjustmentPct: -4 })).toBeNull();
		await storeRate(t.db, {
			day: '2026-10-30',
			compra: 1200,
			venta: 1210,
			source: 'argentinadatos',
			fetchedAt: Date.parse('2026-11-02T21:15:00Z')
		});
		expect(await quoteFor(t.db, { day: '2026-10-31', adjustmentPct: -4 })).toEqual({
			base: 1200,
			adjustmentPct: -4,
			rate: 1152,
			date: '2026-10-30',
			stale: false,
			updatedAt: '2026-11-02T21:15:00.000Z',
			source: 'argentinadatos'
		});
		expect((await quoteFor(t.db, { day: '2026-11-02', adjustmentPct: 0 }))?.stale).toBe(true);
	});
});

describe('retiros', () => {
	const NOW = Date.parse('2026-11-02T15:00:00Z');

	it('validateWithdrawal', () => {
		expect(
			validateWithdrawal(
				{ day: '2026-11-01', usd: '120,50', ars: '150.000', note: '  banco  ' },
				{ now: NOW }
			)
		).toEqual({
			ok: true,
			value: { day: '2026-11-01', usdCents: 12_050, ars: 150_000, note: 'banco' }
		});
		expect(
			validateWithdrawal({ day: '2026-11-01', usd: '1', ars: '1' }, { now: NOW })
		).toMatchObject({
			ok: true,
			value: { note: null }
		});
		const bad = validateWithdrawal(
			{ day: '2026-11-03', usd: '0', ars: 'mucho', note: 'x'.repeat(201) },
			{ now: NOW }
		);
		expect(bad.ok).toBe(false);
		expect(Object.keys(/** @type {any} */ (bad).errors).sort()).toEqual([
			'ars',
			'day',
			'note',
			'usd'
		]);
		expect(validateWithdrawal({ day: 'ayer', usd: '1', ars: '1' }, { now: NOW }).ok).toBe(false);
	});

	it('se guardan, se listan con la cotización real y la estimada, y se borran', async () => {
		await storeRate(t.db, {
			day: '2026-10-30',
			compra: 1200,
			venta: 1210,
			source: 'argentinadatos',
			fetchedAt: 1
		});
		const id = await addWithdrawal(
			t.db,
			{ day: '2026-11-01', usdCents: 10_000, ars: 113_000, note: 'prueba' },
			{ by: 'admin-de-prueba', now: NOW }
		);
		const sinCotizacion = await addWithdrawal(
			t.db,
			{ day: '2026-10-01', usdCents: 5000, ars: 50_000, note: null },
			{ by: 'admin-de-prueba', now: NOW }
		);
		const list = await listWithdrawals(t.db, { adjustmentPct: -4 });
		expect(list).toEqual([
			{
				id,
				day: '2026-11-01',
				usdCents: 10_000,
				ars: 113_000,
				note: 'prueba',
				createdAt: NOW,
				createdBy: 'admin-de-prueba',
				realRate: 1130,
				estimatedRate: 1152, // 1200 del 30/10 (el último antes) con −4 %
				estimatedArs: 115_200,
				diffPct: -1.9 // (113.000 − 115.200) / 115.200
			},
			{
				id: sinCotizacion,
				day: '2026-10-01',
				usdCents: 5000,
				ars: 50_000,
				note: null,
				createdAt: NOW,
				createdBy: 'admin-de-prueba',
				realRate: 1000,
				estimatedRate: null,
				estimatedArs: null,
				diffPct: null
			}
		]);
		expect(await deleteWithdrawal(t.db, id)).toEqual({
			id,
			day: '2026-11-01',
			usdCents: 10_000,
			ars: 113_000
		});
		expect(await deleteWithdrawal(t.db, id)).toBeNull();
		expect(await listWithdrawals(t.db, { adjustmentPct: 0 })).toHaveLength(1);
	});
});

describe('loadPaypalPanel', () => {
	it('junta todo; si la base falla, error: true sin romper', async () => {
		const ok = await loadPaypalPanel(t.db, Date.parse('2026-11-02T15:00:00Z'));
		expect(ok).toMatchObject({ error: false, today: '2026-11-02', quote: null, withdrawals: [] });
		expect(ok.split).toHaveLength(6);
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = /** @type {any} */ ({
			prepare: () => {
				throw new Error('D1 caída');
			}
		});
		expect(await loadPaypalPanel(broken)).toMatchObject({
			error: true,
			split: [],
			withdrawals: []
		});
		spy.mockRestore();
	});
});
