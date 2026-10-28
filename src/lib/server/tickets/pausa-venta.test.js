/**
 * Pausas de emergencia en la venta (docs/interruptores.md, «Pausas de emergencia»):
 * - con `TICKETS_PAUSED`, la página de compra y la del evento muestran el texto y `?/buy` no crea
 *   ninguna orden (Mercado Pago, transferencia ni gratis);
 * - lo que ya está en curso sigue: un pago de una orden ya creada se aprueba, la puerta vende (con
 *   y sin conexión), la carga a mano anda, los reembolsos y salir de la lista de espera también;
 * - con `MAILS_PAUSED`, los mails de cada compra (entradas, transferencia, reembolso, el camino de
 *   los códigos para ingresar) salen igual.
 * D1 de miniflare; eventos, personas y pagos inventados. Lo que se le manda a Resend se captura.
 */
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	onTestFinished,
	vi
} from 'vitest';

const envVars = vi.hoisted(() => /** @type {Record<string, string>} */ ({}));

vi.mock('$env/dynamic/private', () => ({ env: envVars }));

// Los avisos a admins por Telegram y el empujón de la lista se prueban en otro lado.
vi.mock('$lib/server/telegram/adminNotify.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	queueOrderNotice: async () => {}
}));
vi.mock('$lib/server/tickets/waitlistEngine.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	queueWaitlistAdvance: () => Promise.resolve('done')
}));
vi.mock('$lib/server/flags.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	listaEsperaEnabled: async () => true,
	isFlagOn: async (/** @type {any} */ _db, /** @type {string} */ key) => key === 'lista_espera'
}));

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('./config.js');
	const common = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['mercadopago', 'transferencia'],
		tickets: [{ id: 'general', name: 'General', price: 1000, capacity: 50 }]
	};
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		'fiesta-de-prueba': { ...common, lista_espera: 'evento' },
		'gratis-de-prueba': {
			...common,
			tickets: [{ id: 'general', name: 'General', price: 0, capacity: 50 }]
		},
		'cancelado-de-prueba': { ...common, status: 'cancelado' }
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug] ? parseTicketConfig(metas[slug], opts) : null,
		getEventInfo: async () => ({ title: 'Evento de prueba', start: null, tags: [] }),
		getEventMeta: async (/** @type {string} */ slug) => metas[slug] ?? null,
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { eventTicketActions } from '$lib/server/admin/eventActions.js';
import { sha256Hex } from '$lib/server/hash.js';
import { buyAction, getTicketsView, summarizeTickets } from './checkout.js';
import { applyQueuedSales, sellAtDoor } from './door.js';
import { deliverEmail, processPayment } from './index.js';
import { createManualOrder } from './manual.js';
import { getOrder, getOrderTickets, reserveOrder } from './orders.js';
import { offerToken } from './waitlistEngine.js';
import { waitlistLeaveUrl } from './waitlistMail.js';
import { DEFAULT_TICKETS_PAUSED_MESSAGE } from '$lib/server/emergencia.js';
import * as salir from '../../../routes/(content)/lista-de-espera/salir/[token]/+page.server.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const SLUG = 'fiesta-de-prueba';
const PAUSE = 'Volvemos en un rato';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
let n = 0;

/** Lo que se le mandaría a Resend (asuntos), y el fetch que lo captura. */
let subjects = /** @type {string[]} */ ([]);
const resendFetch = /** @type {any} */ (
	async (/** @type {any} */ url, /** @type {any} */ init) => {
		if (String(url).startsWith('https://api.resend.com/')) {
			subjects.push(JSON.parse(init.body).subject);
			return new Response('{"id":"inventado"}', { status: 200 });
		}
		return new Response('{}', { status: 503 });
	}
);

