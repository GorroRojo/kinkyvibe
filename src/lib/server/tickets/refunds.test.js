import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { checkDiscountCode, createDiscountCode } from './discounts.js';
import { buildRefundEmail } from './email.js';
import {
	applyPayment,
	checkIn,
	confirmTransfer,
	getCounts,
	getOrder,
	getTicketByToken,
	refundOrder,
	reserveOrder
} from './orders.js';

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

const EVENT = 'fiesta';
const TYPE = { id: 'general', price: 10000, fondo: 2000, capacity: 2 };
const buyer = { name: 'Ale', pronouns: 'elle', email: 'ale@example.com', dni: '30111222' };

/** Orden de 2 entradas pagada con MP (llena el cupo). */
/** @param {{ code: string, kind: "percent" | "fixed", value: number } | null} [discount] */
async function paidOrder(discount = null) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: TYPE,
			quantity: 2,
			buyer,
			holders: [
				{ name: 'Ale', pronouns: 'elle' },
				{ name: 'Otra', pronouns: 'ella' }
			],
			discount
		})
	);
	const res = await applyPayment(t.db, {
		id: 555,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: r.order.total,
		currency_id: 'ARS'
	});
	return { order: /** @type {any} */ (res.order), tickets: res.tickets };
}

describe('reembolsos', () => {
	it('reembolsar: anula las entradas, libera cupo y sale de los totales del fondo', async () => {
		const { order, tickets } = await paidOrder();
		expect((await getCounts(t.db, EVENT)).get('general')).toMatchObject({ sold: 2, fondo: 4000 });
		// Sin cupo antes del reembolso.
		const full = await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: TYPE,
			quantity: 1,
			buyer,
			holders: [{ name: 'Ale', pronouns: 'elle' }]
		});
		expect(full.ok).toBe(false);

		const r = await refundOrder(t.db, {
			orderId: order.id,
			eventSlug: EVENT,
			by: 'admin',
			now: 77
		});
		expect(r.result).toBe('refunded');
		expect(r.order).toMatchObject({ status: 'refunded', refunded_at: 77, refunded_by: 'admin' });
		expect((await getCounts(t.db, EVENT)).get('general')).toMatchObject({
			sold: 0,
			fondo: 0,
			revenue: 0
		});
		// El control de ingreso la rechaza.
		expect(
			(await checkIn(t.db, { token: tickets[0].token, eventSlug: EVENT, by: 'puerta' })).result
		).toBe('void');
		expect((await getTicketByToken(t.db, tickets[0].token))?.order_status).toBe('refunded');
		// Hay cupo otra vez.
		const again = await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: TYPE,
			quantity: 2,
			buyer,
			holders: [
				{ name: 'A', pronouns: 'x' },
				{ name: 'B', pronouns: 'y' }
			]
		});
		expect(again.ok).toBe(true);
	});

	it('idempotente: doble click y webhook de MP después del reembolso manual', async () => {
		const { order } = await paidOrder();
		expect((await refundOrder(t.db, { orderId: order.id, eventSlug: EVENT, by: 'a' })).result).toBe(
			'refunded'
		);
		const second = await refundOrder(t.db, { orderId: order.id, eventSlug: EVENT, by: 'b' });
		expect(second.result).toBe('already');
		expect(second.order?.refunded_by).toBe('a');
		const hook = await applyPayment(t.db, {
			id: 555,
			status: 'refunded',
			external_reference: order.id,
			transaction_amount: order.total,
			currency_id: 'ARS'
		});
		expect(hook.outcome).toBe('unchanged');
		expect((await getOrder(t.db, order.id))?.refunded_by).toBe('a');
	});

	it('reembolso que llega solo por el webhook: queda registrado (sin quién)', async () => {
		const { order } = await paidOrder();
		const hook = await applyPayment(
			t.db,
			{
				id: 555,
				status: 'refunded',
				external_reference: order.id,
				transaction_amount: order.total,
				currency_id: 'ARS'
			},
			{ now: 999 }
		);
		expect(hook.outcome).toBe('updated');
		expect(hook.order).toMatchObject({ status: 'refunded', refunded_at: 999, refunded_by: null });
		// Después, el admin: ya estaba.
		expect((await refundOrder(t.db, { orderId: order.id, eventSlug: EVENT, by: 'a' })).result).toBe(
			'already'
		);
	});

	it('libera el uso del código de descuento', async () => {
		await createDiscountCode(
			t.db,
			{
				code: 'UNO',
				kind: 'percent',
				value: 10,
				event_slug: EVENT,
				starts_at: null,
				ends_at: null,
				max_uses: 1
			},
			{ by: 'admin' }
		);
		const { order } = await paidOrder({ code: 'UNO', kind: 'percent', value: 10 });
		expect((await checkDiscountCode(t.db, { code: 'UNO', eventSlug: EVENT })).ok).toBe(false);
		await refundOrder(t.db, { orderId: order.id, eventSlug: EVENT, by: 'admin' });
		expect((await checkDiscountCode(t.db, { code: 'UNO', eventSlug: EVENT })).ok).toBe(true);
	});

	it('solo órdenes aprobadas del mismo evento; transferencias devueltas a mano también', async () => {
		const { order } = await paidOrder();
		expect(
			(await refundOrder(t.db, { orderId: order.id, eventSlug: 'otro', by: 'a' })).result
		).toBe('not-found');
		const tr = /** @type {any} */ (
			await reserveOrder(t.db, {
				eventSlug: 'otro',
				type: { id: 'general', price: 5000, capacity: 5 },
				quantity: 1,
				buyer,
				holders: [{ name: 'Ale', pronouns: 'elle' }],
				method: 'transferencia'
			})
		).order;
		expect((await refundOrder(t.db, { orderId: tr.id, eventSlug: 'otro', by: 'a' })).result).toBe(
			'not-approved'
		);
		await confirmTransfer(t.db, { orderId: tr.id, eventSlug: 'otro', capacity: 5, by: 'a' });
		expect((await refundOrder(t.db, { orderId: tr.id, eventSlug: 'otro', by: 'a' })).result).toBe(
			'refunded'
		);
	});

	it('el mail de reembolso dice el monto y que las entradas ya no valen', async () => {
		const { order } = await paidOrder();
		const mail = buildRefundEmail({
			order,
			event: { title: 'Fiesta' },
			typeName: 'General',
			contactEmail: 'c@example.com'
		});
		expect(mail.subject).toBe('Reembolso de tu compra · Fiesta');
		expect(mail.text).toContain('ya no son válidas');
		expect(mail.html).toMatch(/\$\s16\.000/);
		expect(mail.text).not.toContain('30111222');
	});
});
