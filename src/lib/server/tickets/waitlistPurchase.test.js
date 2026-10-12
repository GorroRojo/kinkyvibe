/**
 * La lista de espera en la compra (waitlistPurchase.js, `reserveOrder` con `waitlist`,
 * `getTicketsView` y `buyAction` con `lista`): el público compra lo que sobra después de la fila,
 * quien tiene un lugar guardado compra con su link, una reserva vencida deja de guardar en el
 * acto, nada se sobrevende ni se usa dos veces un link, y la puerta, la carga a mano y la
 * confirmación de transferencias no miran la lista. D1 de miniflare; eventos y personas
 * inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const flag = vi.hoisted(() => ({ on: true }));

vi.mock('$lib/server/flags.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	listaEsperaEnabled: async () => flag.on
}));

vi.mock('./events.js', async () => {
	const { parseTicketConfig } = await import('./config.js');
	const common = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['transferencia']
	};
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		// Por evento: 3 generales + 2 VIP = 5 lugares en total.
		'lista-evento': {
			...common,
			lista_espera: 'evento',
			tickets: [
				{ id: 'general', name: 'General', price: 10000, capacity: 3 },
				{ id: 'vip', name: 'VIP', price: 20000, capacity: 2 }
			]
		},
		// Igual, sin lista.
		'sin-lista': {
			...common,
			tickets: [
				{ id: 'general', name: 'General', price: 10000, capacity: 3 },
				{ id: 'vip', name: 'VIP', price: 20000, capacity: 2 }
			]
		},
		// Por tipo: «General» con cupo tiene su lista; «Libre» no tiene cupo (nunca se agota).
		'lista-tipo': {
			...common,
			lista_espera: { alcance: 'tipo' },
			tickets: [
				{ id: 'general', name: 'General', price: 10000, capacity: 2 },
				{ id: 'libre', name: 'Libre', price: 5000 }
			]
		},
		// Por evento con preventa.
		'lista-tramos': {
			...common,
			lista_espera: 'evento',
			tickets: [
				{
					id: 'general',
					name: 'General',
					capacity: 4,
					tiers: [
						{ id: 'p1', name: 'Preventa 1', price: 8000, quantity: 3 },
						{ id: 'general', name: 'General', price: 10000 }
					]
				}
			]
		},
		// Para la carrera de 30 compras.
		'lista-carrera': {
			...common,
			lista_espera: 'evento',
			tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 10 }]
		},
		// Por evento con un tipo sin cupo: el evento nunca se agota.
		'lista-sin-tope': {
			...common,
			lista_espera: 'evento',
			tickets: [
				{ id: 'general', name: 'General', price: 10000, capacity: 1 },
				{ id: 'libre', name: 'Libre', price: 5000 }
			]
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
import { sha256Hex } from '$lib/server/hash.js';
import { buyAction, getTicketsView } from './checkout.js';
import { typeAvailability } from './config.js';
import { sellAtDoor } from './door.js';
import { getEventTickets } from './events.js';
import { createManualOrder } from './manual.js';
import { confirmTransfer, getOrder, getTaken, newToken, reserveOrder } from './orders.js';
import {
	WAITLIST_BUY_MESSAGES,
	findOffer,
	queueHolders,
	sharesAfterQueue,
	waitlistGuard,
	waitlistShareMessage
} from './waitlistPurchase.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const NOW = Date.parse('2026-10-11T12:00:00Z');
const H = 60 * 60 * 1000;
const BIG = { perEmailQuantity: 1000, perEmailOrders: 1000, perClientQuantity: 1000 };
const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));

beforeEach(async () => {
	await resetDB(t.db);
	flag.on = true;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	// Datos para transferir inventados (así se ofrece la transferencia).
	await t.db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
			VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
		)
		.run();
});
afterEach(() => {
	vi.useRealTimers();
});

let n = 0;
/** @param {number} q */
const people = (q) =>
	Array.from({ length: q }, (_, i) => ({ name: `Persona ${i + 1}`, pronouns: 'elle' }));

