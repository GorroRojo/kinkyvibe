/**
 * «Vender en puerta» con nota y otro precio (gorrite, 12/10): la nota va en `admin_note` y el
 * precio por entrada se puede cambiar (0 = sin cargo). El Fondo y los totales salen del precio que
 * se cobró, con las mismas funciones (`parseDoorPrice`, `computePrice`), con y sin conexión.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { eventOrderRows } from '$lib/server/admin/eventOrders.js';
import { ORDER_MAX_TOTAL } from '$lib/utils/tickets.js';
import {
	ORDER_NOTE_MAX,
	applyQueuedSales,
	parseDoorSale,
	parseSaleQueue,
	purchaseDetails,
	sellAtDoor
} from './door.js';
import { MANUAL_NOTE_MAX } from './manual.js';

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

// Datos inventados. «General» a $ 10.000 en la puerta, con 20 % de Fondo ($ 2.000).
const EVENT = 'fiesta-de-prueba';
const NOW = Date.parse('2026-10-12T23:00:00Z');
const PERCENT = 20;
const GENERAL = {
	id: 'general',
	name: 'General',
	price: 10000,
	fondo: 2000,
	capacity: 5,
	gorra: null
};
const CONFIG = /** @type {any} */ ({ types: [GENERAL], door: { on: true }, status: '' });
const locals = /** @type {App.Locals} */ (
	/** @type {unknown} */ ({ user: { id: 1, login: 'admin-de-prueba' } })
);
const NOTE = 'Pagó la mitad, el resto la semana que viene';

/** Los campos del formulario de «Vender en puerta», como los manda el celu. */
const fields = (/** @type {Record<string, string>} */ extra = {}) => ({
	type: 'general',
	quantity: '2',
	method: 'efectivo',
	option: 'fondo',
	name: 'Persona Inventada',
	email: '',
	...extra
});

/** Valida con `parseDoorSale` y vende con conexión (lo que hace la acción `sell`). */
async function sellOnline(/** @type {Record<string, string>} */ extra = {}) {
	const f = /** @type {Record<string, string>} */ (fields(extra));
	const parsed = parseDoorSale(CONFIG, (name) => f[name]);
	if (!parsed.ok) throw new Error(parsed.message);
	const { sale } = parsed;
	const r = await sellAtDoor(t.db, {
		eventSlug: EVENT,
		door: CONFIG.door,
		type: sale.type,
		quantity: sale.quantity,
		holders: sale.holders,
		buyer: sale.buyer,
		method: sale.method,
		option: sale.option,
		unitPrice: sale.unitPrice,
		note: sale.note,
		fondoPercent: PERCENT,
		by: 'admin-de-prueba',
		now: NOW
	});
	if (!r.ok) throw new Error('no vendió');
	return r.order;
}

/** Vende sin conexión: la cola que manda el celu, sincronizada con `applyQueuedSales`. */
function syncOffline(/** @type {{ id: string, fields: Record<string, string> }[]} */ items) {
	return applyQueuedSales(t.db, locals, {
		eventSlug: EVENT,
		config: CONFIG,
		fondoPercent: PERCENT,
		by: 'admin-de-prueba',
		items: items.map((i) => ({ ...i, at: NOW - 60_000 })),
		now: NOW
	});
}

async function allOrders() {
	const { results } = await t.db.prepare('SELECT * FROM orders ORDER BY created_at, rowid').all();
	return /** @type {any[]} */ (results);
}

/** Lo que importa de la orden para comparar con y sin conexión. */
const money = (/** @type {any} */ o) => ({
	unit_price: o.unit_price,
	fondo_option: o.fondo_option,
	fondo_amount: o.fondo_amount,
	fondo_contribution: o.fondo_contribution,
	fondo_percent: o.fondo_percent,
	subtotal: o.subtotal,
	surcharge_amount: o.surcharge_amount,
	total: o.total,
	payment_method: o.payment_method,
	admin_note: o.admin_note,
	door_list_price: o.door_list_price,
	channel: o.channel
});

