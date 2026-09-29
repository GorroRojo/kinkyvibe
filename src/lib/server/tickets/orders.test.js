import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { buildPreference } from './mercadopago.js';
import {
	HOLD_MS,
	TICKET_CODE_ALPHABET,
	applyPayment,
	foldText,
	newTicketCode,
	normalizeTicketCode,
	tokenByCode,
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

/** @param {number} n */
function people(n) {
	return Array.from({ length: n }, (_, i) => ({
		name: i === 0 ? 'Persona de Prueba' : `Acompañante ${i}`,
		pronouns: i === 0 ? 'elle' : ''
	}));
}

/** @param {Partial<Parameters<typeof reserveOrder>[1]>} [o] */
function reserve(o = {}) {
	const quantity = o.quantity ?? 1;
	return reserveOrder(t.db, {
		eventSlug: EVENT,
		type: GENERAL,
		quantity,
		holders: people(quantity),
		buyer: { name: 'Persona de Prueba', email: 'prueba@example.com', dni: '30000000' },
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
			subtotal: 16000,
			discount_amount: 0,
			total: 16000,
			payment_method: 'mercadopago',
			buyer_name: 'Persona de Prueba',
			buyer_dni: '30000000',
			fondo_amount: 0,
			surcharge_amount: 0,
			expires_at: NOW + HOLD_MS
		});
		expect(JSON.parse(order.holders)).toEqual(people(2));
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
		expect(counts.get('general')).toEqual({
			sold: 3,
			held: 2,
			revenue: 24000,
			fondo: 0,
			contribution: 0,
			surcharge: 0
		});
		// Vencida la reserva del rechazo, vuelve a haber lugar; la aprobada nunca vence.
		expect((await reserve({ quantity: 2, now: NOW + HOLD_MS + 1 })).ok).toBe(true);
		expect((await reserve({ now: NOW + HOLD_MS + 1 })).ok).toBe(false);
	});

	it('fondo y recargo de Mercado Pago: el servidor calcula y guarda el desglose', async () => {
		const r = await reserve({
			quantity: 2,
			type: { id: 'con-fondo', price: 10000, fondo: 2000, capacity: 10 },
			feeBasisPoints: 773
		});
		const order = /** @type {any} */ (r).order;
		expect(order).toMatchObject({
			unit_price: 10000,
			fondo_amount: 4000,
			subtotal: 16000,
			discount_amount: 0,
			surcharge_amount: 1341, // 16000 / 0,9227 = 17340,4 → 17341
			total: 17341
		});
		// La preferencia cobra el total en un solo ítem, y el webhook compara contra ese total.
		const pref = buildPreference({
			order,
			eventTitle: 'Fiesta',
			typeName: 'Con fondo',
			origin: 'x'
		});
		expect(pref.items).toMatchObject([{ quantity: 1, unit_price: 17341 }]);
		const paid = await applyPayment(t.db, payment(order.id, { transaction_amount: 17341 }), {
			now: NOW
		});
		expect(paid.newlyApproved).toBe(true);
		expect((await getCounts(t.db, EVENT, NOW)).get('con-fondo')).toMatchObject({
			sold: 2,
			revenue: 17341,
			fondo: 4000,
			surcharge: 1341
		});
		// Por transferencia no hay recargo.
		const transfer = await reserve({
			type: { id: 'con-fondo', price: 10000, fondo: 2000, capacity: 10 },
			method: 'transferencia',
			feeBasisPoints: 773
		});
		expect(/** @type {any} */ (transfer).order).toMatchObject({ surcharge_amount: 0, total: 8000 });
	});

	it('opción del fondo: guarda la opción, el fondo usado y el aporte, y los suma aprobados', async () => {
		const type = { id: 'con-fondo', price: 10000, fondo: 2000, capacity: 50 };
		/** @type {Record<string, [number, number, number]>} opción → fondo, aporte, subtotal (× 2) */
		const expected = {
			fondo: [4000, 0, 16000],
			completo: [0, 0, 20000],
			solidaria: [0, 2000, 22000],
			'muy-solidaria': [0, 6000, 26000],
			sugar: [0, 10000, 30000]
		};
		let paymentId = 500;
		for (const [option, [fondo, contribution, subtotal]] of Object.entries(expected)) {
			const r = await reserve({
				quantity: 2,
				type,
				option: /** @type {any} */ (option)
			});
			const order = /** @type {any} */ (r).order;
			expect(order).toMatchObject({
				fondo_option: option,
				fondo_amount: fondo,
				fondo_contribution: contribution,
				subtotal,
				total: subtotal
			});
			await applyPayment(
				t.db,
				payment(order.id, { id: paymentId++, transaction_amount: subtotal }),
				{ now: NOW }
			);
		}
		// Sin opción: la de por defecto (con fondo si el tipo tiene fondo).
		const def = /** @type {any} */ (await reserve({ type })).order;
		expect(def).toMatchObject({ fondo_option: 'fondo', fondo_amount: 2000 });
		const plain = /** @type {any} */ (await reserve()).order;
		expect(plain).toMatchObject({ fondo_option: 'completo', fondo_amount: 0 });

		expect((await getCounts(t.db, EVENT, NOW)).get('con-fondo')).toMatchObject({
			sold: 10,
			fondo: 4000,
			contribution: 18000,
			revenue: 16000 + 20000 + 22000 + 26000 + 30000
		});
	});

	it('la base rechaza desgloses inconsistentes del fondo', async () => {
		const insert = (
			/** @type {string} */ option,
			/** @type {number} */ fondo,
			/** @type {number} */ contribution
		) =>
			t.db
				.prepare(
					`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
						fondo_amount, fondo_contribution, subtotal, total, buyer_name, buyer_email,
						created_at, updated_at, expires_at)
					VALUES (?1, 'e', 'g', 1, 10000, ?2, ?3, ?4, 10000 - ?3 + ?4, 10000 - ?3 + ?4, 'P',
						'p@example.com', 1, 1, 2)`
				)
				.bind(crypto.randomUUID(), option, fondo, contribution)
				.run();
		await expect(insert('solidaria', 0, 1000)).resolves.toBeTruthy();
		await expect(insert('fondo', 2000, 1000)).rejects.toThrow(/CHECK/);
		await expect(insert('solidaria', 2000, 1000)).rejects.toThrow(/CHECK/);
		await expect(insert('completo', 0, 1000)).rejects.toThrow(/CHECK/);
		await expect(insert('mitad', 0, 0)).rejects.toThrow(/CHECK/);
	});

	it('cupos separados por tipo y por evento', async () => {
		await reserve({ quantity: 4 });
		await reserve({ quantity: 1 });
		expect((await reserve({ type: { id: 'anticipada', price: 5000, capacity: 1 } })).ok).toBe(true);
		expect((await reserve({ eventSlug: 'otro-evento' })).ok).toBe(true);
	});

	it('carrera: muchas compras simultáneas nunca sobrevenden', async () => {
		const attempts = Array.from({ length: 30 }, (_, i) =>
			reserve({
				quantity: 1 + (i % 3),
				buyer: { name: 'P', email: `p${i}@example.com`, dni: '30000000' }
			})
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
		// Cada entrada con los datos de su persona, en orden; la orden ya no los guarda.
		expect(first.tickets.map((tk) => [tk.holder_name, tk.holder_pronouns])).toEqual([
			['Persona de Prueba', 'elle'],
			['Acompañante 1', null],
			['Acompañante 2', null]
		]);
		expect(first.order?.holders ?? (await getOrder(t.db, o.id))?.holders).toBeNull();

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
		// Por DNI de quien compró (con o sin puntos, por comienzo).
		expect(await searchTickets(t.db, EVENT, '30.000.000')).toHaveLength(1);
		expect(await searchTickets(t.db, EVENT, '3000')).toHaveLength(1);
		expect(await searchTickets(t.db, EVENT, '4000')).toHaveLength(0);
		expect(await searchTickets(t.db, EVENT, '%')).toHaveLength(0);
		expect(await searchTickets(t.db, 'otro-evento', '')).toHaveLength(0);
		const orders = await listOrders(t.db, EVENT);
		expect(orders[0]).toMatchObject({ status: 'approved', checked_in: 1 });
	});
});