/** @param {string} slug */
async function configOf(slug) {
	const c = await getEventTickets(slug);
	if (!c) throw new Error(`sin configuración: ${slug}`);
	return c;
}

/**
 * Una anotación en la lista, ya en su estado (el motor que ofrece es de otra parte: acá a mano).
 * @param {string} slug
 * @param {{ type?: string | null, status?: 'waiting' | 'offered', holdUntil?: number | null }} [o]
 */
async function entry(slug, { type = null, status = 'waiting', holdUntil = NOW + 2 * H } = {}) {
	const id = crypto.randomUUID();
	const token = newToken();
	const offered = status === 'offered';
	await t.db
		.prepare(
			`INSERT INTO waitlist_entries (id, event_slug, ticket_type, email, status, confirmed_at,
				offer_token_hash, offer_count, offered_at, hold_until, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?6, ?6)`
		)
		.bind(
			id,
			slug,
			type,
			`fila${++n}@example.com`,
			status,
			NOW - H,
			offered ? await sha256Hex(token) : null,
			offered ? 1 : 0,
			offered ? NOW - H : null,
			offered ? holdUntil : null
		)
		.run();
	return { id, token };
}

/** @param {string} id */
async function entryRow(id) {
	return /** @type {Record<string, any>} */ (
		await t.db.prepare('SELECT * FROM waitlist_entries WHERE id = ?1').bind(id).first()
	);
}

/**
 * Lugares tomados (una orden aprobada).
 * @param {string} slug @param {string} typeId @param {number} quantity
 */
async function sell(slug, typeId, quantity) {
	const r = await reserveOrder(t.db, {
		eventSlug: slug,
		type: { id: typeId, price: 1000, capacity: null },
		quantity,
		holders: people(quantity),
		buyer: { name: 'Venta previa', email: `previa${++n}@example.com`, dni: '30000000' },
		method: 'transferencia',
		limits: BIG,
		now: NOW
	});
	if (!r.ok) throw new Error(`venta previa: ${JSON.stringify(r)}`);
	await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(r.order.id).run();
	return r.order;
}

/**
 * Una compra online como la arma `buyAction`: con el control de la fila (`waitlistGuard`) si
 * `guarded`, el tipo efectivo del tramo vigente y su precio.
 *
 * @param {string} slug
 * @param {string} typeId
 * @param {number} quantity
 * @param {{ entryId?: string | null, guarded?: boolean, now?: number }} [o]
 */
async function buyOnline(
	slug,
	typeId,
	quantity,
	{ entryId = null, guarded = true, now = NOW } = {}
) {
	const config = await configOf(slug);
	const type = /** @type {import('./config.js').TicketType} */ (
		config.types.find((x) => x.id === typeId)
	);
	const taken = await getTaken(t.db, slug, now);
	const a = typeAvailability(config, type, taken, now);
	const eff = a.tier ? { ...type, price: a.tier.tier.price, tier: a.tier.tier } : type;
	return reserveOrder(t.db, {
		eventSlug: slug,
		type: eff,
		quantity,
		holders: people(quantity),
		buyer: { name: 'Persona Prueba', email: `compra${++n}@example.com`, dni: '30111222' },
		method: 'transferencia',
		limits: BIG,
		waitlist: guarded ? waitlistGuard(config, type, taken, now, entryId) : null,
		now
	});
}

/** @param {string} slug */
async function takenTotal(slug) {
	const row = await t.db
		.prepare(
			`SELECT COALESCE(SUM(quantity), 0) AS n FROM orders WHERE event_slug = ?1
			AND status IN ('approved', 'awaiting_transfer', 'pending')`
		)
		.bind(slug)
		.first();
	return Number(row?.n ?? 0);
}

