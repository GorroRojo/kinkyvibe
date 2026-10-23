import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { reviewOrders } from '$lib/server/admin/inicio.js';
import {
	QUEUE_MAX_AGE_MS,
	SALE_QUEUE_MAX_ITEMS,
	applyQueuedSales,
	doorCounts,
	offlineReviewMessages,
	parseDoorSale,
	parseSaleQueue,
	sellAtDoor
} from './door.js';
import { clearReview } from './orders.js';

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

// Datos inventados.
const EVENT = 'fiesta-de-prueba';
const NOW = Date.parse('2026-10-01T23:00:00Z');
const GENERAL = { id: 'general', name: 'General', price: 8000, fondo: 0, capacity: 3, gorra: null };
const LIBRE = { id: 'libre', name: 'Libre', price: 5000, fondo: 0, capacity: null, gorra: null };
const CONFIG = /** @type {any} */ ({ types: [GENERAL, LIBRE], door: { on: true }, status: '' });
const locals = /** @type {App.Locals} */ (
	/** @type {unknown} */ ({ user: { id: 1, login: 'admin-de-prueba' } })
);

/**
 * Una venta hecha sin conexión, como la manda el celu.
 * @param {string} id
 * @param {Record<string, string>} [fields]
 * @param {number} [at]
 * @returns {{ id: string, at: number, fields: Record<string, string> }}
 */
function sale(id, fields = {}, at = NOW - 60_000) {
	return {
		id,
		at,
		fields: {
			type: 'general',
			quantity: '1',
			method: 'efectivo',
			name: 'Persona Inventada',
			email: '',
			...fields
		}
	};
}

/**
 * @param {ReturnType<typeof sale>[]} items
 * @param {Partial<Parameters<typeof applyQueuedSales>[2]>} [o]
 */
function apply(items, o = {}) {
	return applyQueuedSales(t.db, locals, {
		eventSlug: EVENT,
		config: CONFIG,
		by: 'admin-de-prueba',
		items,
		now: NOW,
		...o
	});
}

async function allOrders() {
	const { results } = await t.db.prepare('SELECT * FROM orders ORDER BY created_at, rowid').all();
	return /** @type {any[]} */ (results);
}

describe('parseSaleQueue', () => {
	it('acepta la cola del celu y descarta campos que no son del formulario (y el DNI)', () => {
		const q = parseSaleQueue([
			{ ...sale('venta-0001'), fields: { ...sale('venta-0001').fields, dni: '30123456', x: '1' } }
		]);
		expect(q).toHaveLength(1);
		expect(q?.[0].fields).not.toHaveProperty('dni');
		expect(q?.[0].fields).not.toHaveProperty('x');
		expect(q?.[0].fields.name).toBe('Persona Inventada');
	});

	it('rechaza lo que no tiene forma de cola', () => {
		expect(parseSaleQueue(null)).toBeNull();
		expect(parseSaleQueue([{ id: 'corto', at: NOW, fields: {} }])).toBeNull();
		expect(parseSaleQueue([{ id: 'venta-0001', at: 'ayer', fields: {} }])).toBeNull();
		expect(parseSaleQueue([{ id: 'venta-0001', at: NOW }])).toBeNull();
		const many = Array.from({ length: SALE_QUEUE_MAX_ITEMS + 1 }, (_, i) =>
			sale(`venta-${String(i).padStart(4, '0')}`)
		);
		expect(parseSaleQueue(many)).toBeNull();
	});
});

