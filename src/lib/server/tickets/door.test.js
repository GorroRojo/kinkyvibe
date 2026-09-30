import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit } from '$lib/server/admin/audit.js';
import {
	applyQueuedCheckIns,
	checkinGroup,
	dniTail,
	doorCounts,
	offlineList,
	orderRef,
	parseQueue,
	purchaseDetails,
	QUEUE_MAX_AGE_MS,
	revealDni,
	sellAtDoor,
	sha256Hex,
	ticketWithBuyer
} from './door.js';
import { checkIn, normalizeTicketCode, reserveOrder, tokenByCode } from './orders.js';

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
const NOW = Date.parse('2026-10-01T23:00:00Z');
const GENERAL = { id: 'general', name: 'General', price: 8000, fondo: 0, capacity: 3, gorra: null };
const names = { general: 'General' };
const locals = /** @type {App.Locals} */ (
	/** @type {unknown} */ ({ user: { id: 1, login: 'admin-de-prueba' } })
);

/** @param {Partial<Parameters<typeof sellAtDoor>[1]>} [o] */
function sell(o = {}) {
	const quantity = o.quantity ?? 1;
	return sellAtDoor(t.db, {
		eventSlug: EVENT,
		type: GENERAL,
		quantity,
		holders: Array.from({ length: quantity }, (_, i) => ({
			name: `Persona ${i + 1}`,
			pronouns: 'elle'
		})),
		buyer: { name: 'Persona 1', email: 'Prueba@Example.com', dni: '30123456' },
		method: 'efectivo',
		by: 'admin-de-prueba',
		now: NOW,
		...o
	});
}

/** Entrada de un evento sin ingresar, creada por la venta en la puerta y "des-ingresada". */
async function freshTicket() {
	const r = await sell();
	if (!r.ok) throw new Error('sin cupo');
	await t.db.prepare('UPDATE tickets SET checked_in_at = NULL, checked_in_by = NULL').run();
	return r.tickets[0];
}

/** @param {string} raw */
async function resolve(raw) {
	const code = normalizeTicketCode(raw);
	return code ? ((await tokenByCode(t.db, EVENT, code)) ?? '') : raw;
}

describe('helpers', () => {
	it('dniTail, orderRef, sha256Hex', async () => {
		expect(dniTail('30123456')).toBe('456');
		expect(dniTail(null)).toBe('');
		expect(orderRef('abcdef12-3456')).toBe('KV-ABCDEF12');
		expect(await sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});
	it('parseQueue valida la cola del celu', () => {
		expect(parseQueue([{ id: 'a', code: 'ABC234', at: 1 }])).toEqual([
			{ id: 'a', code: 'ABC234', token: undefined, at: 1 }
		]);
		expect(parseQueue([{ id: 'a', at: 1 }])).toBeNull();
		expect(parseQueue([{ id: '', code: 'x', at: 1 }])).toBeNull();
		expect(parseQueue([{ id: 'a', code: 'x', at: 'ayer' }])).toBeNull();
		expect(parseQueue({})).toBeNull();
		expect(
			parseQueue(Array.from({ length: 501 }, (_, i) => ({ id: `${i}`, code: 'x', at: 1 })))
		).toBeNull();
	});
});

describe('sellAtDoor', () => {
	it('crea una orden aprobada de la puerta, emite las entradas y las marca adentro', async () => {
		const r = await sell({ quantity: 2 });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.order).toMatchObject({
			status: 'approved',
			payment_method: 'efectivo',
			channel: 'puerta',
			confirmed_by: 'admin-de-prueba',
			total: 16000,
			surcharge_amount: 0,
			buyer_email: 'prueba@example.com',
			quantity: 2
		});
		expect(r.tickets).toHaveLength(2);
		expect(r.tickets.map((x) => x.holder_name)).toEqual(['Persona 1', 'Persona 2']);
		for (const x of r.tickets) {
			expect(x.checked_in_at).toBe(NOW);
			expect(x.checked_in_by).toBe('admin-de-prueba');
			expect(x.code).toMatch(/^[0-9A-Z]{6}$/);
		}
		const stored = await t.db.prepare('SELECT holders FROM orders').first();
		expect(stored?.holders).toBeNull();
		expect(await doorCounts(t.db, EVENT)).toEqual({
			total: 2,
			inside: 2,
			byType: { general: { total: 2, inside: 2 } }
		});
	});

	it('respeta el cupo (con las reservas online vigentes) y no se pasa con ventas simultáneas', async () => {
		// Una reserva online vigente ocupa 1 de los 3 lugares.
		const online = await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: GENERAL,
			quantity: 1,
			holders: [{ name: 'Online', pronouns: '' }],
			buyer: { name: 'Online', email: 'online@example.com', dni: '30000000' },
			now: NOW
		});
		expect(online.ok).toBe(true);
		const tooMany = await sell({ quantity: 3 });
		expect(tooMany).toEqual({ ok: false, reason: 'soldout', available: 2 });
		const results = await Promise.all([sell(), sell(), sell()]);
		expect(results.filter((r) => r.ok)).toHaveLength(2);
		const sold = await t.db
			.prepare("SELECT COALESCE(SUM(quantity), 0) AS n FROM orders WHERE channel = 'puerta'")
			.first();
		expect(sold?.n).toBe(2);
		expect(await t.db.prepare('SELECT COUNT(*) AS n FROM tickets').first()).toMatchObject({ n: 2 });
	});

	it('transferencia, fondo y a la gorra en 0 (queda sin cargo)', async () => {
		const withFondo = { ...GENERAL, fondo: 2000, capacity: 10 };
		const r = await sell({
			type: withFondo,
			method: 'transferencia',
			option: 'fondo',
			fondoPercent: 25
		});
		expect(r.ok && r.order).toMatchObject({
			payment_method: 'transferencia',
			fondo_option: 'fondo',
			fondo_amount: 2000,
			total: 6000,
			fondo_percent: 25
		});
		const gorra = { ...GENERAL, id: 'gorra', gorra: { min: 0, suggested: 3000 }, capacity: 10 };
		const g = await sell({ type: gorra, unitPrice: 0 });
		expect(g.ok && g.order).toMatchObject({
			payment_method: 'gratis',
			total: 0,
			fondo_option: 'gorra'
		});
		await expect(sell({ type: gorra, unitPrice: -1 })).rejects.toThrow(/Precio/);
	});
});