describe('sharesAfterQueue y waitlistGuard (reglas puras)', () => {
	it('por evento: la fila se resta del lugar libre total, no de cada tipo', async () => {
		const config = await configOf('lista-evento');
		const taken = { types: new Map([['general', 3]]), tiers: new Map() };
		const av = (/** @type {any} */ type) => typeAvailability(config, type, taken, NOW);
		// Libre: 0 general + 2 VIP. Con una persona esperando, sobra 1 VIP.
		expect([...sharesAfterQueue(config, av, new Map([['', 1]]))]).toEqual([['vip', 1]]);
		expect([...sharesAfterQueue(config, av, new Map([['', 2]]))]).toEqual([['vip', 0]]);
		expect([...sharesAfterQueue(config, av, new Map())]).toEqual([['vip', 2]]);
		expect(waitlistGuard(config, config.types[1], taken, NOW)).toEqual({
			scope: '',
			caps: { vip: 2 },
			entryId: null
		});
		// El tipo agotado no está a la venta: la fila no le cambia nada (lo frena el cupo).
		expect(waitlistGuard(config, config.types[0], taken, NOW)).toBeNull();
	});

	it('por evento con un tipo sin cupo a la venta: el evento no se agota y la fila no guarda nada', async () => {
		const config = await configOf('lista-sin-tope');
		const taken = { types: new Map(), tiers: new Map() };
		const av = (/** @type {any} */ type) => typeAvailability(config, type, taken, NOW);
		expect(sharesAfterQueue(config, av, new Map([['', 5]])).size).toBe(0);
		expect(waitlistGuard(config, config.types[0], taken, NOW)).toBeNull();
	});

	it('por tipo: solo los tipos con cupo, cada uno con su fila', async () => {
		const config = await configOf('lista-tipo');
		const taken = { types: new Map([['general', 1]]), tiers: new Map() };
		const av = (/** @type {any} */ type) => typeAvailability(config, type, taken, NOW);
		expect([...sharesAfterQueue(config, av, new Map([['general', 1]]))]).toEqual([['general', 0]]);
		expect(waitlistGuard(config, config.types[0], taken, NOW, 'x')).toEqual({
			scope: 'general',
			caps: { general: 2 },
			entryId: 'x'
		});
		expect(waitlistGuard(config, config.types[1], taken, NOW)).toBeNull();
	});

	it('sin lista: nada', async () => {
		const config = await configOf('sin-lista');
		const taken = { types: new Map(), tiers: new Map() };
		expect(sharesAfterQueue(config, () => ({ state: 'open', remaining: 1 }), new Map()).size).toBe(
			0
		);
		expect(waitlistGuard(config, config.types[0], taken, NOW)).toBeNull();
	});
});

