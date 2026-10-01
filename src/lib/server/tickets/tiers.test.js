/**
 * Preventas escalonadas (tramos por cantidad y por fecha), tipos encadenados, cupo opcional,
 * "quedan N" y los pases de límite del panel con tramos. Con D1 real en memoria. Las pruebas de
 * concurrencia precargan filas y lanzan pocas compras a la vez (no dependen de la velocidad de CI).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./events.js', async () => {
	const { parseTicketConfig } = await import('./config.js');
	const DAY = 24 * 60 * 60 * 1000;
	const common = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['mercadopago', 'transferencia']
	};
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		preventa: {
			...common,
			tickets: [
				{
					id: 'general',
					name: 'General',
					capacity: 20,
					tiers: [
						{ id: 'p1', name: 'Preventa 1', price: 8000, quantity: 3 },
						{ id: 'p2', name: 'Preventa 2', price: 9000, quantity: 3 },
						{ id: 'general', name: 'General', price: 10000 }
					]
				},
				{ id: 'ultima', name: 'Última tanda', price: 12000, capacity: 5, after: 'general' },
				{ id: 'libre', name: 'Libre', price: 5000 }
			]
		},
		'por-fecha': {
			...common,
			tickets: [
				{
					id: 'general',
					name: 'General',
					tiers: [
						{
							id: 'early',
							name: 'Anticipada',
							price: 7000,
							until: new Date(Date.now() + DAY).toISOString()
						},
						{ id: 'full', name: 'General', price: 10000 }
					]
				},
				{
					id: 'vieja',
					name: 'Vieja',
					tiers: [
						{
							id: 'early',
							name: 'Anticipada',
							price: 7000,
							until: new Date(Date.now() - DAY).toISOString()
						},
						{ id: 'full', name: 'Vieja', price: 10000 }
					]
				}
			]
		},
		'solo-anticipadas': {
			...common,
			puerta: false,
			tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 10 }]
		}
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug] ? parseTicketConfig(metas[slug], opts) : null,
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { confirmTransferFromPanel } from '$lib/server/admin/transfers.js';
import { computePrice } from '$lib/utils/tickets.js';
import { buyAction, getTicketsView, summarizeTickets, tierLeftMessage } from './checkout.js';
import { parseTicketConfig, withTier } from './config.js';
import { doorSaleLimits, sellAtDoor } from './door.js';
import { getEventTickets } from './events.js';
import { manualOrderLimits } from './manual.js';
import {
	confirmTransfer,
	getOrder,
	getTaken,
	reserveOrder,
	tierTaken,
	transferLimits
} from './orders.js';
import { checkOverride, logOverride } from './overrides.js';

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
	// Datos para transferir inventados (así se ofrece la transferencia).
	await t.db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
			VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
		)
		.run();
});

const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));
const ADMIN = /** @type {App.Locals} */ (
	/** @type {unknown} */ ({ user: { id: 1, login: 'admin-de-prueba' } })
);
const BIG = { perEmailQuantity: 1000, perEmailOrders: 1000, perClientQuantity: 1000 };

let n = 0;
/** @param {number} q */
const people = (q) =>
	Array.from({ length: q }, (_, i) => ({ name: `Persona ${i + 1}`, pronouns: 'elle' }));

/**
 * Precarga lugares tomados de un tipo/tramo (una sola fila). `approved` por defecto; si no, una
 * reserva vigente.
 *
 * @param {string} slug
 * @param {string} typeId
 * @param {string | null} tierId
 * @param {number} quantity
 * @param {{ approved?: boolean }} [o]
 */
async function preload(slug, typeId, tierId, quantity, { approved = true } = {}) {
	const r = await reserveOrder(t.db, {
		eventSlug: slug,
		type: {
			id: typeId,
			price: 1000,
			capacity: null,
			tier: tierId ? { id: tierId, quantity: null, until: null } : null
		},
		quantity,
		holders: people(quantity),
		buyer: { name: 'Precarga', email: `precarga${++n}@example.com`, dni: '30000000' },
		method: 'transferencia',
		limits: BIG
	});
	if (!r.ok) throw new Error(`precarga: ${JSON.stringify(r)}`);
	if (approved)
		await t.db
			.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1")
			.bind(r.order.id)
			.run();
	return r.order;
}

