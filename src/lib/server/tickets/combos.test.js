/**
 * Códigos combo (combos.js, migración 0056): armar el combo, generar el código al mandar el mail
 * de una compra de A, que valga solo en B y solo con el mail de quien compró, que sea de un solo
 * uso y que reembolsar la compra de A lo anule si no se usó. Eventos y personas inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyDiscount } from '$lib/utils/tickets.js';
import { formatARS } from '$lib/utils/money.js';
import { checkDiscountCode, listDiscountCodes } from './discounts.js';
import { applyPayment, getOrder, refundOrder, reserveOrder } from './orders.js';
import {
	COMBO_CODE_PREFIX,
	comboCodesForOrder,
	comboDiscountText,
	listCombos,
	newComboCode,
	orderEarnsCombos,
	saveCombo,
	setComboActive,
	validateCombo
} from './combos.js';

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

const A = 'taller-de-prueba';
const B = 'fiesta-de-prueba';
const OTHER = 'otro-evento-de-prueba';
const GENERAL = { id: 'general', price: 10000, capacity: 100 };
const NOW = Date.parse('2026-10-12T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const BUYER = 'persona.inventada@example.com';
const ORIGIN = 'https://kinkyvibe.example';

/**
 * Configuración de entradas inventada (lo mínimo que mira combos.js).
 * @param {Partial<import('./config.js').EventTickets>} [o]
 */
function config(o = {}) {
	return /** @type {import('./config.js').EventTickets} */ (
		/** @type {unknown} */ ({
			types: [{ id: 'general', name: 'General', price: 10000, capacity: 100 }],
			title: 'Fiesta de prueba',
			status: undefined,
			opensAt: null,
			closesAt: NOW + 30 * DAY,
			...o
		})
	);
}
/** @type {Record<string, import('./config.js').EventTickets | null>} */
let events = {};
const loadEvent = async (/** @type {string} */ slug) => events[slug] ?? null;

/**
 * Una compra aprobada (o solo reservada) de `eventSlug`.
 * @param {{ eventSlug?: string, email?: string, approve?: boolean,
 *   discount?: { code: string, kind: 'percent' | 'fixed', value: number } | null, now?: number }} [o]
 */
async function buy(o = {}) {
	const { eventSlug = A, email = BUYER, approve = true, discount = null, now = NOW } = o;
	const total = discount ? applyDiscount(GENERAL.price, discount).total : GENERAL.price;
	const r = await reserveOrder(t.db, {
		eventSlug,
		type: GENERAL,
		quantity: 1,
		holders: [{ name: 'Persona Inventada', pronouns: '' }],
		buyer: { name: 'Persona Inventada', email, dni: '40000000' },
		method: total === 0 ? 'gratis' : 'mercadopago',
		discount,
		now
	});
	if (!r.ok) return r;
	if (approve) {
		await applyPayment(
			t.db,
			{
				id: Math.floor(Math.random() * 1e9),
				status: 'approved',
				external_reference: r.order.id,
				transaction_amount: r.order.total,
				currency_id: 'ARS'
			},
			{ now }
		);
	}
	return {
		ok: /** @type {const} */ (true),
		order: /** @type {import('./orders.js').Order} */ (await getOrder(t.db, r.order.id))
	};
}

/** @param {import('./orders.js').Order} order @param {number} [now] */
const codesFor = (order, now = NOW) =>
	comboCodesForOrder(t.db, order, { origin: ORIGIN, now, loadEvent });

beforeEach(async () => {
	events = { [A]: config({ title: 'Taller de prueba' }), [B]: config() };
	await saveCombo(
		t.db,
		A,
		{ target_slug: B, kind: 'percent', value: 25, ends_at: null },
		{ by: 'admin-de-prueba', now: NOW - DAY }
	);
});

describe('validateCombo', () => {
	const ctx = { eventSlug: A, targets: [B, OTHER], now: NOW };

	it('acepta otro evento que vende, con porcentaje o monto y vencimiento opcional', () => {
		expect(validateCombo({ target_slug: B, kind: 'percent', value: '20' }, ctx)).toEqual({
			ok: true,
			value: { target_slug: B, kind: 'percent', value: 20, ends_at: null }
		});
		const r = validateCombo(
			{ target_slug: OTHER, kind: 'fixed', value: '3000', ends_at: '2026-11-01T20:00' },
			ctx
		);
		expect(r).toEqual({
			ok: true,
			value: {
				target_slug: OTHER,
				kind: 'fixed',
				value: 3000,
				ends_at: Date.parse('2026-11-01T20:00:00-03:00')
			}
		});
	});

	it('rechaza el mismo evento, uno que no vende, valores fuera de rango y fechas pasadas', () => {
		expect(validateCombo({ target_slug: A, kind: 'percent', value: '20' }, ctx)).toMatchObject({
			ok: false,
			errors: { target_slug: expect.any(String) }
		});
		expect(
			validateCombo({ target_slug: 'no-vende', kind: 'percent', value: '20' }, ctx)
		).toMatchObject({ ok: false, errors: { target_slug: expect.any(String) } });
		expect(validateCombo({ target_slug: B, kind: 'percent', value: '120' }, ctx)).toMatchObject({
			ok: false,
			errors: { value: 'Un número entero entre 1 y 100.' }
		});
		expect(validateCombo({ target_slug: B, kind: 'raro', value: '10' }, ctx)).toMatchObject({
			ok: false,
			errors: { kind: expect.any(String) }
		});
		expect(
			validateCombo(
				{ target_slug: B, kind: 'percent', value: '10', ends_at: '2026-10-01T10:00' },
				ctx
			)
		).toMatchObject({ ok: false, errors: { ends_at: expect.any(String) } });
	});
});

