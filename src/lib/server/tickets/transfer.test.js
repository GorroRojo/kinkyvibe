import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { buildTicketEmail, buildTransferEmail } from './email.js';
import { createDiscountCode, listDiscountCodes } from './discounts.js';
import {
	TRANSFER_HOLD_MS,
	TRANSFER_INITIAL_HOLD_MS,
	applyPayment,
	extendTransferHold,
	cancelTransfer,
	checkIn,
	confirmTransfer,
	getCounts,
	getOrder,
	getOrderTickets,
	reserveOrder,
	takenPlaces,
	transferLimits
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
const ANTICIPADA = { id: 'anticipada', price: 5000, capacity: 3 };
const NOW = Date.parse('2026-10-01T12:00:00Z');

/** @param {number} n */
function people(n) {
	return Array.from({ length: n }, (_, i) => ({
		name: `Persona ${i + 1}`,
		pronouns: i ? '' : 'ella'
	}));
}

/** @param {{ quantity?: number, now?: number, discount?: any, holdMs?: number }} [o] */
async function transfer(o = {}) {
	const quantity = o.quantity ?? 2;
	const r = await reserveOrder(t.db, {
		eventSlug: EVENT,
		type: ANTICIPADA,
		quantity,
		holders: people(quantity),
		buyer: { name: 'Persona 1', email: 'transfiere@example.com', dni: '25000000' },
		method: 'transferencia',
		discount: o.discount,
		now: o.now ?? NOW,
		// La reserva completa (la que queda al confirmarla desde el mail); ver los tests de abajo.
		holdMs: 'holdMs' in o ? o.holdMs : TRANSFER_HOLD_MS
	});
	return r;
}

/** @param {string} orderId @param {Partial<Parameters<typeof confirmTransfer>[1]>} [o] */
function confirm(orderId, o = {}) {
	return confirmTransfer(t.db, {
		orderId,
		eventSlug: EVENT,
		capacity: ANTICIPADA.capacity,
		by: 'admin-prueba',
		now: NOW + 1000,
		...o
	});
}

describe('reserva inicial corta y confirmación desde el mail', () => {
	it('sin holdMs la reserva es la inicial; confirmarla la extiende a la completa (una vez, si sigue vigente)', async () => {
		const r = /** @type {any} */ (await transfer({ holdMs: undefined }));
		expect(r.order.expires_at).toBe(NOW + TRANSFER_INITIAL_HOLD_MS);
		expect(TRANSFER_INITIAL_HOLD_MS).toBeLessThan(TRANSFER_HOLD_MS);
		const extended = await extendTransferHold(t.db, r.order.id, TRANSFER_HOLD_MS, NOW + 1000);
		expect(extended?.expires_at).toBe(NOW + TRANSFER_HOLD_MS);
		// Repetir no la corre más.
		expect(
			(await extendTransferHold(t.db, r.order.id, TRANSFER_HOLD_MS, NOW + 5000))?.expires_at
		).toBe(NOW + TRANSFER_HOLD_MS);
	});

	it('una reserva ya vencida no se puede confirmar', async () => {
		const r = /** @type {any} */ (await transfer({ holdMs: undefined }));
		expect(
			await extendTransferHold(t.db, r.order.id, TRANSFER_HOLD_MS, NOW + TRANSFER_INITIAL_HOLD_MS)
		).toBeNull();
	});

	it('el link de confirmación va firmado: otra orden u otra firma no sirven', async () => {
		const { confirmToken, verifyConfirmToken, confirmUrl } = await import('./safeguards.js');
		const a = /** @type {any} */ (await transfer({ holdMs: undefined })).order.id;
		const b = crypto.randomUUID();
		const tokenA = await confirmToken(t.db, a);
		expect(tokenA).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(await confirmToken(t.db, a)).toBe(tokenA); // la clave se crea una vez
		expect(await verifyConfirmToken(t.db, a, tokenA)).toBe(true);
		expect(await verifyConfirmToken(t.db, b, tokenA)).toBe(false);
		expect(
			await verifyConfirmToken(
				t.db,
				a,
				tokenA.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))
			)
		).toBe(false);
		expect(await verifyConfirmToken(t.db, a, '')).toBe(false);
		expect(await confirmUrl(t.db, 'https://kinkyvibe.ar', a)).toBe(
			`https://kinkyvibe.ar/entradas/${a}/confirmar?k=${tokenA}`
		);
	});

	it('el mail pide confirmar la reserva, con el link', async () => {
		const order = /** @type {any} */ (await transfer({ holdMs: undefined })).order;
		const m = buildTransferEmail({
			order,
			event: { title: 'Fiesta', start: '2026-12-12T21:00-03:00' },
			typeName: 'Anticipada',
			transferInfo: 'Alias: EJEMPLO',
			contactEmail: 'contacto@example.com',
			origin: 'https://kinkyvibe.ar',
			confirmUrl: 'https://kinkyvibe.ar/entradas/x/confirmar?k=abc',
			fullHoldHours: 48
		});
		expect(m.html).toContain('Confirmá tu reserva');
		expect(m.html).toContain('href="https://kinkyvibe.ar/entradas/x/confirmar?k=abc"');
		expect(m.text).toContain('48 horas: https://kinkyvibe.ar/entradas/x/confirmar?k=abc');
		expect(m.text).toContain('se libera a las 2 horas');
	});
});

