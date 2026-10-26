/**
 * «Vender en puerta» con nota y otro precio, por las acciones del modo puerta (como SvelteKit):
 * con conexión (`sell`), sin conexión (`syncSales`, con reintento) y solo para admins.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Frontmatter del evento de prueba. Datos inventados. */
const meta = /** @type {Record<string, any>} */ ({});
function resetMeta() {
	for (const k of Object.keys(meta)) delete meta[k];
	Object.assign(meta, {
		title: 'Fiesta de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Lugar de prueba',
		payment_methods: ['mercadopago', 'transferencia'],
		puerta: true,
		tickets: [{ id: 'general', name: 'General', price: 8000, door_price: 10000, capacity: 20 }]
	});
}
resetMeta();

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	return {
		...actual,
		isValidEventSlug: () => true,
		getEventMeta: async () => meta,
		getEventTickets: async (/** @type {string} */ _slug, /** @type {any} */ opts) =>
			parseTicketConfig(meta, opts)
	};
});

// Como en overrides.test.js: sin serie (leer las publicaciones compila todo el repo).
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async () => []
}));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import * as door from './+page.server.js';

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
	resetMeta();
});

const SLUG = 'fiesta-de-prueba';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };
const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));
const NOTE = 'Le debe $ 2.000, vuelve el sábado';

/**
 * Llama a una form action como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {(event: any) => any} action
 * @param {Record<string, string>} fields
 * @param {any} locals
 */
async function post(action, fields, locals) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		params: { slug: SLUG },
		platform: t.platform,
		locals,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL(`http://localhost/admin/eventos/${SLUG}/ingreso`),
		fetch: noFetch,
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => '203.0.113.9',
		setHeaders: () => {}
	};
	try {
		return /** @type {any} */ (await action(event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

const saleFields = (/** @type {Record<string, string>} */ extra = {}) => ({
	type: 'general',
	quantity: '2',
	method: 'efectivo',
	name: 'Persona de Prueba',
	...extra
});

async function orders() {
	const { results } = await t.db
		.prepare(
			`SELECT unit_price, total, payment_method, admin_note, door_list_price, client_sale_id
			FROM orders ORDER BY created_at, rowid`
		)
		.all();
	return results;
}

describe('vender en puerta con nota y otro precio', () => {
	it('con conexión: guarda los dos, los devuelve para el resultado y lo anota en el registro', async () => {
		const r = await post(door.actions.sell, saleFields({ amount: '6.000', note: NOTE }), admin);
		expect(r.sale).toMatchObject({ ok: true, total: 12000, method: 'efectivo', note: NOTE });
		expect(r.sale.priceChange.replace(/\u00a0/g, ' ')).toBe(
			'Precio cambiado en la puerta: $ 6.000 en vez de $ 10.000'
		);
		expect(await orders()).toEqual([
			{
				unit_price: 6000,
				total: 12000,
				payment_method: 'efectivo',
				admin_note: NOTE,
				door_list_price: 10000,
				client_sale_id: null
			}
		]);
		const entry = (await listAudit(t.db)).find((e) => e.action === 'order.door_sale');
		expect(entry?.summary).toMatch(/precio cambiado/);
		expect(entry?.detail).toMatchObject({
			withNote: true,
			priceChanged: { from: 10000, to: 6000 }
		});
	});

	it('la pantalla trae lo que necesita: el precio de la puerta prellenado y el largo de la nota', async () => {
		const r = await post(door.load, {}, admin);
		expect(r.types[0]).toMatchObject({ id: 'general', price: 10000 });
		expect(r.noteMax).toBe(300);
		expect(r).toHaveProperty('fondoPercent');
	});

	it('un precio inválido no vende', async () => {
		for (const amount of ['-1', '9,5', '100000001']) {
			const r = await post(door.actions.sell, saleFields({ amount }), admin);
			expect(r.status, amount).toBe(400);
			expect(r.data.sale.message).toMatch(/precio por entrada/);
		}
		expect(await orders()).toEqual([]);
	});

	it('sin conexión: se sincroniza con el mismo resultado y un reintento no duplica', async () => {
		const sales = JSON.stringify([
			{
				id: 'venta-celu-0001',
				at: Date.now() - 60_000,
				fields: saleFields({ amount: '6000', note: NOTE })
			}
		]);
		const first = await post(door.actions.syncSales, { sales }, admin);
		expect(first.syncSales.results).toMatchObject([{ result: 'ok', total: 12000, review: [] }]);
		const again = await post(door.actions.syncSales, { sales }, admin);
		expect(again.syncSales.results).toMatchObject([{ result: 'duplicate', total: 12000 }]);
		expect(await orders()).toEqual([
			{
				unit_price: 6000,
				total: 12000,
				payment_method: 'efectivo',
				admin_note: NOTE,
				door_list_price: 10000,
				client_sale_id: 'venta-celu-0001'
			}
		]);
	});

	it('quien no es admin no puede vender ni sincronizar (ni con nota ni con otro precio)', async () => {
		const fields = saleFields({ amount: '0', note: NOTE });
		expect(await post(door.actions.sell, fields, notAdmin)).toEqual({ thrown: 403 });
		const sales = JSON.stringify([{ id: 'venta-celu-0002', at: Date.now(), fields }]);
		expect(await post(door.actions.syncSales, { sales }, notAdmin)).toEqual({ thrown: 403 });
		expect(await post(door.actions.sell, fields, {})).toEqual({ thrown: 303 });
		expect(await orders()).toEqual([]);
	});
});