describe('reserveOrder con la fila', () => {
	it('el público no compra mientras la fila ocupa todo lo libre', async () => {
		await sell('lista-evento', 'general', 3);
		await sell('lista-evento', 'vip', 1);
		await entry('lista-evento');
		expect(await buyOnline('lista-evento', 'vip', 1)).toEqual({
			ok: false,
			reason: 'waitlist',
			available: 0
		});
		// Sin nadie en la fila, la misma compra entra.
		await t.db.prepare('DELETE FROM waitlist_entries').run();
		expect((await buyOnline('lista-evento', 'vip', 1)).ok).toBe(true);
	});

	it('por evento con varios tipos: la fila cuenta contra el lugar libre TOTAL', async () => {
		await sell('lista-evento', 'general', 3);
		await entry('lista-evento');
		// Quedan 2 VIP y una persona espera: el público compra 1, no 2.
		expect(await buyOnline('lista-evento', 'vip', 2)).toEqual({
			ok: false,
			reason: 'waitlist',
			available: 1
		});
		expect((await buyOnline('lista-evento', 'vip', 1)).ok).toBe(true);
		expect(await buyOnline('lista-evento', 'vip', 1)).toMatchObject({ reason: 'waitlist' });
	});

	it('con lugar de sobra, el público compra lo que sobra después de la fila', async () => {
		await entry('lista-evento');
		await entry('lista-evento');
		expect((await buyOnline('lista-evento', 'general', 3)).ok).toBe(true);
		expect(await buyOnline('lista-evento', 'vip', 1)).toMatchObject({ reason: 'waitlist' });
	});

	it('quien tiene el lugar guardado puede comprar todo lo libre (menos lo guardado para otras)', async () => {
		await sell('lista-evento', 'general', 1);
		const holder = await entry('lista-evento', { status: 'offered' });
		await entry('lista-evento');
		await entry('lista-evento');
		// Libre: 2 general + 2 VIP. Las que esperan no le guardan nada a quien tiene la oferta.
		const r = await buyOnline('lista-evento', 'general', 2, { entryId: holder.id });
		expect(r.ok).toBe(true);
		const row = await entryRow(holder.id);
		expect(row).toMatchObject({ status: 'purchased', order_id: r.ok ? r.order.id : null });
		const r2 = await buyOnline('lista-evento', 'vip', 2, { entryId: holder.id });
		// El link ya se usó.
		expect(r2).toEqual({ ok: false, reason: 'offer' });
	});

	it('con otra persona con lugar guardado vigente, se le guarda ese lugar', async () => {
		await sell('lista-evento', 'general', 3);
		const holder = await entry('lista-evento', { status: 'offered' });
		await entry('lista-evento', { status: 'offered' });
		expect(await buyOnline('lista-evento', 'vip', 2, { entryId: holder.id })).toEqual({
			ok: false,
			reason: 'waitlist',
			available: 1
		});
		expect((await buyOnline('lista-evento', 'vip', 1, { entryId: holder.id })).ok).toBe(true);
	});

	it('con preventa: quien tiene el lugar guardado compra al precio del tramo vigente', async () => {
		await sell('lista-tramos', 'general', 1);
		const holder = await entry('lista-tramos', { status: 'offered' });
		await entry('lista-tramos');
		await entry('lista-tramos');
		// Libre: 3 (de 4). Público: 3 − 3 de la fila = 0.
		expect(await buyOnline('lista-tramos', 'general', 1)).toMatchObject({ reason: 'waitlist' });
		const r = await buyOnline('lista-tramos', 'general', 2, { entryId: holder.id });
		expect(r.ok && r.order).toMatchObject({ unit_price: 8000, ticket_tier: 'p1', quantity: 2 });
	});

	it('una reserva vencida deja de guardar lugar en el acto (sin cron), y el aviso a todes no guarda', async () => {
		await sell('lista-evento', 'general', 3);
		await sell('lista-evento', 'vip', 1);
		const old = await entry('lista-evento', { status: 'offered', holdUntil: NOW + H });
		expect(await buyOnline('lista-evento', 'vip', 1)).toMatchObject({ reason: 'waitlist' });
		// Una hora después, sin que nadie toque la fila, la reserva ya no cuenta.
		const later = NOW + H;
		expect((await buyOnline('lista-evento', 'vip', 1, { now: later })).ok).toBe(true);
		// Y su link ya no vale.
		expect(
			await findOffer(t.db, { token: old.token, eventSlug: 'lista-evento', now: later })
		).toEqual({ state: 'invalid' });
		await resetDB(t.db);
		await sell('lista-evento', 'general', 3);
		await sell('lista-evento', 'vip', 1);
		await entry('lista-evento', { status: 'offered', holdUntil: null });
		expect((await buyOnline('lista-evento', 'vip', 1)).ok).toBe(true);
	});

	it('con la oferta vencida, la compra con su link no entra (aunque haya lugar)', async () => {
		const old = await entry('lista-evento', { status: 'offered', holdUntil: NOW + H });
		expect(
			await buyOnline('lista-evento', 'general', 1, { entryId: old.id, now: NOW + H })
		).toEqual({ ok: false, reason: 'offer' });
		expect(await takenTotal('lista-evento')).toBe(0);
		expect((await entryRow(old.id)).status).toBe('offered');
	});

	it('por tipo: la fila de un tipo no frena a otro', async () => {
		await sell('lista-tipo', 'general', 1);
		await entry('lista-tipo', { type: 'general' });
		expect(await buyOnline('lista-tipo', 'general', 1)).toMatchObject({ reason: 'waitlist' });
		expect((await buyOnline('lista-tipo', 'libre', 3)).ok).toBe(true);
	});

	it('por tipo: un link de otro tipo no sirve', async () => {
		const other = await entry('lista-tipo', { type: 'otro', status: 'offered' });
		const config = await configOf('lista-tipo');
		const taken = await getTaken(t.db, 'lista-tipo', NOW);
		const r = await reserveOrder(t.db, {
			eventSlug: 'lista-tipo',
			type: config.types[0],
			quantity: 1,
			holders: people(1),
			buyer: { name: 'Persona Prueba', email: 'otro-tipo@example.com', dni: '30111222' },
			method: 'transferencia',
			limits: BIG,
			waitlist: waitlistGuard(config, config.types[0], taken, NOW, other.id),
			now: NOW
		});
		expect(r).toEqual({ ok: false, reason: 'offer' });
		expect((await entryRow(other.id)).status).toBe('offered');
	});

	it('30 compras a la vez con quien tiene el lugar: no se sobrevende ni se usa dos veces el link', async () => {
		const slug = 'lista-carrera';
		await sell(slug, 'general', 5);
		const holder = await entry(slug, { status: 'offered' });
		await entry(slug);
		await entry(slug);
		// Libre: 5. La fila guarda 3 (1 oferta + 2 esperando): el público puede comprar 2.
		const attempts = Array.from({ length: 30 }, (_, i) =>
			i === 7 || i === 21
				? buyOnline(slug, 'general', 1, { entryId: holder.id }).then((r) => ({ holder: true, r }))
				: buyOnline(slug, 'general', 1).then((r) => ({ holder: false, r }))
		);
		const results = await Promise.all(attempts);
		const holderOk = results.filter((x) => x.holder && x.r.ok);
		const publicOk = results.filter((x) => !x.holder && x.r.ok);
		expect(holderOk).toHaveLength(1);
		expect(publicOk).toHaveLength(2);
		expect(results.filter((x) => x.holder && !x.r.ok).map((x) => x.r)).toEqual([
			{ ok: false, reason: 'offer' }
		]);
		for (const x of results.filter((y) => !y.holder && !y.r.ok))
			expect(x.r).toMatchObject({ ok: false, reason: 'waitlist' });
		// 5 + 1 + 2 = 8 de 10: quedan los 2 lugares de las personas que esperan.
		expect(await takenTotal(slug)).toBe(8);
		const row = await entryRow(holder.id);
		const okOrder = /** @type {any} */ (holderOk[0].r).order;
		expect(row).toMatchObject({ status: 'purchased', order_id: okOrder.id });
	});
});