describe('applyQueuedCheckIns (sin conexión)', () => {
	it('aplica, es idempotente al reintentar y reporta conflictos', async () => {
		const ticket = await freshTicket();
		const items = [{ id: 'q1', code: `kv-${ticket.code?.toLowerCase()}`, at: NOW - 60_000 }];
		const first = await applyQueuedCheckIns(t.db, {
			eventSlug: EVENT,
			by: 'admin-de-prueba',
			items,
			now: NOW,
			resolve
		});
		expect(first).toEqual([
			{ id: 'q1', result: 'ok', holder: 'Persona 1', at: NOW - 60_000, by: 'admin-de-prueba' }
		]);
		// El mismo pedido otra vez (se cortó la conexión antes de la respuesta): nada nuevo.
		const again = await applyQueuedCheckIns(t.db, {
			eventSlug: EVENT,
			by: 'admin-de-prueba',
			items,
			now: NOW + 5000,
			resolve
		});
		expect(again[0].result).toBe('duplicate');
		const row = await ticketWithBuyer(t.db, { id: ticket.id });
		expect(row?.checked_in_at).toBe(NOW - 60_000);

		// Otro celu la había marcado sin conexión también: conflicto, gana el primero.
		const other = await applyQueuedCheckIns(t.db, {
			eventSlug: EVENT,
			by: 'otre-admin',
			items: [{ id: 'q2', token: ticket.token, at: NOW - 30_000 }],
			now: NOW,
			resolve
		});
		expect(other).toEqual([
			{ id: 'q2', result: 'conflict', holder: 'Persona 1', at: NOW - 60_000, by: 'admin-de-prueba' }
		]);
	});

	it('anuladas, inválidas, de otro evento y horas fuera de rango', async () => {
		const ticket = await freshTicket();
		const other = await sellAtDoor(t.db, {
			eventSlug: 'otro-evento',
			type: GENERAL,
			quantity: 1,
			holders: [{ name: 'Otra', pronouns: '' }],
			buyer: { name: 'Otra', email: '' },
			method: 'efectivo',
			by: 'x',
			now: NOW
		});
		if (!other.ok) throw new Error('sin cupo');
		const res = await applyQueuedCheckIns(t.db, {
			eventSlug: EVENT,
			by: 'admin-de-prueba',
			items: [
				{ id: 'bad', code: 'ZZZZZZ', at: NOW },
				{ id: 'wrong', token: other.tickets[0].token, at: NOW },
				// Reloj del celu 1 hora adelantado: queda en "ahora".
				{ id: 'future', token: ticket.token, at: NOW + 3_600_000 }
			],
			now: NOW,
			resolve
		});
		expect(res.map((r) => r.result)).toEqual(['invalid', 'wrong-event', 'ok']);
		expect(res[2].at).toBe(NOW);

		await t.db.prepare('UPDATE tickets SET checked_in_at = NULL').run();
		await t.db.prepare("UPDATE orders SET status = 'refunded'").run();
		const old = await applyQueuedCheckIns(t.db, {
			eventSlug: EVENT,
			by: 'admin-de-prueba',
			items: [{ id: 'void', token: ticket.token, at: 0 }],
			now: NOW,
			resolve
		});
		expect(old[0].result).toBe('void');

		// Una hora muy vieja se acota a QUEUE_MAX_AGE_MS.
		await t.db.prepare("UPDATE orders SET status = 'approved'").run();
		const clamped = await applyQueuedCheckIns(t.db, {
			eventSlug: EVENT,
			by: 'admin-de-prueba',
			items: [{ id: 'old', token: ticket.token, at: 0 }],
			now: NOW,
			resolve
		});
		expect(clamped[0]).toMatchObject({ result: 'ok', at: NOW - QUEUE_MAX_AGE_MS });
	});

	it('convive con el check-in online: si ya entró por otro lado, es conflicto', async () => {
		const ticket = await freshTicket();
		await checkIn(t.db, { token: ticket.token, eventSlug: EVENT, by: 'online', now: NOW - 1000 });
		const res = await applyQueuedCheckIns(t.db, {
			eventSlug: EVENT,
			by: 'admin-de-prueba',
			items: [{ id: 'q', token: ticket.token, at: NOW }],
			now: NOW,
			resolve
		});
		expect(res[0]).toMatchObject({ result: 'conflict', by: 'online', at: NOW - 1000 });
	});
});

