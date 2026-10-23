/**
 * Cada lugar donde se libera un lugar empuja la lista de espera (`queueWaitlistAdvance`,
 * docs/tickets.md, «Lista de espera», y la tabla de la sección 3 del plan): reembolso y
 * cancelación de transferencia desde el panel del evento, cancelación desde la bandeja de
 * transferencias, reembolso / contracargo / pago cancelado de Mercado Pago, la preferencia de MP
 * que falla, y los links de los mails (salir con un lugar guardado, confirmar, volver a
 * anotarse). La carga de la página de compra y el guardado del editor, que necesitan media app
 * para correr, se controlan mirando el código. D1 de miniflare; eventos y personas inventados.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const nudges = vi.hoisted(() => ({ calls: /** @type {any[]} */ ([]) }));
const envVars = vi.hoisted(() => /** @type {Record<string, string>} */ ({}));

vi.mock('$lib/server/tickets/waitlistEngine.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	queueWaitlistAdvance: (/** @type {any} */ input) => {
		nudges.calls.push(input);
		return Promise.resolve('done');
	}
}));

vi.mock('$env/dynamic/private', () => ({ env: envVars }));

vi.mock('$lib/server/flags.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	listaEsperaEnabled: async () => true,
	isFlagOn: async () => true
}));

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('./config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['mercadopago', 'transferencia'],
		lista_espera: 'evento',
		tickets: [{ id: 'general', name: 'General', price: 1000, capacity: 5 }]
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			slug === 'fiesta-de-prueba' ? parseTicketConfig(meta, opts) : null,
		getEventInfo: async () => ({ title: 'Evento de prueba', start: null, tags: [] }),
		getEventMeta: async () => meta,
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { eventTicketActions } from '$lib/server/admin/eventActions.js';
import { cancelTransferFromPanel } from '$lib/server/admin/transfers.js';
import { buyAction } from './checkout.js';
import { processPayment } from './index.js';
import { applyPayment, getOrder, reserveOrder } from './orders.js';
import { endWaitlistEntry, joinWaitlist } from './waitlist.js';
import { offerToken } from './waitlistEngine.js';
import { waitlistLeaveUrl, waitlistRejoinUrl } from './waitlistMail.js';
import { sha256Hex } from '$lib/server/hash.js';
import * as salir from '../../../routes/(content)/lista-de-espera/salir/[token]/+page.server.js';
import * as confirmar from '../../../routes/(content)/lista-de-espera/confirmar/[token]/+page.server.js';
import * as volver from '../../../routes/(content)/lista-de-espera/volver/[token]/+page.server.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

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
	nudges.calls.length = 0;
	for (const k of Object.keys(envVars)) delete envVars[k];
});

const SLUG = 'fiesta-de-prueba';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));
let n = 0;

/**
 * Un pedido como lo hace SvelteKit (form action o load).
 * @param {Record<string, string>} fields
 * @param {{ params?: Record<string, string>, locals?: any, path?: string }} [o]
 */
function event(fields, { params = { slug: SLUG, event: SLUG }, locals = admin, path = '/x' } = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return /** @type {any} */ ({
		params,
		platform: t.platform,
		locals,
		request: new Request(`http://localhost${path}`, { method: 'POST', body }),
		url: new URL(`http://localhost${path}`),
		fetch: noFetch,
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => '203.0.113.9',
		setHeaders: () => {}
	});
}

/**
 * Una orden de este evento.
 * @param {'transferencia' | 'mercadopago'} method
 */
async function order(method) {
	const r = await reserveOrder(t.db, {
		eventSlug: SLUG,
		type: { id: 'general', price: 1000, capacity: null },
		quantity: 1,
		holders: [{ name: 'Persona', pronouns: 'elle' }],
		buyer: { name: 'Persona Prueba', email: `compra${++n}@example.com`, dni: '30000000' },
		method,
		limits: { perEmailQuantity: 100, perEmailOrders: 100, perClientQuantity: 100 }
	});
	if (!r.ok) throw new Error(JSON.stringify(r));
	return r.order;
}

/** Que el último empujón haya sido para este evento. */
function expectNudged() {
	expect(nudges.calls).toHaveLength(1);
	expect(nudges.calls[0]).toMatchObject({ eventSlug: SLUG });
	expect(nudges.calls[0].db ?? nudges.calls[0].platform).toBeTruthy();
}