describe('con el interruptor apagado (o sin lista), la venta es la de siempre', () => {
	it('reserveOrder sin `waitlist`: la misma sentencia de siempre y la compra entra', async () => {
		await sell('lista-evento', 'general', 3);
		await sell('lista-evento', 'vip', 1);
		await entry('lista-evento');
		const prepare = vi.spyOn(t.db, 'prepare');
		try {
			const r = await buyOnline('lista-evento', 'vip', 1, { guarded: false });
			expect(r.ok).toBe(true);
			const sqls = prepare.mock.calls.map((c) => String(c[0]));
			expect(sqls.some((s) => s.includes('INSERT INTO orders'))).toBe(true);
			expect(sqls.some((s) => s.includes('waitlist_entries'))).toBe(false);
		} finally {
			prepare.mockRestore();
		}
	});

	it('buyAction y getTicketsView no miran la fila', async () => {
		flag.on = false;
		await sell('lista-evento', 'general', 3);
		await sell('lista-evento', 'vip', 1);
		await entry('lista-evento');
		const v = await getTicketsView(t.db, 'lista-evento', noFetch, { waitlist: false });
		expect(v?.open).toBe(true);
		expect(v?.types.find((x) => x.id === 'vip')?.available).toBe(1);
		const prepare = vi.spyOn(t.db, 'prepare');
		try {
			const r = await buy('lista-evento', { type: 'vip', lista: 'cualquier-cosa' });
			expect(r.redirect).toMatch(/^\/entradas\/[0-9a-f-]+\/estado$/);
			expect(prepare.mock.calls.some((c) => String(c[0]).includes('waitlist_entries'))).toBe(false);
		} finally {
			prepare.mockRestore();
		}
	});
});