describe('transferencia', () => {
	it('reserva cupo con estado awaiting_transfer y la reserva larga (48 h)', async () => {
		const r = await transfer();
		expect(r.ok).toBe(true);
		const order = /** @type {any} */ (r).order;
		expect(order).toMatchObject({
			status: 'awaiting_transfer',
			payment_method: 'transferencia',
			total: 10000,
			expires_at: NOW + TRANSFER_HOLD_MS
		});
		expect(TRANSFER_HOLD_MS).toBe(48 * 60 * 60 * 1000);
		expect((await getCounts(t.db, EVENT, NOW)).get('anticipada')).toMatchObject({
			held: 2,
			sold: 0
		});
		// Cupo 3: solo queda 1.
		expect(await transfer()).toMatchObject({ ok: false, reason: 'soldout', available: 1 });
	});

	it('la reserva vencida libera el cupo (y el uso del código)', async () => {
		await createDiscountCode(
			t.db,
			{
				code: 'TRANSF10',
				kind: 'percent',
				value: 10,
				event_slug: null,
				starts_at: null,
				ends_at: null,
				max_uses: 1
			},
			{ by: 'admin' }
		);
		const discount = { code: 'TRANSF10', kind: 'percent', value: 10 };
		const first = await transfer({ quantity: 3, discount });
		expect(/** @type {any} */ (first).order).toMatchObject({ total: 13500, discount_amount: 1500 });
		expect(await transfer({ quantity: 1, now: NOW + TRANSFER_HOLD_MS - 1 })).toMatchObject({
			ok: false,
			reason: 'soldout'
		});
		const later = NOW + TRANSFER_HOLD_MS;
		const again = await transfer({ quantity: 3, discount, now: later });
		expect(again.ok).toBe(true);
		expect((await getOrder(t.db, /** @type {any} */ (first).order.id))?.status).toBe('expired');
		expect(await listDiscountCodes(t.db, later)).toMatchObject([{ held: 1 }]);
	});

	it('"Confirmar pago" aprueba y emite las entradas una sola vez (idempotente)', async () => {
		const order = /** @type {any} */ (await transfer()).order;
		const first = await confirm(order.id);
		expect(first.result).toBe('confirmed');
		expect(first.order).toMatchObject({
			status: 'approved',
			confirmed_by: 'admin-prueba',
			holders: null
		});
		expect(first.tickets.map((tk) => [tk.holder_name, tk.holder_pronouns])).toEqual([
			['Persona 1', 'ella'],
			['Persona 2', null]
		]);
		expect(first.order?.buyer_dni).toBe('25000000');
		const second = await confirm(order.id);
		expect(second).toMatchObject({ result: 'already', tickets: [] });
		// Doble click simultáneo: una sola confirmación.
		const o2 = /** @type {any} */ (await transfer({ quantity: 1 })).order;
		const both = await Promise.all([confirm(o2.id), confirm(o2.id), confirm(o2.id)]);
		expect(both.filter((r) => r.result === 'confirmed')).toHaveLength(1);
		expect(await getOrderTickets(t.db, order.id)).toHaveLength(2);
		expect(await getOrderTickets(t.db, o2.id)).toHaveLength(1);
		// Las entradas sirven en la puerta.
		const ok = await checkIn(t.db, {
			token: first.tickets[0].token,
			eventSlug: EVENT,
			by: 'puerta'
		});
		expect(ok.result).toBe('ok');
	});

	it('vencida: se puede confirmar si todavía hay cupo, y si no, no (sin sobreventa)', async () => {
		const late = /** @type {any} */ (await transfer({ quantity: 2 })).order;
		const after = NOW + TRANSFER_HOLD_MS + 1;
		expect((await confirm(late.id, { now: after })).result).toBe('confirmed');

		const late2 = /** @type {any} */ (await transfer({ quantity: 1, now: after })).order;
		const expiredAt = after + TRANSFER_HOLD_MS + 1;
		// Mientras tanto otra persona ocupó el último lugar.
		expect((await transfer({ quantity: 1, now: expiredAt })).ok).toBe(true);
		const r = await confirm(late2.id, { now: expiredAt });
		expect(r.result).toBe('no-capacity');
		expect(await getOrderTickets(t.db, late2.id)).toHaveLength(0);
	});

	it('vencida y sin cupo: transferLimits dice cuánto se pasa y con override se confirma igual', async () => {
		const TYPE = { ...ANTICIPADA, name: 'Anticipada' };
		const late = /** @type {any} */ (await transfer({ quantity: 2 })).order;
		// Vigente: tiene su lugar, no pasa nada.
		expect(await transferLimits(t.db, { order: late, type: TYPE, now: NOW + 1000 })).toEqual([]);
		const expiredAt = NOW + TRANSFER_HOLD_MS + 1;
		// Mientras tanto se vendieron los 3 lugares.
		expect((await transfer({ quantity: 3, now: expiredAt })).ok).toBe(true);
		const fresh = /** @type {any} */ (await getOrder(t.db, late.id));
		expect(await transferLimits(t.db, { order: fresh, type: TYPE, now: expiredAt })).toEqual([
			{
				kind: 'capacity',
				type: 'anticipada',
				typeName: 'Anticipada',
				capacity: 3,
				before: 3,
				after: 5,
				over: 2
			}
		]);
		// Sin override: no.
		expect((await confirm(late.id, { now: expiredAt })).result).toBe('no-capacity');
		// Con override: sí, y quedan 5 de 3.
		const r = await confirm(late.id, { now: expiredAt, override: true });
		expect(r.result).toBe('confirmed');
		expect(r.tickets).toHaveLength(2);
		expect(
			await takenPlaces(t.db, { eventSlug: EVENT, typeId: 'anticipada', now: expiredAt })
		).toBe(5);
		// Idempotente también con override.
		expect((await confirm(late.id, { now: expiredAt, override: true })).result).toBe('already');
		expect(await getOrderTickets(t.db, late.id)).toHaveLength(2);
	});

	it('override no confirma canceladas ni órdenes que no son transferencias', async () => {
		const order = /** @type {any} */ (await transfer({ quantity: 1 })).order;
		await cancelTransfer(t.db, { orderId: order.id, eventSlug: EVENT, by: 'admin' });
		expect((await confirm(order.id, { override: true })).result).toBe('cancelled');
		const mp = /** @type {any} */ (
			await reserveOrder(t.db, {
				eventSlug: EVENT,
				type: ANTICIPADA,
				quantity: 1,
				holders: people(1),
				buyer: { name: 'Persona 1', email: 'mp@example.com', dni: '25000001' },
				now: NOW
			})
		).order;
		expect((await confirm(mp.id, { override: true })).result).toBe('not-transfer');
		expect(await transferLimits(t.db, { order: mp, type: { ...ANTICIPADA, name: 'A' } })).toEqual(
			[]
		);
	});

	it('"Cancelar" libera el cupo; una cancelada no se puede confirmar', async () => {
		const order = /** @type {any} */ (await transfer({ quantity: 3 })).order;
		expect(await cancelTransfer(t.db, { orderId: order.id, eventSlug: EVENT, by: 'admin' })).toBe(
			true
		);
		expect(await cancelTransfer(t.db, { orderId: order.id, eventSlug: EVENT, by: 'admin' })).toBe(
			false
		);
		expect((await getCounts(t.db, EVENT, NOW)).get('anticipada')?.held).toBe(0);
		expect((await confirm(order.id)).result).toBe('cancelled');
		// Otro evento o id inválido: nada.
		expect(await cancelTransfer(t.db, { orderId: 'x', eventSlug: EVENT, by: 'admin' })).toBe(false);
		expect(
			(await confirmTransfer(t.db, { orderId: order.id, eventSlug: 'otro', capacity: 3, by: 'a' }))
				.result
		).toBe('not-found');
	});

	it('un pago de Mercado Pago no puede aprobar una orden por transferencia', async () => {
		const order = /** @type {any} */ (await transfer()).order;
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = await applyPayment(t.db, {
			id: 5,
			status: 'approved',
			external_reference: order.id,
			transaction_amount: order.total,
			currency_id: 'ARS'
		});
		spy.mockRestore();
		expect(r.outcome).toBe('mismatch');
		expect((await getOrder(t.db, order.id))?.status).toBe('awaiting_transfer');
	});

	it('el email de transferencia tiene monto, datos y referencia, pero nunca el DNI', async () => {
		const order = /** @type {any} */ (await transfer()).order;
		const mail = buildTransferEmail({
			order,
			event: { title: 'Fiesta', start: '2026-12-12T21:00-03:00' },
			typeName: 'Anticipada',
			transferInfo: 'Alias: EJEMPLO.ALIAS.PRUEBA\nTitular: Nombre de ejemplo',
			replyTo: 'entradas@example.com',
			contactEmail: 'contacto@example.com',
			origin: 'https://kinkyvibe.ar'
		});
		const ref = `KV-${order.id.slice(0, 8).toUpperCase()}`;
		for (const part of [mail.html, mail.text]) {
			expect(part).toMatch(/\$\s10\.000/);
			expect(part).toContain('EJEMPLO.ALIAS.PRUEBA');
			expect(part).toContain(ref);
			expect(part).toContain('comprobante');
			expect(part).toContain('entradas@example.com');
			expect(part).not.toContain('25000000');
			expect(part).not.toContain('25.000.000');
			// Política de devoluciones al pie, con el contacto configurable.
			expect(part).toContain('Devoluciones y cambios');
			expect(part).toContain('contacto@example.com');
			expect(part).not.toMatch(/factura/i);
		}
		expect(mail.subject).toContain(ref);
	});

	it('el email de las entradas muestra nombre y pronombres de cada una, sin DNI', async () => {
		const order = /** @type {any} */ (await transfer()).order;
		const { tickets, order: approved } = await confirm(order.id);
		const mail = buildTicketEmail({
			order: /** @type {any} */ (approved),
			tickets,
			event: { title: 'Fiesta' },
			typeName: 'Anticipada',
			origin: 'https://kinkyvibe.ar',
			contactEmail: 'contacto@example.com'
		});
		expect(mail.html).toContain('Persona 1 (ella)');
		expect(mail.text).toContain('Persona 2');
		for (const part of [mail.html, mail.text, mail.subject]) {
			expect(part).not.toContain('25000000');
			expect(part).not.toContain('25.000.000');
			expect(part).not.toMatch(/factura/i);
		}
		expect(mail.text).toContain('5 días hábiles');
		expect(mail.html).toContain('contacto@example.com');
	});

	it('el email de las entradas muestra el código corto de cada una al lado del QR', async () => {
		const order = /** @type {any} */ (await transfer()).order;
		const { tickets, order: approved } = await confirm(order.id);
		const mail = buildTicketEmail({
			order: /** @type {any} */ (approved),
			tickets,
			event: { title: 'Fiesta', location: 'Lugar' },
			typeName: 'Anticipada',
			origin: 'https://kinkyvibe.ar',
			contactEmail: 'contacto@example.com'
		});
		for (const tk of tickets) {
			const shown = `${tk.code?.slice(0, 3)} ${tk.code?.slice(3)}`;
			expect(mail.html).toContain(shown);
			expect(mail.text).toContain(`código ${shown}`);
		}
		expect(mail.html).toContain('qr.gif');
	});

	it('evento online: sin QR; con el link si ya está, o el aviso de que llega antes', async () => {
		const order = /** @type {any} */ (await transfer()).order;
		const { tickets, order: approved } = await confirm(order.id);
		const input = {
			order: /** @type {any} */ (approved),
			tickets,
			typeName: 'Anticipada',
			origin: 'https://kinkyvibe.ar',
			contactEmail: 'contacto@example.com'
		};
		const withLink = buildTicketEmail({
			...input,
			event: { title: 'Taller', online: true, streamLink: 'https://meet.example.com/abc' }
		});
		expect(withLink.html).not.toContain('qr.gif');
		expect(withLink.html).toContain('https://meet.example.com/abc');
		expect(withLink.text).toContain('https://meet.example.com/abc');
		const without = buildTicketEmail({ ...input, event: { title: 'Taller', online: true } });
		expect(without.html).not.toContain('qr.gif');
		expect(without.text).toContain(
			'te mandamos el link de la transmisión por mail antes del evento'
		);
	});
});