/**
 * Llama a `?/buy` como SvelteKit. Devuelve el `fail` o, si redirige, `{ redirect }`.
 * @param {string} slug
 * @param {Record<string, string>} fields
 */
async function buy(slug, fields) {
	const body = new FormData();
	const q = Number(fields.quantity ?? '1');
	const all = {
		type: 'general',
		quantity: '1',
		name: 'Persona Prueba',
		pronouns: 'elle',
		email: `compra${++n}@example.com`,
		dni: '30111222',
		method: 'transferencia',
		accept: 'on',
		...Object.fromEntries(
			Array.from({ length: q }, (_, i) => [
				[`holder_name_${i}`, `Persona ${i + 1}`],
				[`holder_pronouns_${i}`, 'elle']
			]).flat()
		),
		...fields
	};
	for (const [k, v] of Object.entries(all)) body.set(k, String(v));
	/** @type {any} */
	const event = {
		params: { event: slug },
		platform: t.platform,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL(`http://localhost/calendario/${slug}/entradas`),
		fetch: noFetch,
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		// Cada compra desde otra conexión (los límites por cliente se prueban en safeguards.test.js).
		getClientAddress: () => `198.51.100.${n % 250}`
	};
	try {
		return /** @type {any} */ (await buyAction(event));
	} catch (e) {
		const r = /** @type {any} */ (e);
		if (r?.status === 303) return { redirect: r.location };
		throw e;
	}
}

/** @param {{ redirect?: string }} r */
async function orderOf(r) {
	const id = String(r.redirect).split('/')[2];
	return /** @type {import('./orders.js').Order} */ (await getOrder(t.db, id));
}

/** @param {string} slug */
async function view(slug) {
	const v = await getTicketsView(t.db, slug, noFetch);
	if (!v) throw new Error('sin entradas');
	return v;
}

describe('config: tramos y encadenados', () => {
	const base = { title: 'x', start: '2099-12-01T20:00-03:00' };
	/** @param {any[]} tickets */
	const parse = (tickets) => parseTicketConfig({ ...base, tickets });

	it('lee los tramos; el precio "pleno" del tipo es el del último tramo', () => {
		const c = parse([
			{
				id: 'general',
				name: 'General',
				tiers: [
					{ id: 'p1', name: 'Preventa 1', price: 8000, quantity: 5 },
					{ id: 'general', name: 'General', price: 10000 }
				]
			}
		]);
		expect(c?.types[0]).toMatchObject({ price: 10000, capacity: null });
		expect(c?.types[0].tiers?.map((x) => [x.id, x.price, x.quantity])).toEqual([
			['p1', 8000, 5],
			['general', 10000, null]
		]);
	});

	it('el Fondo se calcula por tramo y el descuento por código va sobre el precio del tramo', () => {
		const c = parseTicketConfig(
			{
				...base,
				tags: ['KinkyVibe'],
				tickets: [
					{
						id: 'general',
						tiers: [
							{ id: 'p1', price: 8000, quantity: 5 },
							{ id: 'full', price: 10000 }
						]
					}
				]
			},
			{ fondoPercent: 20 }
		);
		const type = /** @type {import('./config.js').TicketType} */ (c?.types[0]);
		expect(type.tiers?.map((x) => x.fondo)).toEqual([1600, 2000]);
		const eff = withTier(type, type.tiers?.[0]);
		expect(eff).toMatchObject({ price: 8000, fondo: 1600, tier: { id: 'p1', quantity: 5 } });
		// 2 con el fondo (2 × 6.400) − 10 % de código = 11.520.
		const p = computePrice({
			price: eff.price,
			fondo: eff.fondo,
			option: 'fondo',
			quantity: 2,
			discount: { kind: 'percent', value: 10 }
		});
		expect(p).toMatchObject({
			list: 16000,
			fondo: 3200,
			subtotal: 12800,
			discount: 1280,
			total: 11520
		});
	});

	it.each([
		[[{ id: 'g', price: 1, tiers: [{ id: 'a', price: 1 }] }], /price.*tiers/],
		[
			[{ id: 'g', a_la_gorra: { minimo: 0, sugerido: 1 }, tiers: [{ id: 'a', price: 1 }] }],
			/gorra/
		],
		[[{ id: 'g', tiers: [] }], /1 a 10/],
		[[{ id: 'g', tiers: [{ id: 'a', price: 0 }] }], /Precio inválido/],
		[[{ id: 'g', tiers: [{ id: 'a', price: 1, quantity: 0 }] }], /Cantidad inválida/],
		[
			[
				{
					id: 'g',
					tiers: [
						{ id: 'a', price: 1 },
						{ id: 'a', price: 2 }
					]
				}
			],
			/repetido/
		],
		[
			[
				{
					id: 'g',
					tiers: [
						{ id: 'a', price: 1 },
						{ id: 'b', price: 2 }
					]
				}
			],
			/nunca se venderían/
		],
		[[{ id: 'g', price: 1, after: 'nada' }], /no existe/],
		[[{ id: 'g', price: 1, after: 'g' }], /sí mismo/],
		[
			[
				{ id: 'a', price: 1, after: 'b' },
				{ id: 'b', price: 1, after: 'a' }
			],
			/círculo/
		]
	])('rechaza configuraciones que venderían mal (%#)', (tickets, message) => {
		expect(() => parse(tickets)).toThrow(message);
	});
});