describe('la puerta, la carga a mano y la confirmación de transferencias no miran la lista', () => {
	it('venden aunque la fila ocupe todo lo libre', async () => {
		await sell('lista-evento', 'general', 2);
		await entry('lista-evento');
		await entry('lista-evento', { status: 'offered' });
		await entry('lista-evento');
		const config = await configOf('lista-evento');
		const general = config.types[0];
		// Una transferencia con la reserva vencida: se confirma si hay cupo (la fila no cuenta).
		const late = await reserveOrder(t.db, {
			eventSlug: 'lista-evento',
			type: general,
			quantity: 1,
			holders: people(1),
			buyer: { name: 'Transferencia', email: 'tarde@example.com', dni: '30000000' },
			method: 'transferencia',
			holdMs: 1000,
			limits: BIG,
			now: NOW - H
		});
		expect(late.ok).toBe(true);
		expect(await buyOnline('lista-evento', 'vip', 1)).toMatchObject({ reason: 'waitlist' });
		const door = await sellAtDoor(t.db, {
			eventSlug: 'lista-evento',
			door: config.door,
			type: config.types[1],
			quantity: 1,
			holders: people(1),
			buyer: { name: 'En la puerta' },
			method: 'efectivo',
			by: 'admin-de-prueba',
			now: NOW
		});
		expect(door.ok).toBe(true);
		const manual = await createManualOrder(t.db, {
			eventSlug: 'lista-evento',
			type: config.types[1],
			quantity: 1,
			holders: people(1),
			buyer: { name: 'Cortesía', email: '' },
			method: 'cortesia',
			amount: 0,
			by: 'admin-de-prueba',
			now: NOW
		});
		expect(manual.ok).toBe(true);
		const confirmed = await confirmTransfer(t.db, {
			orderId: late.ok ? late.order.id : '',
			eventSlug: 'lista-evento',
			capacity: 3,
			by: 'admin-de-prueba',
			now: NOW
		});
		expect(confirmed.result).toBe('confirmed');
		expect(await takenTotal('lista-evento')).toBe(5);
	});
});

describe('getTicketsView con la fila', () => {
	it('el público ve lo que sobra después de la fila; quien tiene la oferta ve todo lo libre', async () => {
		await sell('lista-evento', 'general', 2);
		const holder = await entry('lista-evento', { status: 'offered' });
		await entry('lista-evento');
		// Libre: 1 general + 2 VIP = 3; la fila guarda 2.
		const pub = await getTicketsView(t.db, 'lista-evento', noFetch, { waitlist: true });
		expect(pub?.types.map((x) => [x.id, x.available])).toEqual([
			['general', 1],
			['vip', 1]
		]);
		expect(pub?.open).toBe(true);
		const mine = await getTicketsView(t.db, 'lista-evento', noFetch, {
			waitlist: true,
			offerId: holder.id
		});
		expect(mine?.types.map((x) => [x.id, x.available])).toEqual([
			['general', 1],
			['vip', 2]
		]);
		await entry('lista-evento');
		const full = await getTicketsView(t.db, 'lista-evento', noFetch, { waitlist: true });
		expect(full).toMatchObject({ open: false, reason: 'soldout' });
	});

	it('queueHolders: público (esperan + reservas vigentes) y con oferta (solo otras reservas)', async () => {
		const mine = await entry('lista-evento', { status: 'offered' });
		await entry('lista-evento', { status: 'offered' });
		await entry('lista-evento', { status: 'offered', holdUntil: NOW });
		await entry('lista-evento', { status: 'offered', holdUntil: null });
		await entry('lista-evento');
		expect([...(await queueHolders(t.db, 'lista-evento', NOW))]).toEqual([['', 3]]);
		expect([...(await queueHolders(t.db, 'lista-evento', NOW, mine.id))]).toEqual([['', 1]]);
	});
});