beforeEach(async () => {
	await resetDB(t.db);
	subjects = [];
	for (const k of Object.keys(envVars)) delete envVars[k];
	// Mercado Pago «configurado» (nunca se llama: la pausa corta antes) y Resend de mentira.
	Object.assign(envVars, {
		MP_ACCESS_TOKEN: 'TEST-token-inventado',
		RESEND_API_KEY: 're_inventada'
	});
	// Datos para transferir inventados (así se ofrece la transferencia).
	await t.db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
			VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
		)
		.run();
	for (const level of /** @type {const} */ (['log', 'warn', 'error'])) {
		const spy = vi.spyOn(console, level).mockImplementation(() => {});
		onTestFinished(() => spy.mockRestore());
	}
});

/** Tareas en segundo plano de un pedido (`ctx.waitUntil`), para esperarlas. */
let background = /** @type {Promise<unknown>[]} */ ([]);
/**
 * Todas las de la prueba en curso. Cada prueba las espera al terminar: si no, un mail que sale
 * tarde (con la máquina cargada) cae en `subjects` de la prueba siguiente, que ve un mail de más.
 */
let unfinished = /** @type {Promise<unknown>[]} */ ([]);
afterEach(async () => {
	const pending = unfinished;
	unfinished = [];
	await Promise.allSettled(pending);
});

/**
 * Un pedido como lo hace SvelteKit (form action).
 * @param {Record<string, string>} fields
 * @param {{ params?: Record<string, string>, locals?: any, path?: string }} [o]
 */
function event(fields, { params = { slug: SLUG, event: SLUG }, locals = admin, path = '/x' } = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	background = [];
	return /** @type {any} */ ({
		params,
		platform: {
			...t.platform,
			ctx: {
				waitUntil: (/** @type {any} */ p) => {
					unfinished.push(p);
					background.push(p);
				}
			}
		},
		locals,
		request: new Request(`http://localhost${path}`, { method: 'POST', body }),
		url: new URL(`http://localhost${path}`),
		fetch: resendFetch,
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => '203.0.113.9',
		setHeaders: () => {}
	});
}

/**
 * `?/buy` de la página de compra (una redirección vuelve como `{ redirect }`).
 * @param {string} slug
 * @param {Record<string, string>} [fields]
 */
async function buy(slug, fields = {}) {
	const all = {
		type: 'general',
		quantity: '1',
		name: 'Persona Prueba',
		pronouns: 'elle',
		email: `compra${++n}@example.com`,
		dni: '30111222',
		method: 'transferencia',
		option: 'sin',
		accept: 'on',
		holder_name_0: 'Persona Prueba',
		holder_pronouns_0: 'elle',
		...fields
	};
	try {
		return /** @type {any} */ (
			await buyAction(event(all, { params: { event: slug }, locals: {}, path: '/entradas' }))
		);
	} catch (e) {
		const r = /** @type {any} */ (e);
		if (r?.status === 303) return { redirect: r.location };
		throw e;
	}
}

