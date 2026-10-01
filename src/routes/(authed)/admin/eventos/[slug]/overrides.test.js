/**
 * Pasar límites de entradas desde el panel (venta en la puerta y carga a mano): solo admins,
 * con confirmación explícita (la clave de exactamente esos límites) y anotado en el registro.
 * Y la compra pública sigue con todos sus límites aunque alguien mande `override`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Frontmatter del evento de prueba (cada test lo ajusta). */
const meta = /** @type {Record<string, any>} */ ({});
function resetMeta() {
	for (const k of Object.keys(meta)) delete meta[k];
	Object.assign(meta, {
		title: 'Fiesta de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Lugar de prueba',
		payment_methods: ['mercadopago', 'transferencia'],
		tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 2 }]
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

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { buyAction } from '$lib/server/tickets/checkout.js';
import { getCounts } from '$lib/server/tickets/orders.js';
import * as door from './ingreso/+page.server.js';
import * as manual from './ordenes/cargar/+page.server.js';

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

/**
 * Llama a una form action como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {(event: any) => any} action
 * @param {Record<string, string>} fields
 * @param {any} locals
 * @param {string} path
 */
async function post(action, fields, locals, path) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		params: { slug: SLUG, event: SLUG },
		platform: t.platform,
		locals,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL(`http://localhost${path}`),
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

/** @param {Record<string, string>} fields @param {any} [locals] */
const sell = (fields, locals = admin) =>
	post(
		door.actions.sell,
		{ type: 'general', quantity: '1', method: 'efectivo', name: 'Persona de Prueba', ...fields },
		locals,
		`/admin/eventos/${SLUG}/ingreso`
	);
/** @param {Record<string, string>} fields @param {any} [locals] */
const load = (fields, locals = admin) =>
	post(
		manual.actions.default,
		{ type: 'general', quantity: '1', method: 'cortesia', name: 'Persona de Prueba', ...fields },
		locals,
		`/admin/eventos/${SLUG}/ordenes/cargar`
	);

const sold = async () => (await getCounts(t.db, SLUG)).get('general')?.sold ?? 0;
const overrides = async () =>
	(await listAudit(t.db)).filter((e) => e.action === 'tickets.override');

describe('venta en la puerta', () => {
	it('sin pasar límites vende como siempre, sin pedir confirmación', async () => {
		const r = await sell({ quantity: '2' });
		expect(r.sale).toMatchObject({ ok: true });
		expect(await sold()).toBe(2);
		expect(await overrides()).toEqual([]);
	});

	it('no admin: no vende ni aunque mande override', async () => {
		const r = await sell({ quantity: '3', override: 'capacity:general:3/2' }, notAdmin);
		expect(r).toEqual({ thrown: 403 });
		expect(await sold()).toBe(0);
		expect(await sell({}, {})).toEqual({ thrown: 303 });
	});

	it('admin sin confirmar: 409 con los límites que se pasan (cupo, máximo, solo anticipadas)', async () => {
		meta.puerta = false;
		const r = await sell({ quantity: '12' });
		expect(r.status).toBe(409);
		const nc = r.data.sale.needsConfirmation;
		expect(nc.limits.map((/** @type {any} */ l) => l.kind).sort()).toEqual([
			'capacity',
			'max_per_purchase',
			'no_door'
		]);
		expect(nc.limits.find((/** @type {any} */ l) => l.kind === 'capacity')).toMatchObject({
			capacity: 2,
			after: 12,
			over: 10
		});
		expect(nc.limits.map((/** @type {any} */ l) => l.message).join(' ')).toContain(
			'Este evento es solo anticipadas'
		);
		expect(await sold()).toBe(0);
		// Un "sí" cualquiera no alcanza: hace falta la clave de exactamente estos límites.
		expect((await sell({ quantity: '12', override: '1' })).status).toBe(409);
		expect(await sold()).toBe(0);
	});

	it('admin con confirmación: vende, quedan 3 / 2 y se anota qué límite y por cuánto', async () => {
		await sell({ quantity: '2' });
		const first = await sell({ quantity: '1' });
		expect(first.status).toBe(409);
		const r = await sell({ quantity: '1', override: first.data.sale.needsConfirmation.key });
		expect(r.sale).toMatchObject({ ok: true });
		expect(await sold()).toBe(3);
		const [o] = await overrides();
		expect(o.summary).toBe(
			'Pasó límites de entradas (venta en la puerta): cupo de «General» +1 (3 / 2)'
		);
		expect(o.actorLogin).toBe(ADMINS[0].login);
		const sale = (await listAudit(t.db)).find((e) => e.action === 'order.door_sale');
		expect(/** @type {any} */ (sale).detail.overrides[0]).toMatchObject({ kind: 'capacity' });
	});

	it('si algo cambió entre el diálogo y la confirmación, vuelve a preguntar', async () => {
		await sell({ quantity: '2' });
		const first = await sell({ quantity: '1' });
		const key = first.data.sale.needsConfirmation.key;
		// Mientras tanto se confirmó otra venta: ahora serían 4 / 2.
		await sell({ quantity: '1', override: key });
		const again = await sell({ quantity: '1', override: key });
		expect(again.status).toBe(409);
		expect(again.data.sale.needsConfirmation.limits[0]).toMatchObject({ after: 4, over: 2 });
	});
});

describe('cargar entradas a mano', () => {
	it('cortesía dentro del cupo: orden aprobada, sin cargo, canal manual, sin ingreso marcado', async () => {
		const r = await load({ quantity: '2', holder_1: 'Otra Persona', note: 'Invitación de prueba' });
		expect(r).toMatchObject({ ok: true, overrides: 0 });
		expect(r.tickets.map((/** @type {any} */ x) => x.holder)).toEqual([
			'Persona de Prueba',
			'Otra Persona'
		]);
		const order = /** @type {any} */ (
			await t.db.prepare('SELECT * FROM orders WHERE id = ?1').bind(r.order.id).first()
		);
		expect(order).toMatchObject({
			status: 'approved',
			channel: 'manual',
			payment_method: 'gratis',
			total: 0,
			unit_price: 0,
			admin_note: 'Invitación de prueba'
		});
		const inside = await t.db
			.prepare('SELECT COUNT(checked_in_at) AS n FROM tickets WHERE order_id = ?1')
			.bind(r.order.id)
			.first();
		expect(inside?.n).toBe(0);
		const [entry] = await listAudit(t.db);
		expect(entry.action).toBe('order.manual');
	});

	it('monto propio y "otro" medio de pago', async () => {
		const r = await load({ method: 'otro', amount: '2.500', quantity: '2' });
		expect(r.order).toMatchObject({ total: 5000, method: 'otro' });
	});

	it('no admin: no carga', async () => {
		expect(await load({ override: 'x' }, notAdmin)).toEqual({ thrown: 403 });
		expect(await sold()).toBe(0);
	});

	it('venta cerrada y sin cupo: pide confirmar; con la clave carga y lo anota', async () => {
		meta.start = '2020-01-01T20:00-03:00';
		const first = await load({ quantity: '21' });
		expect(first.status).toBe(409);
		expect(
			first.data.needsConfirmation.limits.map((/** @type {any} */ l) => l.kind).sort()
		).toEqual(['capacity', 'closed', 'max_per_purchase']);
		const ok = await load({ quantity: '21', override: first.data.needsConfirmation.key });
		expect(ok).toMatchObject({ ok: true, overrides: 3 });
		expect(await sold()).toBe(21);
		const [o] = await overrides();
		expect(o.summary).toContain('cupo de «General» +19 (21 / 2)');
		expect(o.summary).toContain('máximo por compra +1 (21 / 20)');
		expect(o.summary).toContain('venta cerrada');
	});
});

describe('compra pública', () => {
	it('mandar `override` no cambia nada: sigue el cupo de siempre', async () => {
		await load({ quantity: '2' });
		expect(await sold()).toBe(2);
		const body = {
			type: 'general',
			quantity: '1',
			name: 'Persona Prueba',
			pronouns: 'elle',
			email: 'publica@example.com',
			dni: '30111222',
			method: 'transferencia',
			accept: 'on',
			holder_name_0: 'Persona Prueba',
			holder_pronouns_0: 'elle',
			override: 'capacity:general:3/2'
		};
		await t.db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
				VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
			)
			.run();
		const r = await post(buyAction, body, admin, `/calendario/${SLUG}/entradas`);
		expect(r.status).toBe(409);
		expect(r.data.buy.error).toContain('Se agotaron');
		expect(await sold()).toBe(2);
		const held = (await getCounts(t.db, SLUG)).get('general')?.held ?? 0;
		expect(held).toBe(0);
	});
});

