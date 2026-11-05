/**
 * «Facturada» (invoiced.js): qué compra es para facturar, marcar y desmarcar, la lista de todas
 * las que faltan (de la más vieja a la más nueva, por mes de compra en hora de Argentina) y el
 * registro en Actividad. D1 de miniflare; órdenes y personas inventadas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '../db/testing.js';
import { listAudit } from './audit.js';
import {
	countUninvoicedOrders,
	countsForInvoicing,
	invoiceMonthKey,
	invoiceMonthLabel,
	invoiceMonths,
	invoicedFromPanel,
	listInvoicedInMonth,
	listUninvoicedOrders,
	parseMonthKey,
	setOrderInvoiced
} from './invoiced.js';

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

const OCT = Date.parse('2026-10-10T15:00:00Z');
const NOV = Date.parse('2026-11-02T15:00:00Z');
// 31/10 a las 22:00 en Argentina: en UTC ya es noviembre, pero la compra es de octubre.
const OCT_LATE = Date.parse('2026-11-01T01:00:00Z');
const admin = /** @type {any} */ ({ user: { id: 1, login: 'admin-inventade' } });

/**
 * @param {string} id
 * @param {{ slug?: string, status?: string, total?: number, method?: string,
 *   channel?: string, refunded?: number | null, createdAt?: number }} [o]
 */