describe('reserveOrder con tramo (sentencia atómica)', () => {
	const TYPE = { id: 'general', price: 8000, capacity: 20 };
	const P1 = { id: 'p1', quantity: 3, until: null };
	/** @param {number} quantity @param {Record<string, any>} [o] */
	const reserve = (quantity, o = {}) =>
		reserveOrder(t.db, {
			eventSlug: 'preventa',
			type: { ...TYPE, tier: P1 },
			quantity,
			holders: people(quantity),
			buyer: { name: 'P', email: `r${++n}@example.com`, dni: '30000000' },
			method: 'transferencia',
			limits: BIG,
			...o
		});

	it('guarda el tramo y el precio del tramo', async () => {
		const r = await reserve(2);
		expect(r.ok).toBe(true);
		expect(r.ok && r.order).toMatchObject({ ticket_tier: 'p1', unit_price: 8000, total: 16000 });
		expect(await tierTaken(t.db, { eventSlug: 'preventa', typeId: 'general', tierId: 'p1' })).toBe(
			2
		);
	});

	it('borde: entra justo hasta la cantidad del tramo, y ni una más (reason: tier)', async () => {
		await preload('preventa', 'general', 'p1', 2);
		expect((await reserve(2)).ok).toBe(false);
		expect(await reserve(2)).toEqual({ ok: false, reason: 'tier' });
		expect((await reserve(1)).ok).toBe(true);
		expect(await reserve(1)).toEqual({ ok: false, reason: 'tier' });
	});

	it('una reserva vencida devuelve su lugar al tramo', async () => {
		const held = await preload('preventa', 'general', 'p1', 3, { approved: false });
		expect(await reserve(1)).toEqual({ ok: false, reason: 'tier' });
		await t.db.prepare('UPDATE orders SET expires_at = 1 WHERE id = ?1').bind(held.id).run();
		expect((await reserve(1)).ok).toBe(true);
	});

	it('un tramo vencido por fecha no reserva, con el mismo "ahora" de la compra', async () => {
		const until = Date.parse('2026-10-09T23:59:00-03:00');
		const tier = { id: 'p1', quantity: null, until };
		expect((await reserve(1, { type: { ...TYPE, tier }, now: until - 1 })).ok).toBe(true);
		expect(await reserve(1, { type: { ...TYPE, tier }, now: until })).toEqual({
			ok: false,
			reason: 'tier'
		});
	});

	it('el cupo del tipo sigue mandando aunque el tramo tenga lugar (soldout)', async () => {
		await preload('preventa', 'general', 'general', 19);
		const r = await reserve(2, {
			type: { ...TYPE, tier: { id: 'p1', quantity: 10, until: null } }
		});
		expect(r).toEqual({ ok: false, reason: 'soldout', available: 1 });
	});

	it('carrera: compras simultáneas nunca pasan el tramo (precargado)', async () => {
		await preload('preventa', 'general', 'p1', 1);
		const results = await Promise.all(Array.from({ length: 8 }, () => reserve(1)));
		expect(results.filter((r) => r.ok)).toHaveLength(2);
		expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === 'tier')).toBe(true);
		expect(await tierTaken(t.db, { eventSlug: 'preventa', typeId: 'general', tierId: 'p1' })).toBe(
			3
		);
	});

	it('carrera: con tramo holgado, tampoco se pasa el cupo (sin sobreventa)', async () => {
		await preload('preventa', 'general', 'general', 17);
		const big = { ...TYPE, tier: { id: 'p2', quantity: 100, until: null } };
		const results = await Promise.all(
			Array.from({ length: 6 }, (_, i) => reserve(1 + (i % 2), { type: big }))
		);
		const sold = results.reduce((s, r) => s + (r.ok ? r.order.quantity : 0), 0);
		expect(sold).toBeLessThanOrEqual(3);
		expect(sold).toBeGreaterThanOrEqual(2);
		expect((await getTaken(t.db, 'preventa')).types.get('general')).toBeLessThanOrEqual(20);
	});
});

