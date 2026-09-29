import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyDiscount } from '$lib/utils/tickets.js';
import {
	checkDiscountCode,
	createDiscountCode,
	listDiscountCodes,
	parseLocalDate,
	setDiscountCodeActive,
	validateNewCode
} from './discounts.js';
import {
	HOLD_MS,
	applyPayment,
	approveFreeOrder,
	getOrder,
	getOrderTickets,
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

const EVENT = 'fiesta-de-prueba';
const GENERAL = { id: 'general', price: 8000, capacity: 100 };
const NOW = Date.parse('2026-10-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** @param {Partial<Parameters<typeof createDiscountCode>[1]>} [o] */
async function code(o = {}) {
	const created = await createDiscountCode(
		t.db,
		{
			code: 'PRUEBA20',
			kind: 'percent',
			value: 20,
			event_slug: null,
			starts_at: null,
			ends_at: null,
			max_uses: null,
			...o
		},
		{ by: 'admin-prueba', now: NOW - DAY }
	);
	expect(created).toBe(true);
}

/** @param {number} n */
function people(n) {
	return Array.from({ length: n }, (_, i) => ({ name: `Persona ${i}`, pronouns: '' }));
}

/**
 * Reserva con el código tal como lo ve el checkout (lo valida primero, como `buyAction`).
 *
 * @param {{ code?: string, quantity?: number, now?: number, eventSlug?: string, email?: string }} [o]
 */
async function buyWithCode(o = {}) {
	const { code: c = 'PRUEBA20', quantity = 2, now = NOW, eventSlug = EVENT } = o;
	const check = await checkDiscountCode(t.db, { code: c, eventSlug, now });
	if (!check.ok)
		return { ok: /** @type {const} */ (false), reason: 'code', message: check.message };
	const d = check.discount;
	const { total } = applyDiscount(GENERAL.price * quantity, d);
	return reserveOrder(t.db, {
		eventSlug,
		type: GENERAL,
		quantity,
		holders: people(quantity),
		buyer: { name: 'Persona', email: o.email ?? 'prueba@example.com', dni: '40000000' },
		method: total === 0 ? 'gratis' : 'mercadopago',
		discount: { code: d.code, kind: d.kind, value: d.value },
		now
	});
}

describe('checkDiscountCode', () => {
	it('no distingue mayúsculas y devuelve el código normalizado', async () => {
		await code();
		const r = await checkDiscountCode(t.db, { code: ' prueba20 ', eventSlug: EVENT, now: NOW });
		expect(r).toMatchObject({
			ok: true,
			discount: { code: 'PRUEBA20', kind: 'percent', value: 20 }
		});
	});

	it('ventana de validez: desde incluido, hasta excluido', async () => {
		await code({ starts_at: NOW, ends_at: NOW + DAY });
		const at = (/** @type {number} */ now) =>
			checkDiscountCode(t.db, { code: 'PRUEBA20', eventSlug: EVENT, now });
		expect(await at(NOW - 1)).toMatchObject({ ok: false, reason: 'not-started' });
		expect(await at(NOW)).toMatchObject({ ok: true });
		expect(await at(NOW + DAY - 1)).toMatchObject({ ok: true });
		expect(await at(NOW + DAY)).toMatchObject({ ok: false, reason: 'ended' });
	});

	it('alcance por evento (sin revelar que existe para otro)', async () => {
		await code({ event_slug: EVENT });
		expect(
			await checkDiscountCode(t.db, { code: 'PRUEBA20', eventSlug: EVENT, now: NOW })
		).toMatchObject({
			ok: true
		});
		const other = await checkDiscountCode(t.db, { code: 'PRUEBA20', eventSlug: 'otro', now: NOW });
		expect(other).toMatchObject({
			ok: false,
			reason: 'other-event',
			message: 'Ese código no existe.'
		});
	});

	it('inactivo, inexistente y formato inválido', async () => {
		await code();
		await setDiscountCodeActive(t.db, 'prueba20', false);
		expect(
			await checkDiscountCode(t.db, { code: 'PRUEBA20', eventSlug: EVENT, now: NOW })
		).toMatchObject({
			ok: false,
			reason: 'inactive'
		});
		expect(
			await checkDiscountCode(t.db, { code: 'NOEXISTE', eventSlug: EVENT, now: NOW })
		).toMatchObject({
			ok: false,
			reason: 'unknown'
		});
		expect(
			await checkDiscountCode(t.db, { code: "' OR 1=1", eventSlug: EVENT, now: NOW })
		).toMatchObject({
			ok: false,
			reason: 'format'
		});
	});

	it('códigos repetidos (sin importar mayúsculas) no se crean', async () => {
		await code();
		expect(
			await createDiscountCode(
				t.db,
				{
					code: 'prueba20',
					kind: 'fixed',
					value: 1,
					event_slug: null,
					starts_at: null,
					ends_at: null,
					max_uses: null
				},
				{ by: 'x' }
			)
		).toBe(false);
	});
});

describe('órdenes con código', () => {
	it('guarda código y descuento, y el total lo calcula el servidor', async () => {
		await code();
		const r = await buyWithCode({ quantity: 2 });
		expect(r.ok).toBe(true);
		expect(/** @type {any} */ (r).order).toMatchObject({
			subtotal: 16000,
			discount_code: 'PRUEBA20',
			discount_amount: 3200,
			total: 12800,
			payment_method: 'mercadopago'
		});
	});

	it('monto fijo por compra', async () => {
		await code({ code: 'MENOS3000', kind: 'fixed', value: 3000 });
		const r = await buyWithCode({ code: 'MENOS3000', quantity: 3 });
		expect(/** @type {any} */ (r).order).toMatchObject({
			subtotal: 24000,
			discount_amount: 3000,
			total: 21000
		});
	});

	it('si el código cambió entre "Aplicar" y comprar, la orden no se crea', async () => {
		await code();
		const r = await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: GENERAL,
			quantity: 1,
			holders: people(1),
			buyer: { name: 'Persona', email: 'a@example.com', dni: '40000000' },
			discount: { code: 'PRUEBA20', kind: 'percent', value: 50 },
			now: NOW
		});
		expect(r).toMatchObject({ ok: false, reason: 'code' });
		expect(await listDiscountCodes(t.db, NOW)).toMatchObject([{ approved: 0, held: 0 }]);
	});

	it('se revalida al crear la orden: vencido o desactivado → no se crea', async () => {
		await code({ ends_at: NOW + 1000 });
		const discount = { code: 'PRUEBA20', kind: /** @type {const} */ ('percent'), value: 20 };
		const base = {
			eventSlug: EVENT,
			type: GENERAL,
			quantity: 1,
			holders: people(1),
			buyer: { name: 'Persona', email: 'a@example.com', dni: '40000000' },
			discount
		};
		expect(await reserveOrder(t.db, { ...base, now: NOW + 1000 })).toMatchObject({
			ok: false,
			reason: 'code',
			message: 'Ese código ya venció.'
		});
		await setDiscountCodeActive(t.db, 'PRUEBA20', false);
		expect(await reserveOrder(t.db, { ...base, now: NOW })).toMatchObject({
			ok: false,
			reason: 'code'
		});
	});

	it('max_uses: cuentan aprobadas y reservas vigentes; las vencidas liberan el uso', async () => {
		await code({ max_uses: 2 });
		const a = await buyWithCode();
		const b = await buyWithCode();
		expect(a.ok && b.ok).toBe(true);
		expect(await buyWithCode()).toMatchObject({ ok: false, reason: 'code' });
		// Se aprueba una; la otra vence → queda un uso libre.
		const orderA = /** @type {any} */ (a).order;
		await applyPayment(t.db, {
			id: 1,
			status: 'approved',
			external_reference: orderA.id,
			transaction_amount: orderA.total,
			currency_id: 'ARS'
		});
		const later = NOW + HOLD_MS + 1;
		expect(await listDiscountCodes(t.db, later)).toMatchObject([
			{ approved: 1, held: 0, discounted: 3200 }
		]);
		expect((await buyWithCode({ now: later })).ok).toBe(true);
		expect(await buyWithCode({ now: later })).toMatchObject({ ok: false, reason: 'code' });
	});

	it('carrera: muchas compras simultáneas con el mismo código nunca pasan max_uses', async () => {
		await code({ max_uses: 3 });
		const discount = { code: 'PRUEBA20', kind: /** @type {const} */ ('percent'), value: 20 };
		const results = await Promise.all(
			Array.from({ length: 25 }, (_, i) =>
				reserveOrder(t.db, {
					eventSlug: EVENT,
					type: GENERAL,
					quantity: 1,
					holders: people(1),
					buyer: { name: 'P', email: `p${i}@example.com`, dni: '40000000' },
					discount,
					now: NOW
				})
			)
		);
		expect(results.filter((r) => r.ok)).toHaveLength(3);
		expect(
			results.filter((r) => !r.ok).every((r) => /** @type {any} */ (r).reason === 'code')
		).toBe(true);
		const { results: rows } = await t.db
			.prepare("SELECT COUNT(*) AS n FROM orders WHERE discount_code = 'PRUEBA20'")
			.all();
		expect(rows[0].n).toBe(3);
	});
});