describe('revealDni', () => {
	it('devuelve el DNI completo y lo anota en el registro, sin el número', async () => {
		const ticket = await freshTicket();
		const dni = await revealDni(t.db, locals, { slug: EVENT, ticketId: ticket.id });
		expect(dni).toBe('30123456');
		const [entry] = await listAudit(t.db);
		expect(entry).toMatchObject({
			action: 'order.reveal_dni',
			actorLogin: 'admin-de-prueba',
			targetType: 'order',
			targetId: ticket.order_id
		});
		expect(JSON.stringify(entry)).not.toContain('30123456');
	});
	it('otro evento o sin DNI: null y no se anota nada', async () => {
		const ticket = await freshTicket();
		expect(await revealDni(t.db, locals, { slug: 'otro', ticketId: ticket.id })).toBeNull();
		const r = await sell({ buyer: { name: 'Sin DNI', email: '' } });
		if (!r.ok) throw new Error('sin cupo');
		expect(await revealDni(t.db, locals, { slug: EVENT, ticketId: r.tickets[0].id })).toBeNull();
		expect(await listAudit(t.db)).toHaveLength(0);
	});
});

describe('offlineList y purchaseDetails', () => {
	it('la lista sin conexión tiene el hash del token, no el token ni el DNI completo', async () => {
		const ticket = await freshTicket();
		await t.db.prepare("UPDATE orders SET status = 'refunded'").run();
		const [row] = await offlineList(t.db, { slug: EVENT, typeNames: names, prior: null });
		expect(row.hash).toBe(await sha256Hex(ticket.token));
		expect(row).toMatchObject({ valid: false, dniTail: '456', code: ticket.code, type: 'General' });
		const json = JSON.stringify(row);
		expect(json).not.toContain(ticket.token);
		expect(json).not.toContain('30123456');
	});
	it('purchaseDetails trae la orden y todas sus entradas, solo del evento', async () => {
		const r = await sell({ quantity: 2 });
		if (!r.ok) throw new Error('sin cupo');
		const d = await purchaseDetails(t.db, {
			slug: EVENT,
			ticketId: r.tickets[1].id,
			typeNames: names
		});
		expect(d).toMatchObject({
			ref: orderRef(r.order.id),
			status: 'approved',
			method: 'efectivo',
			channel: 'puerta',
			total: 16000,
			dniTail: '456'
		});
		expect(d?.tickets.map((x) => x.holder)).toEqual(['Persona 1', 'Persona 2']);
		expect(JSON.stringify(d)).not.toContain('30123456');
		expect(
			await purchaseDetails(t.db, { slug: 'otro', ticketId: r.tickets[1].id, typeNames: names })
		).toBeNull();
	});
});

describe('checkinGroup', () => {
	const now = Date.parse('2026-10-04T15:00:00-03:00');
	it('hoy, próximos, recientes o nada', () => {
		expect(checkinGroup(Date.parse('2026-10-04T21:00:00-03:00'), now)).toBe('hoy');
		// Empezó ayer a la noche y sigue (pasó la medianoche).
		expect(checkinGroup(Date.parse('2026-10-04T05:00:00-03:00') - 3 * 3600000, now)).toBe('hoy');
		expect(checkinGroup(Date.parse('2026-10-05T00:30:00-03:00'), now)).toBe('proximos');
		expect(checkinGroup(Date.parse('2026-09-01T20:00:00-03:00'), now)).toBe('recientes');
		expect(checkinGroup(Date.parse('2026-06-01T20:00:00-03:00'), now)).toBeNull();
		expect(checkinGroup(null, now)).toBeNull();
	});
});