describe('precio en la puerta y en la carga a mano, por tipo (decisión de gorrite)', () => {
	/**
	 * «General» con preventas (Preventa 1 a $ 8.000, el resto a $ 10.000) y «Pareja» a $ 18.000.
	 * @param {{ general?: number, pareja?: number }} [door] `door_price` de cada uno
	 */
	function twoTypes(door = {}) {
		meta.puerta = true;
		meta.tickets = [
			{
				id: 'general',
				name: 'General',
				capacity: 10,
				tiers: [
					{ id: 'p1', name: 'Preventa 1', price: 8000, quantity: 5 },
					{ id: 'general', name: 'General', price: 10000 }
				],
				...(door.general !== undefined ? { door_price: door.general } : {})
			},
			{
				id: 'pareja',
				name: 'Pareja',
				price: 18000,
				capacity: 10,
				...(door.pareja !== undefined ? { door_price: door.pareja } : {})
			}
		];
	}
	/** Monto sugerido de cada tipo en la carga a mano (`load`, como SvelteKit). */
	async function suggested() {
		const r = await post(manual.load, {}, admin, `/admin/eventos/${SLUG}/ordenes/cargar`);
		return Object.fromEntries(r.types.map((/** @type {any} */ x) => [x.id, x.price]));
	}
	/** Precio de cada tipo en la pantalla del modo puerta. */
	async function doorScreen() {
		const r = await post(door.load, {}, admin, `/admin/eventos/${SLUG}/ingreso`);
		return Object.fromEntries(r.types.map((/** @type {any} */ x) => [x.id, x.price]));
	}
	const orders = async () =>
		(
			await t.db
				.prepare(
					'SELECT ticket_type, channel, unit_price, ticket_tier FROM orders ORDER BY created_at, rowid'
				)
				.all()
		).results;

	it('sin door_price: el último tramo o el precio fijo, sin gastar la preventa y contando para el cupo', async () => {
		twoTypes();
		expect(await doorScreen()).toEqual({ general: 10000, pareja: 18000 });
		expect((await sell({ type: 'general' })).sale).toMatchObject({ ok: true });
		expect((await sell({ type: 'pareja' })).sale).toMatchObject({ ok: true });
		const amounts = await suggested();
		expect(amounts).toEqual({ general: 10000, pareja: 18000 });
		await load({ type: 'general', method: 'efectivo', amount: String(amounts.general) });
		expect(await orders()).toEqual([
			{ ticket_type: 'general', channel: 'puerta', unit_price: 10000, ticket_tier: null },
			{ ticket_type: 'pareja', channel: 'puerta', unit_price: 18000, ticket_tier: null },
			{ ticket_type: 'general', channel: 'manual', unit_price: 10000, ticket_tier: null }
		]);
		expect(await sold()).toBe(2);
	});

	it('cada tipo con su door_price: la puerta cobra ese, la pantalla lo muestra y la carga a mano lo sugiere', async () => {
		twoTypes({ general: 12000, pareja: 20000 });
		// La nota del evento no cambia lo que se cobra.
		meta.puerta_precio = '$ 99.999, solo efectivo';
		expect(await doorScreen()).toEqual({ general: 12000, pareja: 20000 });
		expect((await sell({ type: 'general', quantity: '2' })).sale).toMatchObject({ ok: true });
		expect((await sell({ type: 'pareja' })).sale).toMatchObject({ ok: true });
		const amounts = await suggested();
		expect(amounts).toEqual({ general: 12000, pareja: 20000 });
		await load({ type: 'pareja', method: 'efectivo', amount: String(amounts.pareja) });
		expect(await orders()).toEqual([
			{ ticket_type: 'general', channel: 'puerta', unit_price: 12000, ticket_tier: null },
			{ ticket_type: 'pareja', channel: 'puerta', unit_price: 20000, ticket_tier: null },
			{ ticket_type: 'pareja', channel: 'manual', unit_price: 20000, ticket_tier: null }
		]);
	});
});