describe('total 0 (código de 100%)', () => {
	it('se emite sin Mercado Pago, una sola vez aunque se repita', async () => {
		await code({ code: 'GRATIS', value: 100, max_uses: 1 });
		const r = await buyWithCode({ code: 'GRATIS', quantity: 2 });
		expect(r.ok).toBe(true);
		const order = /** @type {any} */ (r).order;
		expect(order).toMatchObject({
			total: 0,
			discount_amount: 16000,
			payment_method: 'gratis',
			status: 'pending'
		});
		const [first, second] = await Promise.all([
			approveFreeOrder(t.db, order),
			approveFreeOrder(t.db, order)
		]);
		expect([first.newlyApproved, second.newlyApproved].filter(Boolean)).toHaveLength(1);
		expect(await getOrderTickets(t.db, order.id)).toHaveLength(2);
		expect((await getOrder(t.db, order.id))?.status).toBe('approved');
		// max_uses 1 → ya no sirve.
		expect(await buyWithCode({ code: 'GRATIS' })).toMatchObject({ ok: false, reason: 'code' });
	});

	it('"gratis" solo con total 0, y total 0 solo como "gratis"', async () => {
		const base = {
			eventSlug: EVENT,
			type: GENERAL,
			quantity: 1,
			holders: people(1),
			buyer: { name: 'Persona', email: 'a@example.com', dni: '40000000' },
			now: NOW
		};
		expect(await reserveOrder(t.db, { ...base, method: 'gratis' })).toEqual({
			ok: false,
			reason: 'method'
		});
		await code({ code: 'GRATIS', value: 100 });
		const discount = { code: 'GRATIS', kind: /** @type {const} */ ('percent'), value: 100 };
		expect(await reserveOrder(t.db, { ...base, discount, method: 'mercadopago' })).toEqual({
			ok: false,
			reason: 'method'
		});
	});

	it('una orden paga no se puede "aprobar gratis"', async () => {
		const r = await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: GENERAL,
			quantity: 1,
			holders: people(1),
			buyer: { name: 'Persona', email: 'a@example.com', dni: '40000000' },
			now: NOW
		});
		const order = /** @type {any} */ (r).order;
		expect((await approveFreeOrder(t.db, order)).newlyApproved).toBe(false);
		expect(await getOrderTickets(t.db, order.id)).toHaveLength(0);
	});
});