describe('panel del evento', () => {
	it('reembolso de una orden aprobada', async () => {
		const o = await order('transferencia');
		await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(o.id).run();
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = /** @type {any} */ (await eventTicketActions.refund(event({ order: o.id })));
		log.mockRestore();
		err.mockRestore();
		expect(r.refund?.ok).toBe(true);
		expectNudged();
	});

	it('cancelar una transferencia', async () => {
		const o = await order('transferencia');
		const r = /** @type {any} */ (await eventTicketActions.cancel(event({ order: o.id })));
		expect(r.transfer?.ok).toBe(true);
		expectNudged();
	});

	it('si no se pudo cancelar, no empuja', async () => {
		const r = /** @type {any} */ (
			await eventTicketActions.cancel(event({ order: crypto.randomUUID() }))
		);
		expect(r.status).toBe(409);
		expect(nudges.calls).toHaveLength(0);
	});
});

describe('bandeja de transferencias', () => {
	it('cancelar desde la bandeja', async () => {
		const o = await order('transferencia');
		const r = await cancelTransferFromPanel({
			db: t.db,
			locals: /** @type {any} */ (admin),
			by: admin.user.login,
			orderId: o.id,
			platform: t.platform
		});
		expect(r.ok).toBe(true);
		expectNudged();
	});
});

describe('Mercado Pago', () => {
	/** @param {any} o @param {string} status @param {number} id */
	const payment = (o, status, id) => ({
		id,
		status,
		external_reference: o.id,
		transaction_amount: o.total,
		currency_id: 'ARS'
	});

	it('pago cancelado', async () => {
		const o = await order('mercadopago');
		await processPayment({
			db: t.db,
			payment: payment(o, 'cancelled', 7001),
			origin: 'https://kinkyvibe.ar',
			fetch: noFetch
		});
		expectNudged();
	});

	it('reembolso o contracargo desde MP', async () => {
		const o = await order('mercadopago');
		await applyPayment(t.db, payment(o, 'approved', 7002));
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		await processPayment({
			db: t.db,
			payment: payment(o, 'refunded', 7002),
			origin: 'https://kinkyvibe.ar',
			fetch: noFetch
		});
		err.mockRestore();
		log.mockRestore();
		expectNudged();
	});

	/**
	 * Un fetch que captura lo que se le mandaría a Resend (no sale nada).
	 * @returns {{ fetch: any, subjects: string[] }}
	 */
	function resendSpy() {
		/** @type {string[]} */
		const subjects = [];
		const fetch = async (/** @type {any} */ url, /** @type {any} */ init) => {
			if (String(url).startsWith('https://api.resend.com/')) {
				subjects.push(JSON.parse(init.body).subject);
				return new Response('{"id":"inventado"}', { status: 200 });
			}
			return new Response('{}', { status: 503 });
		};
		return { fetch, subjects };
	}

	it('reembolso desde el panel de MP: queda reembolsada y se manda el mail', async () => {
		envVars.RESEND_API_KEY = 're_inventada';
		const o = await order('mercadopago');
		await applyPayment(t.db, payment(o, 'approved', 7004));
		const { fetch, subjects } = resendSpy();
		await processPayment({
			db: t.db,
			payment: payment(o, 'refunded', 7004),
			origin: 'https://kinkyvibe.ar',
			fetch
		});
		expect((await getOrder(t.db, o.id))?.status).toBe('refunded');
		expectNudged();
		expect(subjects).toHaveLength(1);
		expect(subjects[0]).toMatch(/reembols/i);
	});

	it('contracargo: queda reembolsada y empuja la lista, pero no se manda el mail de reembolso', async () => {
		envVars.RESEND_API_KEY = 're_inventada';
		const o = await order('mercadopago');
		await applyPayment(t.db, payment(o, 'approved', 7005));
		const { fetch, subjects } = resendSpy();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await processPayment({
			db: t.db,
			payment: payment(o, 'charged_back', 7005),
			origin: 'https://kinkyvibe.ar',
			fetch
		});
		const warnings = warn.mock.calls.map((c) => String(c[0]));
		warn.mockRestore();
		expect((await getOrder(t.db, o.id))?.status).toBe('refunded');
		expectNudged();
		expect(subjects).toHaveLength(0);
		// El aviso en el log nombra la orden y el pago, sin datos de quien compró.
		const chargeback = warnings.find((w) => w.includes('contracargo'));
		expect(chargeback).toContain(o.id);
		expect(chargeback).toContain('7005');
		expect(chargeback).not.toContain('@');
	});

	it('un pago aprobado no empuja', async () => {
		const o = await order('mercadopago');
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		await processPayment({
			db: t.db,
			payment: payment(o, 'approved', 7003),
			origin: 'https://kinkyvibe.ar',
			fetch: noFetch
		});
		err.mockRestore();
		log.mockRestore();
		expect(nudges.calls).toHaveLength(0);
	});

	it('la preferencia de MP falla: se cancela la orden y se empuja la lista', async () => {
		envVars.MP_ACCESS_TOKEN = 'TEST-token-inventado';
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = await buyAction(
			event(
				{
					type: 'general',
					quantity: '1',
					name: 'Persona Prueba',
					pronouns: 'elle',
					email: 'compra-mp@example.com',
					dni: '30111222',
					method: 'mercadopago',
					accept: 'on',
					holder_name_0: 'Persona 1',
					holder_pronouns_0: 'elle'
				},
				{ path: `/calendario/${SLUG}/entradas` }
			)
		);
		err.mockRestore();
		expect(r?.status).toBe(502);
		expectNudged();
	});
});