describe('findOffer', () => {
	it('vigente, usada, vencida, de otro evento o rota', async () => {
		const ok = await entry('lista-evento', { status: 'offered' });
		expect(await findOffer(t.db, { token: ok.token, eventSlug: 'lista-evento', now: NOW })).toEqual(
			{ state: 'valid', id: ok.id, ticketType: null, holdUntil: NOW + 2 * H }
		);
		expect(
			await findOffer(t.db, { token: ok.token, eventSlug: 'lista-evento', now: NOW + 2 * H })
		).toEqual({ state: 'invalid' });
		expect(await findOffer(t.db, { token: ok.token, eventSlug: 'sin-lista', now: NOW })).toEqual({
			state: 'invalid'
		});
		expect(await findOffer(t.db, { token: 'corto', eventSlug: 'lista-evento', now: NOW })).toEqual({
			state: 'invalid'
		});
		expect(
			await findOffer(t.db, { token: newToken(), eventSlug: 'lista-evento', now: NOW })
		).toEqual({ state: 'invalid' });
		expect((await buyOnline('lista-evento', 'general', 1, { entryId: ok.id })).ok).toBe(true);
		expect(await findOffer(t.db, { token: ok.token, eventSlug: 'lista-evento', now: NOW })).toEqual(
			{ state: 'used' }
		);
	});
});

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

describe('buyAction con la lista de espera', () => {
	it('el público frenado por la fila ve por qué (y cuántas puede comprar)', async () => {
		await sell('lista-evento', 'general', 3);
		await entry('lista-evento');
		const blocked = await buy('lista-evento', { type: 'vip', quantity: '2' });
		expect(blocked.status).toBe(409);
		expect(blocked.data.buy.error).toBe(waitlistShareMessage(1));
		await buy('lista-evento', { type: 'vip' });
		const none = await buy('lista-evento', { type: 'vip' });
		expect(none.data.buy.error).toBe(WAITLIST_BUY_MESSAGES.blocked);
	});

	it('con el link de su oferta compra (aunque el público no pueda) y el link queda usado', async () => {
		await sell('lista-evento', 'general', 3);
		const holder = await entry('lista-evento', { status: 'offered' });
		await entry('lista-evento');
		const r = await buy('lista-evento', { type: 'vip', lista: holder.token });
		expect(r.redirect).toMatch(/^\/entradas\/[0-9a-f-]+\/estado$/);
		const orderId = String(r.redirect).split('/')[2];
		expect((await getOrder(t.db, orderId))?.ticket_type).toBe('vip');
		expect(await entryRow(holder.id)).toMatchObject({ status: 'purchased', order_id: orderId });
		const again = await buy('lista-evento', { type: 'vip', lista: holder.token });
		expect(again.status).toBe(409);
		expect(again.data.buy.error).toBe(WAITLIST_BUY_MESSAGES.offerGone);
		// El formulario vuelve sin el link (la próxima vez compra como el resto).
		expect(again.data.buy.values.lista).toBe('');
	});

	it('un link vencido o inventado no compra', async () => {
		const old = await entry('lista-evento', { status: 'offered', holdUntil: NOW - 1 });
		for (const lista of [old.token, newToken(), 'x']) {
			const r = await buy('lista-evento', { lista });
			expect(r.status).toBe(409);
			expect(r.data.buy.error).toBe(WAITLIST_BUY_MESSAGES.offerGone);
		}
		expect(await takenTotal('lista-evento')).toBe(0);
	});

	it('por tipo: el link es para su tipo', async () => {
		const holder = await entry('lista-tipo', { type: 'general', status: 'offered' });
		const r = await buy('lista-tipo', { type: 'libre', lista: holder.token });
		expect(r.status).toBe(409);
		expect(r.data.buy.error).toBe(
			'Tu lugar guardado es para «General»: elegí ese tipo de entrada.'
		);
		expect((await entryRow(holder.id)).status).toBe('offered');
	});

	it('si justo se vendió en la puerta, se lo dice y la oferta sigue', async () => {
		await sell('lista-evento', 'general', 3);
		await sell('lista-evento', 'vip', 2);
		const holder = await entry('lista-evento', { status: 'offered' });
		const r = await buy('lista-evento', { type: 'vip', lista: holder.token });
		expect(r.status).toBe(409);
		expect(r.data.buy.error).toBe(WAITLIST_BUY_MESSAGES.soldAtDoor);
		expect((await entryRow(holder.id)).status).toBe('offered');
	});
});