describe('validateNewCode (formulario del admin)', () => {
	const slugs = [EVENT];
	it('normaliza y acepta lo mínimo', () => {
		expect(validateNewCode({ code: ' amigues ', kind: 'percent', value: '15' }, slugs)).toEqual({
			ok: true,
			value: {
				code: 'AMIGUES',
				kind: 'percent',
				value: 15,
				event_slug: null,
				starts_at: null,
				ends_at: null,
				max_uses: null
			}
		});
	});
	it('fechas en hora de Argentina', () => {
		expect(parseLocalDate('2026-12-01T20:00')).toBe(Date.parse('2026-12-01T23:00:00Z'));
		const r = validateNewCode(
			{
				code: 'X20',
				kind: 'fixed',
				value: '2000',
				event_slug: EVENT,
				starts_at: '2026-12-01T20:00',
				max_uses: '5'
			},
			slugs
		);
		expect(r).toMatchObject({
			ok: true,
			value: { event_slug: EVENT, max_uses: 5, starts_at: Date.parse('2026-12-01T23:00:00Z') }
		});
	});
	it.each([
		[{ code: 'a' }, 'code'],
		[{ kind: 'regalo' }, 'kind'],
		[{ value: '101' }, 'value'],
		[{ value: '0' }, 'value'],
		[{ value: '12.5' }, 'value'],
		[{ event_slug: 'no-existe' }, 'event_slug'],
		[{ starts_at: '2026-12-02T00:00', ends_at: '2026-12-01T00:00' }, 'ends_at'],
		[{ ends_at: 'mañana' }, 'ends_at'],
		[{ max_uses: '0' }, 'max_uses']
	])('errores %#', (patch, field) => {
		const r = validateNewCode({ code: 'OK20', kind: 'percent', value: '20', ...patch }, slugs);
		expect(r.ok).toBe(false);
		expect(/** @type {any} */ (r).errors[field]).toBeTruthy();
	});
});