describe('compra (?/buy) con preventas', () => {
	it('la página muestra el tramo vigente y su precio; "quedan N a este precio" con pocas', async () => {
		const v = await view('preventa');
		const general = v.types.find((x) => x.id === 'general');
		expect(general).toMatchObject({
			price: 8000,
			tier: { id: 'p1', name: 'Preventa 1' },
			available: 3,
			left: 3,
			tierLeft: true
		});
		expect(summarizeTickets(v).priceFrom).toBe(5000);
	});

	it('compra al precio del tramo vigente y guarda el tramo', async () => {
		const r = await buy('preventa', { tier: 'p1', quantity: '2' });
		expect(r.redirect).toMatch(/\/estado$/);
		expect(await orderOf(r)).toMatchObject({ ticket_tier: 'p1', unit_price: 8000, total: 16000 });
	});

	it('el precio lo elige el servidor: un tramo distinto del vigente no se cobra, avisa', async () => {
		// Mandar el tramo más barato cuando el vigente es otro (o inventado) no sirve.
		await preload('preventa', 'general', 'p1', 3);
		const r = await buy('preventa', { tier: 'p1' });
		expect(r.status).toBe(409);
		expect(r.data.buy.errors.type).toMatch(/El precio cambió.*Preventa 2.*\$\s9\.000/);
		const forged = await buy('preventa', { tier: 'inventado' });
		expect(forged.status).toBe(409);
		const ok = await buy('preventa', { tier: 'p2' });
		expect(await orderOf(ok)).toMatchObject({ ticket_tier: 'p2', unit_price: 9000 });
	});

	it('pedir más de lo que queda en el tramo: compra lo que queda y el resto en otra compra', async () => {
		await preload('preventa', 'general', 'p1', 2);
		const r = await buy('preventa', { tier: 'p1', quantity: '3' });
		expect(r.status).toBe(409);
		expect(r.data.buy.errors.quantity).toBe(tierLeftMessage('Preventa 1', 1));
		expect((await view('preventa')).types[0]).toMatchObject({ available: 1, left: 1 });
	});

	it('mandar `override` en la compra pública no pasa un tramo lleno', async () => {
		await preload('preventa', 'general', 'p1', 3);
		const r = await buy('preventa', { tier: 'p1', override: 'tier:general:p1:4/3' });
		expect(r.status).toBe(409);
		expect(await tierTaken(t.db, { eventSlug: 'preventa', typeId: 'general', tierId: 'p1' })).toBe(
			3
		);
	});

	it('por fecha: antes de la fecha, la anticipada; después, el precio general', async () => {
		const v = await view('por-fecha');
		expect(v.types.find((x) => x.id === 'general')).toMatchObject({
			price: 7000,
			tier: { id: 'early' },
			left: null
		});
		expect(v.types.find((x) => x.id === 'vieja')).toMatchObject({
			price: 10000,
			tier: { id: 'full' }
		});
		const r = await buy('por-fecha', { type: 'vieja', tier: 'early' });
		expect(r.status).toBe(409);
		expect(
			(await orderOf(await buy('por-fecha', { type: 'vieja', tier: 'full' }))).unit_price
		).toBe(10000);
	});
});