describe('venta en la puerta con nota y otro precio', () => {
	it('guarda la nota y el precio cambiado; el Fondo y el total salen del precio cobrado', async () => {
		const order = await sellOnline({ amount: '5.000', note: `  ${NOTE}  ` });
		// 2 × $ 5.000, Fondo 20 % de $ 5.000 = $ 1.000 por entrada → $ 8.000.
		expect(money(order)).toEqual({
			unit_price: 5000,
			fondo_option: 'fondo',
			fondo_amount: 2000,
			fondo_contribution: 0,
			fondo_percent: PERCENT,
			subtotal: 8000,
			surcharge_amount: 0,
			total: 8000,
			payment_method: 'efectivo',
			admin_note: NOTE,
			door_list_price: 10000,
			channel: 'puerta'
		});
	});

	it('con aporte al fondo o precio completo también usa el precio cobrado', async () => {
		const solidaria = await sellOnline({ amount: '5000', option: 'solidaria', quantity: '1' });
		expect(money(solidaria)).toMatchObject({
			unit_price: 5000,
			fondo_amount: 0,
			fondo_contribution: 500,
			total: 5500
		});
		const completo = await sellOnline({ amount: '5000', option: 'completo', quantity: '1' });
		expect(money(completo)).toMatchObject({ fondo_amount: 0, total: 5000 });
	});

	it('el mismo precio de la puerta no cuenta como cambiado', async () => {
		const order = await sellOnline({ amount: '10000' });
		expect(money(order)).toMatchObject({ unit_price: 10000, total: 16000, door_list_price: null });
		const noAmount = await sellOnline();
		expect(money(noAmount)).toMatchObject({ unit_price: 10000, door_list_price: null });
	});

	it('0 queda sin cargo (`gratis`), adentro y con el precio de siempre a la vista', async () => {
		const order = await sellOnline({ amount: '0', note: 'Invitade de la banda' });
		expect(money(order)).toMatchObject({
			unit_price: 0,
			fondo_amount: 0,
			total: 0,
			payment_method: 'gratis',
			door_list_price: 10000,
			admin_note: 'Invitade de la banda',
			// La base solo acepta precio 0 en las manuales (y a la gorra): queda como cortesía.
			channel: 'manual'
		});
		const tickets = await t.db
			.prepare('SELECT checked_in_at FROM tickets WHERE order_id = ?1')
			.bind(order.id)
			.all();
		expect(tickets.results.map((x) => x.checked_in_at)).toEqual([NOW, NOW]);
		const { rows } = await eventOrderRows(t.db, EVENT, CONFIG);
		expect(rows[0].priceChange.replace(/\u00a0/g, ' ')).toBe(
			'Precio cambiado en la puerta: sin cargo en vez de $ 10.000'
		);
	});

	it('un `door_price: 0` sin precio escrito sigue avisando «cargala a mano» (#374); escrito, vende sin cargo', async () => {
		const free = { ...GENERAL, id: 'invitade', name: 'Invitade', door: { price: 0, fondo: 0 } };
		const base = {
			eventSlug: EVENT,
			type: /** @type {any} */ (free),
			quantity: 1,
			holders: [{ name: 'Persona Inventada', pronouns: '' }],
			buyer: { name: 'Persona Inventada' },
			method: /** @type {const} */ ('efectivo'),
			fondoPercent: PERCENT,
			by: 'admin-de-prueba',
			now: NOW
		};
		// Sin precio escrito (una venta de una versión vieja, sin `amount`): no se vende sola.
		expect(await sellAtDoor(t.db, base)).toEqual({ ok: false, reason: 'free-door' });
		expect(await allOrders()).toHaveLength(0);
		// Quien vende escribió $ 0: es sin cargo a propósito.
		const r = await sellAtDoor(t.db, { ...base, unitPrice: 0 });
		expect(r.ok && money(r.order)).toMatchObject({
			unit_price: 0,
			total: 0,
			payment_method: 'gratis',
			door_list_price: null,
			channel: 'manual'
		});
	});

	it('el total con otro precio respeta el tope técnico de la compra', async () => {
		// $ 60.000.000 por entrada vale (menos que el tope de `price`), pero 2 pasan el tope del total.
		const f = /** @type {Record<string, string>} */ (fields({ amount: '60000000' }));
		const parsed = parseDoorSale(CONFIG, (name) => f[name]);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.message).toMatch(/error de tipeo/);
		await expect(
			sellAtDoor(t.db, {
				eventSlug: EVENT,
				type: GENERAL,
				quantity: 2,
				holders: [
					{ name: 'Persona Inventada', pronouns: '' },
					{ name: 'Otra Persona', pronouns: '' }
				],
				buyer: { name: 'Persona Inventada' },
				method: 'efectivo',
				unitPrice: 60_000_000,
				fondoPercent: PERCENT,
				by: 'admin-de-prueba',
				now: NOW
			})
		).rejects.toThrow('Precio por entrada inválido');
		expect(await allOrders()).toHaveLength(0);
	});

	it('rechaza un precio negativo, con centavos o que pasa el tope de `price`', async () => {
		for (const amount of ['-100', '12,5', '1.5', 'diez', String(ORDER_MAX_TOTAL + 1)]) {
			const f = /** @type {Record<string, string>} */ (fields({ amount }));
			const parsed = parseDoorSale(CONFIG, (name) => f[name]);
			expect(parsed.ok, amount).toBe(false);
			if (!parsed.ok) expect(parsed.message).toMatch(/precio por entrada/);
		}
		// Y `sellAtDoor` sola tampoco los acepta (por si alguien la llama sin `parseDoorSale`).
		for (const unitPrice of [-1, 1.5, ORDER_MAX_TOTAL + 1]) {
			await expect(
				sellAtDoor(t.db, {
					eventSlug: EVENT,
					type: /** @type {any} */ (GENERAL),
					quantity: 1,
					holders: [{ name: 'Persona Inventada', pronouns: '' }],
					buyer: { name: 'Persona Inventada' },
					method: 'efectivo',
					unitPrice,
					fondoPercent: PERCENT,
					by: 'admin-de-prueba',
					now: NOW
				})
			).rejects.toThrow('Precio por entrada inválido');
		}
		expect(await allOrders()).toEqual([]);
	});

	it('la nota tiene el mismo largo máximo que la de la carga a mano', async () => {
		expect(ORDER_NOTE_MAX).toBe(MANUAL_NOTE_MAX);
		const order = await sellOnline({ note: 'x'.repeat(ORDER_NOTE_MAX + 40) });
		expect(order.admin_note).toHaveLength(ORDER_NOTE_MAX);
		const empty = await sellOnline({ note: '   ' });
		expect(empty.admin_note).toBeNull();
	});

	it('el panel muestra la nota y el precio cambiado (Órdenes y la hoja de la compra)', async () => {
		const order = await sellOnline({ amount: '5000', note: NOTE });
		const { rows } = await eventOrderRows(t.db, EVENT, CONFIG);
		expect(rows[0]).toMatchObject({ note: NOTE });
		expect(rows[0].priceChange.replace(/\u00a0/g, ' ')).toBe(
			'Precio cambiado en la puerta: $ 5.000 en vez de $ 10.000'
		);
		const ticket = await t.db
			.prepare('SELECT id FROM tickets WHERE order_id = ?1')
			.bind(order.id)
			.first();
		const details = await purchaseDetails(t.db, {
			slug: EVENT,
			ticketId: String(ticket?.id),
			typeNames: { general: 'General' }
		});
		expect(details).toMatchObject({ note: NOTE, unitPrice: 5000 });
		expect(details?.priceChange).toMatch(/en vez de/);
	});
});