describe('parseDoorSale (la misma validación con y sin conexión)', () => {
	/** @param {Record<string, string>} f */
	const parse = (f) => parseDoorSale(CONFIG, (name) => f[name]);

	it('arma la venta con los mismos campos del formulario', () => {
		const r = parse({
			type: 'general',
			quantity: '2',
			method: 'transferencia',
			name: ' Persona Inventada ',
			email: 'Prueba@Example.com',
			pronouns: 'elle',
			holder_1: 'Otra Persona',
			send_email: 'on'
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.sale).toMatchObject({
			quantity: 2,
			method: 'transferencia',
			buyer: { name: 'Persona Inventada', email: 'prueba@example.com', dni: null },
			sendEmail: true
		});
		expect(r.sale.holders).toEqual([
			{ name: 'Persona Inventada', pronouns: 'elle' },
			{ name: 'Otra Persona', pronouns: '' }
		]);
	});

	it('los mensajes de error de siempre', () => {
		expect(parse({})).toEqual({ ok: false, message: 'Elegí un tipo de entrada.' });
		expect(parse({ type: 'general', quantity: '0' })).toMatchObject({ ok: false });
		expect(parse({ type: 'general', quantity: '1', method: 'mercadopago' })).toEqual({
			ok: false,
			message: 'Elegí cómo pagó: efectivo o transferencia.'
		});
		expect(parse({ type: 'general', quantity: '1', method: 'efectivo' })).toEqual({
			ok: false,
			message: 'Falta el nombre de quien compra.'
		});
		expect(
			parse({ type: 'general', quantity: '1', method: 'efectivo', name: 'X', dni: '12' })
		).toEqual({ ok: false, message: 'El DNI tiene que tener 7 a 9 números.' });
	});
});

describe('applyQueuedSales (ventas sin conexión)', () => {
	it('registra la venta con la hora del celu, ya adentro, y la anota en el registro', async () => {
		const at = NOW - 5 * 60_000;
		const [r] = await apply([sale('venta-0001', { quantity: '2' }, at)]);
		expect(r).toMatchObject({ id: 'venta-0001', result: 'ok', quantity: 2, review: [] });
		const [o] = await allOrders();
		expect(o).toMatchObject({
			status: 'approved',
			channel: 'puerta',
			payment_method: 'efectivo',
			client_sale_id: 'venta-0001',
			offline_review: null,
			created_at: at,
			total: 16000
		});
		expect(await doorCounts(t.db, EVENT)).toMatchObject({ total: 2, inside: 2 });
		const { results } = await t.db.prepare('SELECT checked_in_at FROM tickets').all();
		expect(results.map((x) => x.checked_in_at)).toEqual([at, at]);
		const audit = await listAudit(t.db);
		expect(audit.find((a) => a.action === 'order.door_sale')?.summary).toContain('sin conexión');
	});

	it('idempotente: la misma venta dos veces (reintento) crea una sola orden', async () => {
		const first = await apply([sale('venta-0001')]);
		const again = await apply([sale('venta-0001')]);
		expect(first[0].result).toBe('ok');
		expect(again[0]).toMatchObject({ result: 'duplicate', orderId: first[0].orderId });
		expect(await allOrders()).toHaveLength(1);
		// Repetida dentro del mismo envío, también.
		const both = await apply([sale('venta-0002'), sale('venta-0002')]);
		expect(both.map((x) => x.result)).toEqual(['ok', 'duplicate']);
		expect(await allOrders()).toHaveLength(2);
	});

	it('el índice único frena una orden repetida aunque se saltee el control previo', async () => {
		const parsed = parseDoorSale(CONFIG, (n) => sale('x').fields[n]);
		if (!parsed.ok) throw new Error('venta inválida');
		const input = {
			eventSlug: EVENT,
			door: CONFIG.door,
			override: true,
			offline: { clientSaleId: 'venta-0001', review: [] },
			type: parsed.sale.type,
			quantity: 1,
			holders: parsed.sale.holders,
			buyer: parsed.sale.buyer,
			method: /** @type {const} */ ('efectivo'),
			by: 'admin-de-prueba',
			now: NOW
		};
		expect((await sellAtDoor(t.db, input)).ok).toBe(true);
		await expect(sellAtDoor(t.db, input)).rejects.toThrow();
		expect(await allOrders()).toHaveLength(1);
		expect(await t.db.prepare('SELECT COUNT(*) AS n FROM tickets').first()).toEqual({ n: 1 });
	});

	it('se registran en el orden en que se vendieron', async () => {
		const r = await apply([
			sale('venta-000a', { name: 'Primera' }, NOW - 3000),
			sale('venta-000b', { name: 'Segunda' }, NOW - 2000),
			sale('venta-000c', { name: 'Tercera' }, NOW - 1000)
		]);
		expect(r.map((x) => x.id)).toEqual(['venta-000a', 'venta-000b', 'venta-000c']);
		expect((await allOrders()).map((o) => o.buyer_name)).toEqual(['Primera', 'Segunda', 'Tercera']);
		const { results } = await t.db.prepare('SELECT buyer_name FROM orders ORDER BY rowid').all();
		expect(results.map((x) => x.buyer_name)).toEqual(['Primera', 'Segunda', 'Tercera']);
	});

	it('pasado el cupo: la venta se guarda igual, queda para revisar y avisa', async () => {
		// El cupo de General es 3: la primera entra, la segunda lo pasa por 1.
		const r = await apply([
			sale('venta-0001', { quantity: '2', name: 'Entra' }),
			sale('venta-0002', { quantity: '2', name: 'Se pasa' })
		]);
		expect(r[0]).toMatchObject({ result: 'ok', review: [] });
		expect(r[1].result).toBe('ok');
		expect(r[1].review?.[0]).toContain('cupo de «General»');
		const orders = await allOrders();
		expect(orders).toHaveLength(2);
		expect(orders[0].offline_review).toBeNull();
		expect(JSON.parse(orders[1].offline_review)).toEqual([
			expect.objectContaining({ kind: 'capacity', after: 4, capacity: 3, over: 1 })
		]);
		expect(offlineReviewMessages(orders[1].offline_review)[0]).toContain('4 / 3');
		expect(await doorCounts(t.db, EVENT)).toMatchObject({ total: 4, inside: 4 });
		// «Para revisar» la muestra; al marcarla revisada, sale.
		expect(await reviewOrders(t.db)).toEqual([
			expect.objectContaining({ id: orders[1].id, reason: 'door_offline', buyerName: 'Se pasa' })
		]);
		expect(await clearReview(t.db, orders[1].id)).toBe(true);
		expect(await reviewOrders(t.db)).toEqual([]);
		// Queda en el registro como un pase de límite.
		const audit = await listAudit(t.db);
		expect(audit.some((a) => a.action === 'tickets.override')).toBe(true);
	});

	it('un tipo agotado o un evento solo anticipadas mientras tanto: también se guarda', async () => {
		await apply([sale('venta-0001', { quantity: '3' })]);
		const r = await apply([sale('venta-0002')], {
			config: { ...CONFIG, door: { on: false } }
		});
		expect(r[0].result).toBe('ok');
		expect(r[0].review).toHaveLength(2);
		expect(await allOrders()).toHaveLength(2);
	});

	it('efectivo o transferencia, como con conexión (y si se vio llegar la transferencia)', async () => {
		await apply([
			sale('venta-0001', { method: 'efectivo', type: 'libre' }),
			sale('venta-0002', { method: 'transferencia', type: 'libre', transfer_seen: 'on' })
		]);
		const orders = await allOrders();
		expect(orders.map((o) => o.payment_method)).toEqual(['efectivo', 'transferencia']);
		// Sin recargo en la puerta, en ninguno de los dos.
		expect(orders.map((o) => o.total)).toEqual([5000, 5000]);
		const audit = await listAudit(t.db);
		const transfer = audit.find(
			(a) => a.action === 'order.door_sale' && a.targetId === orders[1].id
		);
		expect(transfer?.detail).toMatchObject({ method: 'transferencia', transferSeen: true });
	});

	it('datos que no sirven: no crea nada y lo dice (el celu la deja a la vista)', async () => {
		const r = await apply([sale('venta-0001', { type: 'ya-no-existe' })]);
		expect(r[0]).toEqual({
			id: 'venta-0001',
			result: 'rejected',
			message: 'Elegí un tipo de entrada.'
		});
		expect(await allOrders()).toHaveLength(0);
	});

	it('la hora del celu se acota: nunca en el futuro ni más vieja que el máximo', async () => {
		await apply([
			sale('venta-0001', {}, NOW + 3_600_000),
			sale('venta-0002', { type: 'libre' }, NOW - 10 * QUEUE_MAX_AGE_MS)
		]);
		expect((await allOrders()).map((o) => o.created_at).sort()).toEqual(
			[NOW - QUEUE_MAX_AGE_MS, NOW].sort()
		);
	});
});

describe('sin cambios con conexión', () => {
	it('la venta de siempre no usa las columnas de la venta sin conexión', async () => {
		const r = await sellAtDoor(t.db, {
			eventSlug: EVENT,
			type: GENERAL,
			quantity: 1,
			holders: [{ name: 'Con Conexión', pronouns: '' }],
			buyer: { name: 'Con Conexión', email: '' },
			method: 'efectivo',
			by: 'admin-de-prueba',
			now: NOW
		});
		expect(r.ok).toBe(true);
		const [o] = await allOrders();
		expect(o.client_sale_id).toBeNull();
		expect(o.offline_review).toBeNull();
		expect(await reviewOrders(t.db)).toEqual([]);
	});

	it('con conexión sigue respetando el cupo (no pasa a «guardar igual»)', async () => {
		const base = {
			eventSlug: EVENT,
			type: GENERAL,
			holders: [1, 2, 3].map((i) => ({ name: `Persona ${i}`, pronouns: '' })),
			buyer: { name: 'Persona 1', email: '' },
			method: /** @type {const} */ ('efectivo'),
			by: 'admin-de-prueba',
			now: NOW
		};
		expect((await sellAtDoor(t.db, { ...base, quantity: 3 })).ok).toBe(true);
		const r = await sellAtDoor(t.db, { ...base, quantity: 1, holders: [base.holders[0]] });
		expect(r).toMatchObject({ ok: false, reason: 'soldout' });
	});
});

describe('parseDoorSale: el monto a la gorra se lee como en la compra online', () => {
	const GORRA = {
		...LIBRE,
		id: 'gorra',
		name: 'A la gorra',
		gorra: { min: 1000, suggested: 5000 }
	};
	const GORRA_CONFIG = /** @type {any} */ ({ types: [GORRA], door: { on: true }, status: '' });
	/** @param {string} amount @param {string} [quantity] */
	const parse = (amount, quantity = '1') =>
		parseDoorSale(
			GORRA_CONFIG,
			(name) =>
				/** @type {Record<string, string>} */ ({
					type: 'gorra',
					quantity,
					method: 'efectivo',
					name: 'Persona Inventada',
					amount
				})[name]
		);

	it('«5.000», «$ 5.000», «5000» y «5000,00» son $ 5.000', () => {
		for (const amount of ['5.000', '$ 5.000', '5000', '5000,00']) {
			const r = parse(amount);
			expect(r.ok, amount).toBe(true);
			if (r.ok) expect(r.sale.unitPrice, amount).toBe(5000);
		}
	});

	it('«5000.00» y «5.5» no se adivinan (antes «5000.00» quedaba en $ 500.000)', () => {
		for (const amount of ['5000.00', '5.5']) {
			const r = parse(amount);
			expect(r.ok, amount).toBe(false);
			if (!r.ok) expect(r.message).toMatch(/sin centavos/);
		}
	});

	it('respeta el mínimo y el tope técnico de la compra', () => {
		const low = parse('500');
		expect(low.ok).toBe(false);
		if (!low.ok) expect(low.message).toMatch(/al menos/);
		const huge = parse('60.000.000', '2');
		expect(huge.ok).toBe(false);
		if (!huge.ok) expect(huge.message).toMatch(/error de tipeo/);
	});
});