describe('código corto de cada entrada', () => {
	it('se genera con el alfabeto sin ambiguos, 6 caracteres', () => {
		for (let i = 0; i < 200; i++) {
			const code = newTicketCode();
			expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
		}
		expect(TICKET_CODE_ALPHABET).not.toMatch(/[01ILO]/);
	});

	it.each([
		['7hq4xm', '7HQ4XM'],
		[' 7HQ 4XM ', '7HQ4XM'],
		['7HQ-4XM', '7HQ4XM'],
		['KV-7HQ4XM', '7HQ4XM'],
		['kv7hq4xm', '7HQ4XM'],
		// Las entradas anteriores a 0005 tienen códigos hexadecimales: O → 0, I/L → 1.
		['A0B1C2', 'A0B1C2'],
		['AOBICL', 'A0B1C1']
	])('normaliza %j → %s', (raw, code) => {
		expect(normalizeTicketCode(raw)).toBe(code);
	});

	it.each(['', '7HQ4X', '7HQ4XMM', '7HQ4X!', null, 123456])('rechaza %j', (raw) => {
		expect(normalizeTicketCode(raw)).toBeNull();
	});

	it('cada entrada emitida tiene un código único en el evento, y se encuentra por código', async () => {
		const o = /** @type {any} */ (await reserve({ quantity: 3 })).order;
		const { tickets } = await applyPayment(t.db, payment(o.id, { transaction_amount: 24000 }));
		expect(tickets).toHaveLength(3);
		const codes = tickets.map((x) => x.code);
		expect(new Set(codes).size).toBe(3);
		for (const tk of tickets) {
			expect(tk.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
			expect(await tokenByCode(t.db, EVENT, /** @type {string} */ (tk.code))).toBe(tk.token);
			expect(await tokenByCode(t.db, 'otro-evento', /** @type {string} */ (tk.code))).toBeNull();
		}
		// El check-in por código usa el token de esa entrada.
		const token = await tokenByCode(t.db, EVENT, /** @type {string} */ (codes[1]));
		expect(
			(await checkIn(t.db, { token: String(token), eventSlug: EVENT, by: 'puerta' })).result
		).toBe('ok');
	});
});

describe('buscador del control de ingreso', () => {
	async function seed() {
		const o = /** @type {any} */ (
			await reserve({
				quantity: 2,
				buyer: {
					name: 'Martín Núñez',
					pronouns: 'él',
					email: 'martin.nunez@example.com',
					dni: '31222333'
				},
				holders: [
					{ name: 'Martín Núñez', pronouns: 'él' },
					{ name: 'Sofía Peña', pronouns: 'elle / ella' }
				]
			})
		).order;
		return (await applyPayment(t.db, payment(o.id, { transaction_amount: 16000 }))).tickets;
	}

	it('foldText: sin tildes ni mayúsculas', () => {
		expect(foldText('  Sofía   PEÑA ')).toBe('sofia pena');
	});

	it('sin distinguir tildes, y dice con qué campo coincidió', async () => {
		const tickets = await seed();
		const byName = await searchTickets(t.db, EVENT, 'sofia pena');
		expect(byName).toHaveLength(1);
		expect(byName[0].match).toEqual({ field: 'holder', value: 'Sofía Peña' });
		expect((await searchTickets(t.db, EVENT, 'NUÑEZ'))[0].match?.field).toBe('holder');
		const pronouns = await searchTickets(t.db, EVENT, 'elle / ella');
		expect(pronouns.map((r) => r.match)).toEqual([{ field: 'pronouns', value: 'elle / ella' }]);
		const email = await searchTickets(t.db, EVENT, 'nunez@exa');
		expect(email).toHaveLength(2);
		expect(email.every((r) => r.match?.field === 'email')).toBe(true);
		const dni = await searchTickets(t.db, EVENT, '31.222');
		expect(dni.map((r) => r.match?.field)).toEqual(['dni', 'dni']);
		const code = /** @type {string} */ (tickets[1].code);
		const byCode = await searchTickets(t.db, EVENT, code.toLowerCase());
		expect(byCode[0]).toMatchObject({ id: tickets[1].id, match: { field: 'code', value: code } });
		// Comienzo del código (3 o más).
		expect((await searchTickets(t.db, EVENT, code.slice(0, 3)))[0].match?.field).toBe('code');
	});

	it('pocos resultados con `limit`, y nada de órdenes no aprobadas', async () => {
		await seed();
		await reserve({ buyer: { name: 'Pendiente', email: 'pend@example.com', dni: '40111222' } });
		expect(await searchTickets(t.db, EVENT, 'pendiente')).toHaveLength(0);
		expect(await searchTickets(t.db, EVENT, 'example', { limit: 1 })).toHaveLength(1);
	});
});

describe('a la gorra y pronombres de quien compra', () => {
	const GORRA = {
		id: 'gorra',
		price: 5000,
		fondo: 0,
		capacity: 10,
		gorra: { min: 1000, suggested: 5000 }
	};
	const buyer = { name: 'Ale', pronouns: 'elle', email: 'ale@example.com', dni: '30111222' };

	it('guarda los pronombres de quien compra', async () => {
		const r = /** @type {any} */ (await reserve({ buyer }));
		expect(r.order.buyer_pronouns).toBe('elle');
	});

	it('el precio por entrada es el monto elegido; sin fondo, sin código; con recargo de MP', async () => {
		const r = /** @type {any} */ (
			await reserve({
				type: GORRA,
				option: 'gorra',
				unitPrice: 7000,
				quantity: 2,
				buyer,
				feeBasisPoints: 773,
				// Aunque llegue un código, a la gorra no se aplica.
				discount: { code: 'NADA', kind: 'percent', value: 50 }
			})
		);
		expect(r.ok).toBe(true);
		expect(r.order).toMatchObject({
			fondo_option: 'gorra',
			unit_price: 7000,
			subtotal: 14000,
			fondo_amount: 0,
			fondo_contribution: 0,
			discount_code: null,
			discount_amount: 0,
			surcharge_amount: 1173,
			total: 15173
		});
	});

	it('monto 0 → orden "gratis" (sin pago)', async () => {
		const free = { ...GORRA, gorra: { min: 0, suggested: 3000 } };
		const r = /** @type {any} */ (
			await reserve({ type: free, option: 'gorra', unitPrice: 0, method: 'gratis', buyer })
		);
		expect(r.order).toMatchObject({ unit_price: 0, total: 0, payment_method: 'gratis' });
		expect(
			(await reserve({ type: free, option: 'gorra', unitPrice: 0, method: 'mercadopago', buyer }))
				.ok
		).toBe(false);
	});

	it('el servidor rechaza montos por debajo del mínimo o la opción equivocada', async () => {
		await expect(reserve({ type: GORRA, option: 'gorra', unitPrice: 999, buyer })).rejects.toThrow(
			/Precio/
		);
		await expect(
			reserve({ type: GORRA, option: 'completo', unitPrice: 5000, buyer })
		).rejects.toThrow(/gorra/);
		await expect(reserve({ option: 'gorra', unitPrice: 1, buyer })).rejects.toThrow(/gorra/);
	});

	it('la base rechaza un unit_price 0 fuera de "gorra"', async () => {
		await expect(
			t.db
				.prepare(
					`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
						buyer_name, buyer_email, created_at, updated_at, expires_at, payment_method)
					VALUES ('x', 'e', 'g', 1, 0, 0, 0, 'A', 'a@example.com', 0, 0, 0, 'gratis')`
				)
				.run()
		).rejects.toThrow(/CHECK/);
	});
});