describe('links de los mails', () => {
	it('salir con un lugar guardado empuja; salir estando en la fila, no', async () => {
		/** @param {'waiting' | 'offered'} status */
		const entry = async (status) => {
			const id = crypto.randomUUID();
			const offered = status === 'offered';
			await t.db
				.prepare(
					`INSERT INTO waitlist_entries (id, event_slug, email, status, confirmed_at,
						offer_token_hash, offer_count, offered_at, hold_until, created_at, updated_at)
					VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, 1, 1)`
				)
				.bind(
					id,
					SLUG,
					`fila${++n}@example.com`,
					status,
					offered ? await sha256Hex(await offerToken(t.db, id, 1)) : null,
					offered ? 1 : 0,
					offered ? Date.now() : null,
					offered ? Date.now() + 60 * 60 * 1000 : null
				)
				.run();
			return id;
		};
		/** @param {string} id */
		const leave = async (id) => {
			const url = await waitlistLeaveUrl(t.db, 'http://localhost', id);
			const token = url.split('/').pop() ?? '';
			return salir.actions.default(event({}, { params: { token } }));
		};
		const holder = await entry('offered');
		const plain = await entry('waiting');
		expect(await leave(plain)).toMatchObject({ ok: true, left: true });
		expect(nudges.calls).toHaveLength(0);
		expect(await leave(holder)).toMatchObject({ ok: true, left: true });
		expectNudged();
	});

	it('confirmar el mail empuja', async () => {
		const r = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, email: 'persona@example.com' })
		);
		const out = await confirmar.actions.default(event({}, { params: { token: r.token } }));
		expect(out).toMatchObject({ ok: true });
		expectNudged();
	});

	it('volver a anotarse empuja', async () => {
		const id = crypto.randomUUID();
		const now = Date.now();
		await t.db
			.prepare(
				`INSERT INTO waitlist_entries (id, event_slug, email, status, confirmed_at,
					offer_token_hash, offer_count, offered_at, hold_until, created_at, updated_at)
				VALUES (?1, ?2, 'vuelve@example.com', 'offered', ?3, ?4, 1, ?3, ?5, ?3, ?3)`
			)
			.bind(id, SLUG, now - 3000, 'b'.repeat(64), now - 1000)
			.run();
		expect(await endWaitlistEntry(t.db, id, { reason: 'hold_expired', now })).not.toBeNull();
		// La lista solo deja anotarse con el evento agotado (5 lugares tomados).
		for (let i = 0; i < 5; i++) {
			const o = await order('transferencia');
			await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(o.id).run();
		}
		const url = await waitlistRejoinUrl(t.db, 'http://localhost', id);
		const token = url.split('/').pop() ?? '';
		expect(await volver.actions.default(event({}, { params: { token } }))).toMatchObject({
			ok: true,
			status: 'waiting'
		});
		expectNudged();
	});
});

describe('lugares que se controlan mirando el código', () => {
	/** @param {string} path */
	const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

	it('la página de compra empuja al cargar, con el interruptor prendido', () => {
		const code = source('../../../routes/(content)/calendario/[event]/entradas/+page.server.js');
		const load = code.slice(code.indexOf('export async function load'));
		expect(load).toMatch(
			/if \(waitlistOn\)\s+queueWaitlistAdvance\(\{[^}]*eventSlug: params\.event/
		);
	});

	it('el editor del evento empuja después de guardar', () => {
		const code = source('../../../routes/(authed)/admin/eventos/[slug]/editar/+page.server.js');
		const save = code.slice(code.indexOf('async function saveWithDateChange'));
		const saved = save.indexOf('await _editActions.save(');
		const nudge = save.indexOf('queueWaitlistAdvance(');
		expect(saved).toBeGreaterThan(-1);
		expect(nudge).toBeGreaterThan(saved);
		expect(save.slice(nudge, nudge + 200)).toContain('eventSlug: event.params.slug');
	});
});
