import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	HOLD_MS,
	applyPayment,
	checkIn,
	getCounts,
	getOrder,
	getOrderTickets,
	isValidToken,
	listOrders,
	nextStatus,
	newToken,
	reserveOrder,
	searchTickets,
	undoCheckIn
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

const EVENT = 'fiesta-de-prueba';
const GENERAL = { id: 'general', price: 8000, capacity: 5 };
const NOW = Date.parse('2026-10-01T12:00:00Z');

/** @param {Partial<Parameters<typeof reserveOrder>[1]>} [o] */
function reserve(o = {}) {
	return reserveOrder(t.db, {
		eventSlug: EVENT,
		type: GENERAL,
		quantity: 1,
		name: 'Persona de Prueba',
		email: 'prueba@example.com',
		now: NOW,
		...o
	});
}

/** @param {string} orderId @param {Partial<import('./orders.js').MPPayment>} [o] */
function payment(orderId, o = {}) {
	return {
		id: 111,
		status: 'approved',
		external_reference: orderId,
		transaction_amount: 8000,
		currency_id: 'ARS',
		...o
	};
}

describe('reserva de cupo', () => {
	it('crea una orden pending con total del servidor y reserva', async () => {
		const r = await reserve({ quantity: 2 });
		expect(r.ok).toBe(true);
		const order = /** @type {any} */ (r).order;
		expect(order).toMatchObject({
			status: 'pending',
			quantity: 2,
			unit_price: 8000,
			total: 16000,
			expires_at: NOW + HOLD_MS
		});
		expect(order.id).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('no deja pasarse del cupo y libera las reservas vencidas', async () => {
		expect((await reserve({ quantity: 4 })).ok).toBe(true);
		const full = await reserve({ quantity: 2 });
		expect(full).toEqual({ ok: false, reason: 'soldout', available: 1 });
		expect((await reserve({ quantity: 1 })).ok).toBe(true);
		// 21 minutos después las reservas vencieron.
		const later = NOW + HOLD_MS + 60000;
		expect((await reserve({ quantity: 4, now: later })).ok).toBe(true);
		const { results } = await t.db
			.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status ORDER BY status')
			.all();
		expect(results).toEqual([
			{ status: 'expired', n: 2 },
			{ status: 'pending', n: 1 }
		]);
	});

	it('cuenta aprobadas siempre y los rechazos mientras dura la reserva', async () => {
		const a = /** @type {any} */ (await reserve({ quantity: 3 })).order;
		await applyPayment(t.db, payment(a.id, { transaction_amount: 24000 }), { now: NOW });
		const b = /** @type {any} */ (await reserve({ quantity: 2 })).order;
		await applyPayment(
			t.db,
			payment(b.id, { id: 222, status: 'rejected', transaction_amount: 16000 }),
			{ now: NOW }
		);
		expect((await reserve()).ok).toBe(false);
		const counts = await getCounts(t.db, EVENT, NOW);
		expect(counts.get('general')).toEqual({ sold: 3, held: 2, revenue: 24000 });
		// Vencida la reserva del rechazo, vuelve a haber lugar; la aprobada nunca vence.
		expect((await reserve({ quantity: 2, now: NOW + HOLD_MS + 1 })).ok).toBe(true);
		expect((await reserve({ now: NOW + HOLD_MS + 1 })).ok).toBe(false);
	});

	it('cupos separados por tipo y por evento', async () => {
		await reserve({ quantity: 4 });
		await reserve({ quantity: 1 });
		expect((await reserve({ type: { id: 'reducida', price: 5000, capacity: 1 } })).ok).toBe(true);
		expect((await reserve({ eventSlug: 'otro-evento' })).ok).toBe(true);
	});

	it('carrera: muchas compras simultáneas nunca sobrevenden', async () => {
		const attempts = Array.from({ length: 30 }, (_, i) =>
			reserve({ quantity: 1 + (i % 3), email: `p${i}@example.com` })
		);
		const results = await Promise.all(attempts);
		const sold = results
			.filter((r) => r.ok)
			.reduce((s, r) => s + /** @type {any} */ (r).order.quantity, 0);
		expect(sold).toBeLessThanOrEqual(GENERAL.capacity);
		expect(sold).toBeGreaterThan(0);
		const counts = await getCounts(t.db, EVENT, NOW);
		expect(counts.get('general')?.held).toBe(sold);
		// Con cupo 5 y pedidos de 1 a 3, alguna combinación tiene que haber llenado casi todo.
		expect(sold).toBeGreaterThanOrEqual(GENERAL.capacity - 2);
	});
});

describe('nextStatus (máquina de estados)', () => {
	it.each([
		['pending', null, 'approved', 'p1', 'approved'],
		['pending', null, 'rejected', 'p1', 'rejected'],
		['rejected', 'p1', 'approved', 'p2', 'approved'],
		['expired', null, 'approved', 'p1', 'approved'],
		['cancelled', null, 'approved', 'p1', 'approved'],
		['approved', 'p1', 'approved', 'p1', null],
		['approved', 'p1', 'rejected', 'p2', null],
		['approved', 'p1', 'pending', 'p1', null],
		['approved', 'p1', 'cancelled', 'p1', null],
		['approved', 'p1', 'refunded', 'p2', null],
		['approved', 'p1', 'refunded', 'p1', 'refunded'],
		['refunded', 'p1', 'approved', 'p1', null],
		['rejected', 'p1', 'rejected', 'p1', null],
		['expired', null, 'rejected', 'p1', null],
		['pending', null, 'pending', 'p1', null]
	])('%s (%s) + %s (%s) → %s', (current, currentId, incoming, id, expected) => {
		expect(
			nextStatus(
				/** @type {any} */ (current),
				/** @type {string|null} */ (currentId),
				/** @type {any} */ (incoming),
				/** @type {string} */ (id)
			)
		).toBe(expected);
	});
});

describe('applyPayment', () => {
	it('aprobado emite una entrada por unidad, una sola vez aunque se repita', async () => {
		const o = /** @type {any} */ (await reserve({ quantity: 3 })).order;
		const p = payment(o.id, { transaction_amount: 24000 });
		const first = await applyPayment(t.db, p);
		expect(first).toMatchObject({ outcome: 'updated', newlyApproved: true });
		expect(first.tickets).toHaveLength(3);
		for (const tk of first.tickets) expect(isValidToken(tk.token)).toBe(true);
		expect(new Set(first.tickets.map((tk) => tk.token)).size).toBe(3);

		const again = await applyPayment(t.db, p);
		expect(again).toMatchObject({ outcome: 'unchanged', newlyApproved: false });
		// Dos notificaciones iguales a la vez: tampoco duplica.
		await Promise.all([applyPayment(t.db, p), applyPayment(t.db, p)]);
		expect(await getOrderTickets(t.db, o.id)).toHaveLength(3);
		expect((await getOrder(t.db, o.id))?.status).toBe('approved');
	});

	it('webhooks concurrentes de aprobación: solo uno manda el mail', async () => {
		const o = /** @type {any} */ (await reserve({ quantity: 2 })).order;
		const p = payment(o.id, { transaction_amount: 16000 });
		const results = await Promise.all([
			applyPayment(t.db, p),
			applyPayment(t.db, p),
			applyPayment(t.db, p)
		]);
		expect(results.filter((r) => r.newlyApproved)).toHaveLength(1);
		expect(await getOrderTickets(t.db, o.id)).toHaveLength(2);
	});

	it('un rechazo que llega tarde no pisa una aprobación', async () => {
		const o = /** @type {any} */ (await reserve()).order;
		await applyPayment(t.db, payment(o.id));
		const late = await applyPayment(t.db, payment(o.id, { id: 999, status: 'rejected' }));
		expect(late.outcome).toBe('unchanged');
		expect((await getOrder(t.db, o.id))?.status).toBe('approved');
	});

	it('rechazo y después aprobación de otro intento', async () => {
		const o = /** @type {any} */ (await reserve()).order;
		expect(
			(await applyPayment(t.db, payment(o.id, { id: 1, status: 'rejected' }))).order?.status
		).toBe('rejected');
		const ok = await applyPayment(t.db, payment(o.id, { id: 2 }));
		expect(ok.newlyApproved).toBe(true);
		expect(ok.order).toMatchObject({ status: 'approved', mp_payment_id: '2' });
	});

	it('reembolso del pago aprobado anula las entradas en el check-in', async () => {
		const o = /** @type {any} */ (await reserve()).order;
		const { tickets } = await applyPayment(t.db, payment(o.id));
		await applyPayment(t.db, payment(o.id, { status: 'refunded' }));
		expect((await getOrder(t.db, o.id))?.status).toBe('refunded');
		const r = await checkIn(t.db, { token: tickets[0].token, eventSlug: EVENT, by: 'admin' });
		expect(r.result).toBe('void');
		// Y un "approved" viejo que llega después no la revive.
		expect((await applyPayment(t.db, payment(o.id))).outcome).toBe('unchanged');
	});

	it('ignora montos o monedas que no coinciden y órdenes desconocidas', async () => {
		const o = /** @type {any} */ (await reserve()).order;
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect((await applyPayment(t.db, payment(o.id, { transaction_amount: 1 }))).outcome).toBe(
			'mismatch'
		);
		expect((await applyPayment(t.db, payment(o.id, { currency_id: 'USD' }))).outcome).toBe(
			'mismatch'
		);
		spy.mockRestore();
		expect((await getOrder(t.db, o.id))?.status).toBe('pending');
		expect((await applyPayment(t.db, payment(crypto.randomUUID()))).outcome).toBe('unknown-order');
		expect((await applyPayment(t.db, payment('no-es-uuid'))).outcome).toBe('unknown-order');
	});

	it('aprobación con la reserva vencida se respeta (la plata entró) y avisa', async () => {
		const o = /** @type {any} */ (await reserve()).order;
		await reserve({ now: NOW + HOLD_MS + 1 }); // marca la primera como expired
		expect((await getOrder(t.db, o.id))?.status).toBe('expired');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const r = await applyPayment(t.db, payment(o.id));
		expect(r.newlyApproved).toBe(true);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe('check-in', () => {
	/** @param {number} [quantity] */
	async function approvedTickets(quantity = 2) {
		const o = /** @type {any} */ (await reserve({ quantity })).order;
		return (await applyPayment(t.db, payment(o.id, { transaction_amount: 8000 * quantity })))
			.tickets;
	}

	it('marca el ingreso una sola vez y dice quién y cuándo', async () => {
		const [a] = await approvedTickets();
		const first = await checkIn(t.db, {
			token: a.token,
			eventSlug: EVENT,
			by: 'puerta1',
			now: 1000
		});
		expect(first.result).toBe('ok');
		expect(first.ticket).toMatchObject({ checked_in_at: 1000, checked_in_by: 'puerta1' });
		const second = await checkIn(t.db, {
			token: a.token,
			eventSlug: EVENT,
			by: 'puerta2',
			now: 2000
		});
		expect(second.result).toBe('already');
		expect(second.ticket).toMatchObject({ checked_in_at: 1000, checked_in_by: 'puerta1' });
	});

	it('dos escaneos simultáneos: gana uno', async () => {
		const [a] = await approvedTickets(1);
		const results = await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				checkIn(t.db, { token: a.token, eventSlug: EVENT, by: `p${i}` })
			)
		);
		expect(results.filter((r) => r.result === 'ok')).toHaveLength(1);
	});

	it('distingue otro evento, token inválido y orden no aprobada', async () => {
		const [a] = await approvedTickets(1);
		expect(
			(await checkIn(t.db, { token: a.token, eventSlug: 'otro-evento', by: 'x' })).result
		).toBe('wrong-event');
		expect((await checkIn(t.db, { token: newToken(), eventSlug: EVENT, by: 'x' })).result).toBe(
			'invalid'
		);
		expect((await checkIn(t.db, { token: "' OR 1=1 --", eventSlug: EVENT, by: 'x' })).result).toBe(
			'invalid'
		);
	});

	it('se puede deshacer, y la búsqueda manual encuentra por nombre, email o token', async () => {
		const [a] = await approvedTickets(1);
		await checkIn(t.db, { token: a.token, eventSlug: EVENT, by: 'x' });
		expect(await undoCheckIn(t.db, { ticketId: a.id, eventSlug: EVENT })).toBe(true);
		expect((await checkIn(t.db, { token: a.token, eventSlug: EVENT, by: 'x' })).result).toBe('ok');
		expect(await searchTickets(t.db, EVENT, 'persona')).toHaveLength(1);
		expect(await searchTickets(t.db, EVENT, 'PRUEBA@example')).toHaveLength(1);
		expect(await searchTickets(t.db, EVENT, a.token.slice(0, 8))).toHaveLength(1);
		expect(await searchTickets(t.db, EVENT, '%')).toHaveLength(0);
		expect(await searchTickets(t.db, 'otro-evento', '')).toHaveLength(0);
		const orders = await listOrders(t.db, EVENT);
		expect(orders[0]).toMatchObject({ status: 'approved', checked_in: 1 });
	});
});