describe('generar el código', () => {
	it('una compra online aprobada de A genera un código personal para B, de un uso', async () => {
		const a = /** @type {any} */ (await buy()).order;
		const items = await codesFor(a);
		expect(items).toHaveLength(1);
		const [item] = items;
		expect(item.code.startsWith(COMBO_CODE_PREFIX)).toBe(true);
		expect(item).toMatchObject({
			discount: '25 % de descuento',
			targetTitle: 'Fiesta de prueba',
			targetUrl: `${ORIGIN}/calendario/${B}/entradas`
		});
		// Hasta que cierre la venta de B (sin vencimiento propio).
		expect(item.until).not.toBe('');
		const row = await t.db
			.prepare('SELECT * FROM discount_codes WHERE code = ?1')
			.bind(item.code)
			.first();
		expect(row).toMatchObject({
			event_slug: B,
			kind: 'percent',
			value: 25,
			max_uses: 1,
			buyer_email: BUYER,
			source_order_id: a.id,
			created_by: 'combo'
		});
	});

	it('es idempotente: reenviar el mail muestra el mismo código y no crea otro', async () => {
		const a = /** @type {any} */ (await buy()).order;
		const [first, again] = await Promise.all([codesFor(a), codesFor(a)]);
		expect(again).toEqual(first);
		expect((await codesFor(a))[0].code).toBe(first[0].code);
		const n = await t.db.prepare('SELECT COUNT(*) AS n FROM discount_codes').first('n');
		expect(n).toBe(1);
	});

	it('no genera nada sin aprobar, en la puerta, cargada a mano ni con el combo apagado', async () => {
		const pending = /** @type {any} */ (await buy({ approve: false })).order;
		expect(await codesFor(pending)).toEqual([]);
		const approved = /** @type {any} */ (await buy()).order;
		expect(await codesFor({ ...approved, channel: 'puerta' })).toEqual([]);
		expect(await codesFor({ ...approved, channel: 'manual' })).toEqual([]);
		expect(orderEarnsCombos({ status: 'approved', channel: 'online' })).toBe(true);
		await setComboActive(t.db, A, B, false, { by: 'admin-de-prueba', now: NOW });
		expect(await codesFor(approved)).toEqual([]);
	});

	it('no genera si B ya cerró la venta, se canceló o el combo venció', async () => {
		const a = /** @type {any} */ (await buy()).order;
		events[B] = config({ closesAt: NOW - 1 });
		expect(await codesFor(a)).toEqual([]);
		events[B] = config({ status: 'cancelado' });
		expect(await codesFor(a)).toEqual([]);
		events[B] = config();
		await saveCombo(
			t.db,
			A,
			{ target_slug: B, kind: 'percent', value: 25, ends_at: NOW - 1 },
			{ by: 'admin-de-prueba', now: NOW }
		);
		expect(await codesFor(a)).toEqual([]);
	});

	it('un combo que se apaga después no borra el código ya mandado', async () => {
		const a = /** @type {any} */ (await buy()).order;
		const [item] = await codesFor(a);
		await setComboActive(t.db, A, B, false, { by: 'admin-de-prueba', now: NOW });
		expect((await codesFor(a)).map((c) => c.code)).toEqual([item.code]);
	});

	it('cambiar el combo cambia los códigos nuevos, no los ya generados', async () => {
		const first = /** @type {any} */ (await buy()).order;
		const [old] = await codesFor(first);
		await saveCombo(
			t.db,
			A,
			{ target_slug: B, kind: 'fixed', value: 2000, ends_at: null },
			{ by: 'admin-de-prueba', now: NOW }
		);
		const second = /** @type {any} */ (await buy({ email: 'otra.persona@example.com' })).order;
		const [fresh] = await codesFor(second);
		expect(fresh.discount).toBe(`${formatARS(2000)} de descuento`);
		expect((await codesFor(first))[0]).toMatchObject({
			code: old.code,
			discount: '25 % de descuento'
		});
	});

	it('los códigos al azar tienen el prefijo y el alfabeto sin ambiguos', () => {
		for (let i = 0; i < 50; i++) expect(newComboCode()).toMatch(/^COMBO-[2-9A-HJKMNP-Z]{6}$/);
		expect(comboDiscountText({ kind: 'fixed', value: 1500 })).toBe(
			`${formatARS(1500)} de descuento`
		);
	});

	it('descarta los bytes del tramo incompleto para que el alfabeto salga parejo', () => {
		const spy = vi
			.spyOn(crypto, 'getRandomValues')
			.mockImplementationOnce((arr) => {
				/** @type {Uint8Array} */ (arr).fill(255);
				return arr;
			})
			.mockImplementationOnce((arr) => {
				/** @type {Uint8Array} */ (arr).fill(0);
				return arr;
			});
		try {
			expect(newComboCode()).toBe('COMBO-222222');
			expect(spy).toHaveBeenCalledTimes(2);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('usar el código en B', () => {
	/** @returns {Promise<{ a: import('./orders.js').Order, code: string }>} */
	async function issued() {
		const a = /** @type {any} */ (await buy()).order;
		const [item] = await codesFor(a);
		return { a, code: item.code };
	}
	/** @param {string} code @param {{ email?: string, eventSlug?: string }} [o] */
	const useIn = (code, o = {}) =>
		buy({
			eventSlug: o.eventSlug ?? B,
			email: o.email ?? BUYER,
			discount: { code, kind: 'percent', value: 25 }
		});

	it('vale en B con el mail de quien compró A', async () => {
		const { code } = await issued();
		expect(
			await checkDiscountCode(t.db, { code, eventSlug: B, email: BUYER, now: NOW })
		).toMatchObject({ ok: true, discount: { code, buyer_email: BUYER } });
		const r = await useIn(code);
		expect(r).toMatchObject({ ok: true, order: { discount_code: code, total: 7500 } });
	});

	it('con otro mail o en otro evento responde que no existe y la compra no entra', async () => {
		const { code } = await issued();
		expect(
			await checkDiscountCode(t.db, {
				code,
				eventSlug: B,
				email: 'otra.persona@example.com',
				now: NOW
			})
		).toMatchObject({ ok: false, reason: 'other-email', message: 'Ese código no existe.' });
		expect(await useIn(code, { email: 'otra.persona@example.com' })).toMatchObject({
			ok: false,
			reason: 'code',
			message: 'Ese código no existe.'
		});
		expect(await checkDiscountCode(t.db, { code, eventSlug: OTHER, now: NOW })).toMatchObject({
			ok: false,
			message: 'Ese código no existe.'
		});
		expect(await useIn(code, { eventSlug: OTHER })).toMatchObject({ ok: false, reason: 'code' });
	});

	it('«Aplicar» sin mail todavía lo acepta (la compra lo vuelve a mirar con el mail)', async () => {
		const { code } = await issued();
		expect(await checkDiscountCode(t.db, { code, eventSlug: B, now: NOW })).toMatchObject({
			ok: true
		});
	});

	it('es de un solo uso', async () => {
		const { code } = await issued();
		expect((await useIn(code)).ok).toBe(true);
		expect(await useIn(code)).toMatchObject({ ok: false, reason: 'code' });
	});

	it('no aparece en las listas de códigos comunes', async () => {
		await issued();
		expect(await listDiscountCodes(t.db, NOW)).toEqual([]);
	});
});

describe('reembolso de A', () => {
	it('anula el código si no se usó', async () => {
		const a = /** @type {any} */ (await buy()).order;
		const [{ code }] = await codesFor(a);
		await refundOrder(t.db, { orderId: a.id, eventSlug: A, by: 'admin-de-prueba', now: NOW });
		expect(
			await checkDiscountCode(t.db, { code, eventSlug: B, email: BUYER, now: NOW })
		).toMatchObject({ ok: false, reason: 'revoked', message: 'Ese código ya no está activo.' });
		const r = await buy({ eventSlug: B, discount: { code, kind: 'percent', value: 25 } });
		expect(r).toMatchObject({ ok: false, reason: 'code' });
		// Y el mail de A (si se reenviara) ya no lo muestra ni genera otro.
		expect(await codesFor(/** @type {any} */ (await getOrder(t.db, a.id)))).toEqual([]);
		expect(await listCombos(t.db, A, NOW)).toMatchObject([
			{ target_slug: B, issued: 1, used: 0, held: 0, revoked: 1 }
		]);
	});

	it('si ya se usó, la compra de B queda como está', async () => {
		const a = /** @type {any} */ (await buy()).order;
		const [{ code }] = await codesFor(a);
		const b = /** @type {any} */ (
			await buy({ eventSlug: B, discount: { code, kind: 'percent', value: 25 } })
		).order;
		await refundOrder(t.db, { orderId: a.id, eventSlug: A, by: 'admin-de-prueba', now: NOW });
		expect(await getOrder(t.db, b.id)).toMatchObject({ status: 'approved', discount_code: code });
		expect(await listCombos(t.db, A, NOW)).toMatchObject([
			{ target_slug: B, issued: 1, used: 1, held: 0, revoked: 0 }
		]);
	});
});