async function order(
	id,
	{
		slug = 'evento-de-prueba',
		status = 'approved',
		total = 10000,
		method = 'mercadopago',
		channel = 'online',
		refunded = null,
		createdAt = OCT
	} = {}
) {
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
				fondo_amount, fondo_contribution, subtotal, total, buyer_name, buyer_email, status,
				payment_method, channel, refunded_amount, created_at, updated_at, expires_at)
			VALUES (?1, ?2, 'general', 1, ?3, 'solidaria', 0, 0, ?3, ?3, 'Persona Inventada',
				'persona@example.com', ?4, ?5, ?6, ?7, ?8, ?8, ?8)`
		)
		.bind(id, slug, total, status, method, channel, refunded, createdAt)
		.run();
}

describe('countsForInvoicing: qué compra es para facturar', () => {
	it('aprobada con plata, aunque tenga un reembolso parcial', () => {
		expect(countsForInvoicing({ status: 'approved', total: 100 })).toBe(true);
		expect(countsForInvoicing({ status: 'approved', total: 100, refunded_amount: 40 })).toBe(true);
	});
	it('no: $ 0, reembolsada entera, reservada o reembolsada', () => {
		expect(countsForInvoicing({ status: 'approved', total: 0 })).toBe(false);
		expect(countsForInvoicing({ status: 'approved', total: 100, refunded_amount: 100 })).toBe(
			false
		);
		expect(countsForInvoicing({ status: 'awaiting_transfer', total: 100 })).toBe(false);
		expect(countsForInvoicing({ status: 'refunded', total: 100 })).toBe(false);
	});
});

describe('meses', () => {
	it('el mes de la compra es el de Argentina', () => {
		expect(invoiceMonthKey(OCT_LATE)).toBe('2026-10');
		expect(invoiceMonthKey(NOV)).toBe('2026-11');
		expect(invoiceMonthLabel('2026-10')).toBe('Octubre 2026');
	});
	it('solo acepta AAAA-MM de la URL', () => {
		expect(parseMonthKey('2026-10')).toBe('2026-10');
		expect(parseMonthKey('2026-13')).toBe('');
		expect(parseMonthKey("2026-10' OR 1")).toBe('');
		expect(parseMonthKey(null)).toBe('');
	});
});

describe('setOrderInvoiced', () => {
	it('marca con fecha y login, y desmarca', async () => {
		await order('o1');
		const r = await setOrderInvoiced(t.db, 'o1', true, 'admin-inventade', { now: NOV });
		expect(r.result).toBe('done');
		expect(r.order).toMatchObject({ invoiced_at: NOV, invoiced_by: 'admin-inventade' });
		// La fecha de la venta (`updated_at`) no cambia.
		expect(r.order?.updated_at).toBe(OCT);
		expect((await setOrderInvoiced(t.db, 'o1', true, 'otre', { now: NOV + 1 })).result).toBe(
			'already'
		);
		const off = await setOrderInvoiced(t.db, 'o1', false, 'admin-inventade');
		expect(off.result).toBe('done');
		expect(off.order).toMatchObject({ invoiced_at: null, invoiced_by: null });
		expect((await setOrderInvoiced(t.db, 'o1', false, 'admin-inventade')).result).toBe('already');
	});

	it('no marca lo que no es para facturar', async () => {
		await order('gratis', { total: 0, method: 'gratis', channel: 'manual' });
		await order('reserva', { status: 'awaiting_transfer', method: 'transferencia' });
		await order('devuelta', { refunded: 10000 });
		for (const id of ['gratis', 'reserva', 'devuelta']) {
			const r = await setOrderInvoiced(t.db, id, true, 'admin-inventade');
			expect(r.result).toBe('not_eligible');
			expect(r.order?.invoiced_at).toBeNull();
		}
		expect((await setOrderInvoiced(t.db, 'no-existe', true, 'x')).result).toBe('not_found');
	});

	it('con eventSlug, no toca una orden de otro evento', async () => {
		await order('o1', { slug: 'otro-evento' });
		const r = await setOrderInvoiced(t.db, 'o1', true, 'x', { eventSlug: 'evento-de-prueba' });
		expect(r.result).toBe('not_found');
		const row = await t.db.prepare("SELECT invoiced_at FROM orders WHERE id = 'o1'").first();
		expect(row?.invoiced_at).toBeNull();
	});
});

describe('invoicedFromPanel', () => {
	it('deja registro al marcar y al desmarcar, y no cuando no cambia nada', async () => {
		await order('o1');
		const on = await invoicedFromPanel(t.db, admin, { orderId: 'o1', invoiced: true, by: 'a' });
		expect(on.ok).toBe(true);
		expect(on.body.invoiced).toMatchObject({ ok: true, message: 'Marcada como facturada.' });
		await invoicedFromPanel(t.db, admin, { orderId: 'o1', invoiced: true, by: 'a' });
		await invoicedFromPanel(t.db, admin, { orderId: 'o1', invoiced: false, by: 'a' });
		const log = (await listAudit(t.db)).filter((e) => e.action.startsWith('order.'));
		expect(log.map((e) => e.action).sort()).toEqual(['order.invoiced', 'order.uninvoiced']);
		expect(log.find((e) => e.action === 'order.invoiced')?.summary).toMatch(
			/^Marcó como facturada la orden KV-/
		);
		expect(log.find((e) => e.action === 'order.uninvoiced')?.summary).toMatch(
			/^Desmarcó como facturada la orden KV-/
		);
		// Sin datos de quien compró en el registro.
		expect(JSON.stringify(log)).not.toContain('persona@example.com');
	});

	it('una orden sin pago: 400 y sin registro', async () => {
		await order('gratis', { total: 0, method: 'gratis', channel: 'manual' });
		const r = await invoicedFromPanel(t.db, admin, { orderId: 'gratis', invoiced: true, by: 'a' });
		expect(r).toMatchObject({ ok: false, status: 400 });
		expect(await listAudit(t.db)).toEqual([]);
	});
});

describe('la lista de todas las que faltan', () => {
	it('de la más vieja a la más nueva, solo las para facturar y sin facturar', async () => {
		await order('nov', {
			createdAt: NOV,
			slug: 'otro-evento',
			method: 'efectivo',
			channel: 'puerta'
		});
		await order('oct', { createdAt: OCT });
		await order('oct-tarde', { createdAt: OCT_LATE, method: 'transferencia' });
		await order('gratis', { total: 0, method: 'gratis', channel: 'manual' });
		await order('reembolsada', { status: 'refunded' });
		await order('facturada', { createdAt: OCT + 1 });
		await setOrderInvoiced(t.db, 'facturada', true, 'a');

		const rows = await listUninvoicedOrders(t.db);
		expect(rows.map((r) => r.id)).toEqual(['oct', 'oct-tarde', 'nov']);
		expect(rows.map((r) => r.month)).toEqual(['2026-10', '2026-10', '2026-11']);
		expect(rows[2]).toMatchObject({ channel: 'puerta', method: 'efectivo', event: 'otro-evento' });
		expect(await listUninvoicedOrders(t.db, { limit: 1 })).toHaveLength(1);
		expect(await countUninvoicedOrders(t.db)).toBe(3);

		expect(await invoiceMonths(t.db)).toEqual([
			{ month: '2026-10', pending: 2, invoiced: 1 },
			{ month: '2026-11', pending: 1, invoiced: 0 }
		]);
		const done = await listInvoicedInMonth(t.db, '2026-10');
		expect(done.map((r) => r.id)).toEqual(['facturada']);
		expect(done[0].invoicedBy).toBe('a');
		expect(await listInvoicedInMonth(t.db, '2026-11')).toEqual([]);
		expect(await listInvoicedInMonth(t.db, 'cualquier-cosa')).toEqual([]);
	});
});