describe('tipos encadenados', () => {
	it('no se puede comprar hasta que se agote el anterior', async () => {
		const v = await view('preventa');
		expect(v.types.find((x) => x.id === 'ultima')).toMatchObject({
			available: 0,
			waitingFor: 'General'
		});
		const r = await buy('preventa', { type: 'ultima' });
		expect(r.status).toBe(409);
		expect(r.data.buy.errors.type).toMatch(/todavía no está a la venta.*General/);
	});

	it('se habilita cuando el anterior se agota (cupo completo entre todos sus tramos)', async () => {
		await preload('preventa', 'general', 'p1', 3);
		await preload('preventa', 'general', 'p2', 3);
		await preload('preventa', 'general', 'general', 14);
		const v = await view('preventa');
		expect(v.types.find((x) => x.id === 'general')?.available).toBe(0);
		expect(v.types.find((x) => x.id === 'ultima')).toMatchObject({
			available: 5,
			waitingFor: null
		});
		const r = await buy('preventa', { type: 'ultima' });
		expect((await orderOf(r)).unit_price).toBe(12000);
	});

	it('la carga a mano de un encadenado que no se habilitó pide pasar ese límite', async () => {
		const config = /** @type {import('./config.js').EventTickets} */ (
			await getEventTickets('preventa')
		);
		const ultima = /** @type {import('./config.js').TicketType} */ (config.types[1]);
		const limits = await manualOrderLimits(t.db, {
			eventSlug: 'preventa',
			config,
			type: ultima,
			quantity: 1
		});
		expect(limits).toEqual([
			{ kind: 'not_active', type: 'ultima', typeName: 'Última tanda', afterName: 'General' }
		]);
		expect(checkOverride(limits, '').ok).toBe(false);
		expect(checkOverride(limits, 'not_active:ultima').ok).toBe(true);
	});
});

describe('cupo opcional y "quedan"', () => {
	it('sin cupo: nunca se agota y no muestra números', async () => {
		await preload('preventa', 'libre', null, 500);
		expect((await view('preventa')).types.find((x) => x.id === 'libre')).toMatchObject({
			available: 20,
			left: null
		});
		expect((await buy('preventa', { type: 'libre', quantity: '5' })).redirect).toBeTruthy();
	});

	it('umbral: con 10 o más disponibles no dice nada; con 9, "quedan 9"', async () => {
		await preload('preventa', 'general', 'p1', 3);
		await preload('preventa', 'general', 'p2', 3);
		// Tramo "General" sin cantidad: manda el cupo (20 − 6 = 14 → nada).
		expect((await view('preventa')).types[0]).toMatchObject({
			left: null,
			tier: { id: 'general' }
		});
		await preload('preventa', 'general', 'general', 4);
		expect((await view('preventa')).types[0]).toMatchObject({ left: null, available: 10 });
		await preload('preventa', 'general', 'general', 1);
		expect((await view('preventa')).types[0]).toMatchObject({ left: 9, tierLeft: false });
	});
});