describe('sin conexión: la nota y el precio viajan en la venta encolada', () => {
	it('se sincroniza con el mismo resultado que con conexión, sin «Para revisar», y un reintento no duplica', async () => {
		const extra = { amount: '5000', note: NOTE };
		const online = money(await sellOnline(extra));
		await resetDB(t.db);

		const queued = [{ id: 'venta-celu-0001', fields: fields(extra) }];
		const [first] = await syncOffline(queued);
		expect(first).toMatchObject({ result: 'ok', total: 8000, review: [] });
		const [again] = await syncOffline(queued);
		expect(again).toMatchObject({ result: 'duplicate', orderId: first.orderId, total: 8000 });

		const orders = await allOrders();
		expect(orders).toHaveLength(1);
		expect(money(orders[0])).toEqual(online);
		// Cambiar el precio no es un límite: no queda para revisar.
		expect(orders[0].offline_review).toBeNull();
		expect(orders[0].client_sale_id).toBe('venta-celu-0001');

		// En el registro: de cuánto a cuánto y que tiene nota (la nota no).
		const sale = (await listAudit(t.db)).find((e) => e.action === 'order.door_sale');
		expect(sale?.summary).toMatch(/precio cambiado/);
		expect(sale?.detail).toMatchObject({
			offline: true,
			withNote: true,
			priceChanged: { from: 10000, to: 5000 }
		});
		expect(JSON.stringify(sale)).not.toContain(NOTE);
	});

	it('una venta guardada antes de que existiera el campo (sin `amount`) cobra el precio de la puerta', async () => {
		const [r] = await syncOffline([{ id: 'venta-celu-vieja', fields: fields() }]);
		expect(r).toMatchObject({ result: 'ok', total: 16000 });
		const [order] = await allOrders();
		expect(money(order)).toMatchObject({ unit_price: 10000, door_list_price: null });
	});

	it('un precio inválido en la cola no se registra (queda a la vista en el celu)', async () => {
		const [r] = await syncOffline([{ id: 'venta-celu-mala', fields: fields({ amount: '-5' }) }]);
		expect(r).toMatchObject({ result: 'rejected' });
		expect(r.message).toMatch(/precio por entrada/);
		expect(await allOrders()).toEqual([]);
	});

	it('con el total que cobró el celu (`charged_total`): igual, sin revisar; $ 0, sin cargo y canal `manual`', async () => {
		const [ok] = await syncOffline([
			{ id: 'venta-celu-0003', fields: fields({ amount: '5000', charged_total: '8000' }) }
		]);
		expect(ok).toMatchObject({ result: 'ok', total: 8000, review: [] });
		const [free] = await syncOffline([
			{ id: 'venta-celu-0004', fields: fields({ amount: '0', charged_total: '0' }) }
		]);
		expect(free).toMatchObject({ result: 'ok', total: 0, method: 'gratis', review: [] });
		const orders = await allOrders();
		expect(orders.map((o) => [o.channel, o.door_list_price, o.offline_review])).toEqual([
			['puerta', 10000, null],
			['manual', 10000, null]
		]);
	});

	it('si el total registrado no es el que cobró el celu, queda en «Para revisar» (#372)', async () => {
		// El celu cobró $ 9.000 pero con $ 5.000 por entrada y el Fondo de ahora da $ 8.000.
		const [r] = await syncOffline([
			{ id: 'venta-celu-0005', fields: fields({ amount: '5000', charged_total: '9000' }) }
		]);
		expect(r).toMatchObject({ result: 'ok', total: 8000 });
		expect(r.review).toHaveLength(1);
		const [order] = await allOrders();
		expect(JSON.parse(order.offline_review)).toEqual([
			{ kind: 'price', charged: 9000, recorded: 8000 }
		]);
	});

	it('la cola acepta la nota entera (hasta el largo máximo)', () => {
		const note = 'n'.repeat(ORDER_NOTE_MAX);
		const [item] = /** @type {any[]} */ (
			parseSaleQueue([{ id: 'venta-celu-0002', at: NOW, fields: fields({ note }) }])
		);
		expect(item.fields.note).toBe(note);
	});
});