/** @param {string} table */
const count = async (table) =>
	Number((await t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n ?? 0);

/**
 * Una orden de este evento, creada antes de la pausa.
 * @param {'transferencia' | 'mercadopago'} method
 */
async function order(method) {
	const r = await reserveOrder(t.db, {
		eventSlug: SLUG,
		type: { id: 'general', price: 1000, capacity: null },
		quantity: 1,
		holders: [{ name: 'Persona', pronouns: 'elle' }],
		buyer: { name: 'Persona Prueba', email: `orden${++n}@example.com`, dni: '30000000' },
		method,
		limits: { perEmailQuantity: 100, perEmailOrders: 100, perClientQuantity: 100 }
	});
	if (!r.ok) throw new Error(JSON.stringify(r));
	return r.order;
}

/** @param {any} o @param {string} status @param {number} id */
const payment = (o, status, id) => ({
	id,
	status,
	external_reference: o.id,
	transaction_amount: o.total,
	currency_id: 'ARS'
});

const GENERAL = {
	id: 'general',
	name: 'General',
	price: 1000,
	fondo: 0,
	capacity: 50,
	gorra: null
};

describe('TICKETS_PAUSED: lo que ve el público', () => {
	it('sin la variable se puede comprar; con ella, el texto en lugar de los botones', async () => {
		const open = await getTicketsView(t.db, SLUG, resendFetch);
		expect(open).toMatchObject({ open: true, reason: null });

		envVars.TICKETS_PAUSED = PAUSE;
		const view = await getTicketsView(t.db, SLUG, resendFetch);
		expect(view).toMatchObject({ open: false, reason: 'paused', pausedMessage: PAUSE });
		// Los tipos y precios se siguen viendo (sin botón).
		expect(view?.types[0]).toMatchObject({ id: 'general', price: 1000 });
		// La página del evento (el resumen del botón «Comprar entradas»).
		expect(summarizeTickets(/** @type {any} */ (view))).toMatchObject({
			open: false,
			reason: 'paused',
			pausedMessage: PAUSE
		});
	});

	it('con 1, el texto por defecto; con 0, como siempre', async () => {
		envVars.TICKETS_PAUSED = '1';
		expect(await getTicketsView(t.db, SLUG, resendFetch)).toMatchObject({
			reason: 'paused',
			pausedMessage: DEFAULT_TICKETS_PAUSED_MESSAGE
		});
		envVars.TICKETS_PAUSED = '0';
		expect(await getTicketsView(t.db, SLUG, resendFetch)).toMatchObject({ open: true });
	});

	it('un evento cancelado sigue diciendo que se canceló', async () => {
		envVars.TICKETS_PAUSED = PAUSE;
		const view = await getTicketsView(t.db, 'cancelado-de-prueba', resendFetch);
		expect(view).toMatchObject({ open: false, reason: 'cancelled' });
		expect(view?.pausedMessage).toBeUndefined();
	});
});

describe('TICKETS_PAUSED: ?/buy no crea ninguna orden', () => {
	it('sin la variable, la reserva por transferencia anda (control)', async () => {
		const r = await buy(SLUG);
		expect(r.redirect).toMatch(/\/estado$/);
		expect(await count('orders')).toBe(1);
	});

	it.each([
		['transferencia', SLUG],
		['mercadopago', SLUG],
		['transferencia', 'gratis-de-prueba']
	])('%s en %s: 503 con el texto, sin orden, sin entradas, sin mails', async (method, slug) => {
		envVars.TICKETS_PAUSED = PAUSE;
		const r = await buy(slug, { method });
		expect(r.status).toBe(503);
		expect(r.data.buy.error).toBe(PAUSE);
		// Lo que se había escrito vuelve al formulario.
		expect(r.data.buy.values.name).toBe('Persona Prueba');
		expect(await count('orders')).toBe(0);
		expect(await count('tickets')).toBe(0);
		await Promise.all(background);
		expect(subjects).toEqual([]);
	});

	it('el link de una oferta de la lista de espera tampoco compra', async () => {
		envVars.TICKETS_PAUSED = PAUSE;
		const r = await buy(SLUG, { lista: 'token-inventado' });
		expect(r.status).toBe(503);
		expect(await count('orders')).toBe(0);
	});
});

describe('TICKETS_PAUSED: lo que sigue andando', () => {
	beforeEach(() => {
		envVars.TICKETS_PAUSED = PAUSE;
	});

	it('un pago de una orden creada antes de la pausa se aprueba y manda las entradas', async () => {
		delete envVars.TICKETS_PAUSED;
		const o = await order('mercadopago');
		envVars.TICKETS_PAUSED = PAUSE;
		await processPayment({
			db: t.db,
			payment: payment(o, 'approved', 9001),
			origin: 'https://kinkyvibe.ar',
			fetch: resendFetch
		});
		expect((await getOrder(t.db, o.id))?.status).toBe('approved');
		expect(await getOrderTickets(t.db, o.id)).toHaveLength(1);
		expect(subjects).toHaveLength(1);
	});

	it('la puerta vende', async () => {
		const r = await sellAtDoor(t.db, {
			eventSlug: SLUG,
			type: GENERAL,
			quantity: 1,
			holders: [{ name: 'Persona Puerta', pronouns: '' }],
			buyer: { name: 'Persona Puerta', email: '' },
			method: 'efectivo',
			by: 'admin-de-prueba'
		});
		expect(r.ok).toBe(true);
	});

	it('la puerta sincroniza las ventas sin conexión', async () => {
		const now = Date.now();
		const res = await applyQueuedSales(t.db, /** @type {any} */ (admin), {
			eventSlug: SLUG,
			config: /** @type {any} */ ({ types: [GENERAL], door: { on: true }, status: '' }),
			by: 'admin-de-prueba',
			items: [
				{
					id: 'venta-pausa-0001',
					at: now - 60_000,
					fields: {
						type: 'general',
						quantity: '1',
						method: 'efectivo',
						name: 'Persona Inventada',
						email: ''
					}
				}
			],
			now
		});
		expect(res[0]).toMatchObject({ result: 'ok' });
		expect(await count('orders')).toBe(1);
	});

	it('la carga a mano desde el panel anda', async () => {
		const r = await createManualOrder(t.db, {
			eventSlug: SLUG,
			type: /** @type {any} */ (GENERAL),
			quantity: 1,
			holders: [{ name: 'Persona Cortesía', pronouns: '' }],
			buyer: { name: 'Persona Cortesía', email: '' },
			method: 'cortesia',
			amount: 0,
			by: 'admin-de-prueba'
		});
		expect(r.ok).toBe(true);
	});

	it('el reembolso desde el panel anda (y manda su mail)', async () => {
		delete envVars.TICKETS_PAUSED;
		const o = await order('transferencia');
		envVars.TICKETS_PAUSED = PAUSE;
		await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(o.id).run();
		const r = /** @type {any} */ (await eventTicketActions.refund(event({ order: o.id })));
		expect(r.refund?.ok).toBe(true);
		expect((await getOrder(t.db, o.id))?.status).toBe('refunded');
	});

	it('salir de la lista de espera anda', async () => {
		const id = crypto.randomUUID();
		await t.db
			.prepare(
				`INSERT INTO waitlist_entries (id, event_slug, email, status, confirmed_at,
					offer_token_hash, offer_count, offered_at, hold_until, created_at, updated_at)
				VALUES (?1, ?2, 'fila@example.com', 'offered', 1, ?3, 1, ?4, ?5, 1, 1)`
			)
			.bind(
				id,
				SLUG,
				await sha256Hex(await offerToken(t.db, id, 1)),
				Date.now(),
				Date.now() + 60 * 60 * 1000
			)
			.run();
		const url = await waitlistLeaveUrl(t.db, 'http://localhost', id);
		const token = url.split('/').pop() ?? '';
		expect(await salir.actions.default(event({}, { params: { token } }))).toMatchObject({
			ok: true,
			left: true
		});
	});
});

describe('MAILS_PAUSED: los mails de cada compra salen igual', () => {
	beforeEach(() => {
		envVars.MAILS_PAUSED = '1';
	});

	it('las entradas al aprobarse un pago', async () => {
		const o = await order('mercadopago');
		await processPayment({
			db: t.db,
			payment: payment(o, 'approved', 9101),
			origin: 'https://kinkyvibe.ar',
			fetch: resendFetch
		});
		expect((await getOrder(t.db, o.id))?.email_sent_at).toBeTruthy();
		expect(subjects).toHaveLength(1);
	});

	it('los datos para transferir al reservar', async () => {
		const r = await buy(SLUG);
		expect(r.redirect).toMatch(/\/estado$/);
		await Promise.all(background);
		expect(subjects).toHaveLength(1);
	});

	it('el aviso de reembolso', async () => {
		const o = await order('transferencia');
		await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(o.id).run();
		const r = /** @type {any} */ (await eventTicketActions.refund(event({ order: o.id })));
		expect(r.refund?.ok).toBe(true);
		await Promise.all(background);
		expect(subjects).toHaveLength(1);
	});

	it('el camino de los códigos para ingresar y las confirmaciones (deliverEmail)', async () => {
		const result = await deliverEmail({
			db: t.db,
			fetch: resendFetch,
			to: 'persona@example.com',
			message: { subject: 'Tu código para ingresar', html: '<p>123456</p>', text: '123456' }
		});
		expect(result).toBe('sent');
		expect(subjects).toEqual(['Tu código para ingresar']);
	});
});