describe('panel: transferencia vencida con el tramo lleno', () => {
	it('pide pasar el tramo, confirma con la clave y queda en el registro', async () => {
		const order = await preload('preventa', 'general', 'p1', 1, { approved: false });
		await t.db.prepare('UPDATE orders SET expires_at = 1 WHERE id = ?1').bind(order.id).run();
		await preload('preventa', 'general', 'p1', 3);
		const config = /** @type {import('./config.js').EventTickets} */ (
			await getEventTickets('preventa')
		);
		const type = /** @type {import('./config.js').TicketType} */ (config.types[0]);
		const limits = await transferLimits(t.db, { order: { ...order, expires_at: 1 }, type });
		expect(limits).toEqual([
			expect.objectContaining({
				kind: 'tier',
				tier: 'p1',
				quantity: 3,
				before: 3,
				after: 4,
				over: 1
			})
		]);
		// Sin pasar el límite, la sentencia no confirma.
		const plain = await confirmTransfer(t.db, {
			orderId: order.id,
			eventSlug: 'preventa',
			capacity: 20,
			tierQuantity: 3,
			by: 'admin-de-prueba'
		});
		expect(plain.result).toBe('no-capacity');

		const first = await confirmTransferFromPanel({
			db: t.db,
			locals: ADMIN,
			by: 'admin-de-prueba',
			orderId: order.id
		});
		expect(first.ok).toBe(false);
		expect(first.needsConfirmation?.limits[0].message).toMatch(
			/tramo «Preventa 1» de «General» ya está completo/
		);
		const done = await confirmTransferFromPanel({
			db: t.db,
			locals: ADMIN,
			by: 'admin-de-prueba',
			orderId: order.id,
			override: first.needsConfirmation?.key
		});
		expect(done.ok).toBe(true);
		expect((await getOrder(t.db, order.id))?.status).toBe('approved');
		const audit = await listAudit(t.db);
		expect(audit.find((e) => e.action === 'tickets.override')?.summary).toBe(
			'Pasó límites de entradas (confirmación de transferencia): tramo «Preventa 1» de «General» +1 (4 / 3)'
		);
	});

	it('logOverride sin sesión de admin anota igual, pero `requireAdmin` corta antes (solo admins)', async () => {
		const { actions } =
			await import('../../../routes/(authed)/admin/entradas/transferencias/+page.server.js');
		const order = await preload('preventa', 'general', 'p1', 1, { approved: false });
		const body = new FormData();
		body.set('order', order.id);
		body.set('override', 'tier:general:p1:4/3');
		/** @param {any} locals */
		const call = (locals) =>
			actions.confirm(
				/** @type {any} */ ({
					locals,
					url: new URL('http://localhost/admin/entradas/transferencias'),
					platform: t.platform,
					request: new Request('http://localhost/x', { method: 'POST', body }),
					fetch: noFetch
				})
			);
		await expect(call({})).rejects.toMatchObject({ status: 303 });
		await expect(
			call({ user: { id: 999999, login: 'no-admin' }, user_token: 'x' })
		).rejects.toMatchObject({
			status: 403
		});
		expect((await getOrder(t.db, order.id))?.status).toBe('awaiting_transfer');
		expect(await listAudit(t.db)).toEqual([]);
		// Y logOverride con límites deja la fila (lo usa cada acción del panel después de requireAdmin).
		expect(
			await logOverride(t.db, ADMIN, {
				event: 'preventa',
				what: 'carga a mano',
				limits: [
					{ kind: 'not_active', type: 'ultima', typeName: 'Última tanda', afterName: 'General' }
				]
			})
		).toBe(true);
		expect((await listAudit(t.db))[0].summary).toBe(
			'Pasó límites de entradas (carga a mano): «Última tanda» antes de habilitarse'
		);
	});
});

describe('entradas en la puerta: interruptor por evento', () => {
	it('"Solo anticipadas": la página lo dice y la puerta no vende sin pasar el límite', async () => {
		expect((await view('solo-anticipadas')).door).toEqual({ on: false, explicit: true, price: '' });
		const config = /** @type {import('./config.js').EventTickets} */ (
			await getEventTickets('solo-anticipadas')
		);
		const type = config.types[0];
		const input = {
			eventSlug: 'solo-anticipadas',
			door: config.door,
			type,
			quantity: 1,
			holders: people(1),
			buyer: { name: 'En la puerta' },
			method: /** @type {const} */ ('efectivo'),
			by: 'admin-de-prueba'
		};
		expect(await sellAtDoor(t.db, input)).toEqual({ ok: false, reason: 'no-door' });
		const limits = await doorSaleLimits(t.db, {
			eventSlug: 'solo-anticipadas',
			config,
			type,
			quantity: 1
		});
		expect(limits).toEqual([{ kind: 'no_door' }]);
		expect((await sellAtDoor(t.db, { ...input, override: true })).ok).toBe(true);
	});

	it('"Hay entradas en la puerta" (o sin elegir): vende sin pedir nada; no gasta tramos', async () => {
		const config = /** @type {import('./config.js').EventTickets} */ (
			await getEventTickets('preventa')
		);
		const type = /** @type {import('./config.js').TicketType} */ (config.types[0]);
		expect(
			await doorSaleLimits(t.db, { eventSlug: 'preventa', config, type, quantity: 2 })
		).toEqual([]);
		const r = await sellAtDoor(t.db, {
			eventSlug: 'preventa',
			door: config.door,
			type,
			quantity: 2,
			holders: people(2),
			buyer: { name: 'En la puerta' },
			method: 'efectivo',
			by: 'admin-de-prueba'
		});
		// Precio pleno (el del último tramo) y sin tramo: la preventa sigue intacta.
		expect(r.ok && r.order).toMatchObject({ unit_price: 10000, ticket_tier: null });
		expect((await view('preventa')).types[0]).toMatchObject({ tier: { id: 'p1' }, available: 3 });
	});
});
