/**
 * Reintento del mail con las entradas (unsentOrders.js): una orden aprobada cuyo mail falló se
 * vuelve a mandar desde el cron una sola vez y con la misma clave de idempotencia; fuera de la
 * ventana (muy nueva o de más de 48 h) no se toca; una orden gratis a una dirección con «No fui
 * yo» no sale ni se vuelve a tomar. Lo que se le manda a Resend se captura (no sale nada). D1 de
 * miniflare; evento y personas inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { optOutUrl, OPT_OUT_PATH, suppressByToken } from '$lib/server/email/suppressions.js';
import { createDiscountCode } from './discounts.js';
import { approveFreeOrder, applyPayment, getOrder, reserveOrder } from './orders.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-11-14T22:00:00-03:00',
		end: '2099-11-15T03:00:00-03:00',
		status: 'abierto',
		location: 'Calle Falsa 123',
		location_name: 'Lugar Inventado',
		payment_methods: ['mercadopago'],
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async () => meta,
		getEventTickets: async (/** @type {string} */ _slug, /** @type {any} */ opts) =>
			parseTicketConfig(meta, opts),
		listTicketedEvents: async () => [{ slug: 'evento-de-prueba', config: parseTicketConfig(meta) }]
	};
});
vi.mock('$env/dynamic/private', () => ({ env: { RESEND_API_KEY: 're_inventada' } }));

const { sendOrderEmail } = await import('./index.js');
const { RETRY_ATTEMPTS, resendUnsentOrderEmails } = await import('./unsentOrders.js');

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
	for (const level of /** @type {const} */ (['log', 'warn', 'error'])) {
		const spy = vi.spyOn(console, level).mockImplementation(() => {});
		onTestFinished(() => spy.mockRestore());
	}
});

const ORIGIN = 'https://kinkyvibe.example';
const SLUG = 'evento-de-prueba';
const MIN = 60 * 1000;
const H = 60 * MIN;
const NOW = Date.parse('2099-11-10T12:00:00-03:00');

/**
 * Una orden paga, aprobada en `approvedAt`.
 *
 * @param {number} approvedAt
 * @param {string} [email]
 */
async function paidOrder(approvedAt, email = 'persona@example.com') {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: SLUG,
			type: { id: 'general', price: 10000, capacity: 50 },
			quantity: 1,
			holders: [{ name: 'Persona Demo', pronouns: 'elle' }],
			buyer: { name: 'Persona Demo', pronouns: 'elle', email, dni: '30111222' },
			now: approvedAt - MIN
		})
	);
	const paid = await applyPayment(
		t.db,
		{
			id: approvedAt,
			status: 'approved',
			external_reference: r.order.id,
			transaction_amount: 10000,
			currency_id: 'ARS'
		},
		{ now: approvedAt }
	);
	return /** @type {import('./orders.js').Order} */ (paid.order);
}

/**
 * Una orden gratis (código del 100 %), aprobada en `approvedAt`.
 *
 * @param {number} approvedAt
 * @param {string} email
 */
async function freeOrder(approvedAt, email) {
	const discount = { code: 'GRATIS', kind: /** @type {const} */ ('percent'), value: 100 };
	await createDiscountCode(
		t.db,
		{ ...discount, event_slug: null, starts_at: null, ends_at: null, max_uses: null },
		{ by: 'admin-prueba', now: approvedAt - H }
	);
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: SLUG,
			type: { id: 'general', price: 10000, capacity: 50 },
			quantity: 1,
			method: 'gratis',
			discount,
			holders: [{ name: 'Persona Gratis', pronouns: 'elle' }],
			buyer: { name: 'Persona Gratis', pronouns: 'elle', email, dni: '30111333' },
			now: approvedAt - MIN
		})
	);
	expect(r).toMatchObject({ ok: true });
	const approved = await approveFreeOrder(t.db, r.order, { now: approvedAt });
	return /** @type {import('./orders.js').Order} */ (approved.order);
}

/**
 * Un fetch falso para Resend: guarda cada POST (con sus headers) y contesta `status`.
 *
 * @param {number} [status]
 */
function resend(status = 200) {
	/** @type {{ headers: Record<string, string>, body: any }[]} */
	const posts = [];
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			posts.push({
				headers: /** @type {Record<string, string>} */ (init.headers),
				body: JSON.parse(String(init.body))
			});
			return new Response(status === 200 ? '{"id":"x"}' : '{"message":"caído"}', { status });
		}
	);
	return { posts, fetch };
}

describe('resendUnsentOrderEmails', () => {
	it('el primer envío falla y el reintento sale una sola vez, con la misma clave', async () => {
		const order = await paidOrder(NOW - 30 * MIN);
		const down = resend(500);
		expect(await sendOrderEmail({ db: t.db, order, origin: ORIGIN, fetch: down.fetch })).toBe(
			false
		);
		expect(down.posts).toHaveLength(1);
		expect((await getOrder(t.db, order.id))?.email_sent_at).toBeNull();

		const up = resend();
		const r = await resendUnsentOrderEmails({
			db: t.db,
			origin: ORIGIN,
			fetch: up.fetch,
			now: NOW
		});
		expect(r).toEqual({ sent: 1, failed: 0, skipped: 0 });
		expect(up.posts).toHaveLength(1);
		expect(up.posts[0].headers['Idempotency-Key']).toBe(`tickets-${order.id}`);
		expect(up.posts[0].headers['Idempotency-Key']).toBe(down.posts[0].headers['Idempotency-Key']);
		expect(up.posts[0].body.to).toEqual(['persona@example.com']);
		expect((await getOrder(t.db, order.id))?.email_sent_at).toEqual(expect.any(Number));

		// La corrida siguiente ya no la toma.
		const again = await resendUnsentOrderEmails({
			db: t.db,
			origin: ORIGIN,
			fetch: up.fetch,
			now: NOW + 15 * MIN
		});
		expect(again).toEqual({ sent: 0, failed: 0, skipped: 0 });
		expect(up.posts).toHaveLength(1);
	});

	it('no toca órdenes de más de 48 h ni las que están dentro del margen del envío normal', async () => {
		const old = await paidOrder(NOW - 49 * H, 'vieja@example.com');
		const fresh = await paidOrder(NOW - 5 * MIN, 'nueva@example.com');
		const up = resend();
		const r = await resendUnsentOrderEmails({
			db: t.db,
			origin: ORIGIN,
			fetch: up.fetch,
			now: NOW
		});
		expect(r).toEqual({ sent: 0, failed: 0, skipped: 0 });
		expect(up.posts).toHaveLength(0);
		expect((await getOrder(t.db, old.id))?.email_sent_at).toBeNull();
		expect((await getOrder(t.db, fresh.id))?.email_sent_at).toBeNull();
	});

	it('una orden gratis a una dirección con «No fui yo» no sale y no se vuelve a tomar', async () => {
		const email = 'no-fui-yo@example.com';
		const url = String(await optOutUrl(t.db, ORIGIN, email));
		expect(await suppressByToken(t.db, url.slice(`${ORIGIN}${OPT_OUT_PATH}`.length), NOW)).toBe(
			true
		);
		const order = await freeOrder(NOW - 30 * MIN, email);
		const up = resend();
		const first = await resendUnsentOrderEmails({
			db: t.db,
			origin: ORIGIN,
			fetch: up.fetch,
			now: NOW
		});
		expect(first).toEqual({ sent: 0, failed: 0, skipped: 1 });
		expect(up.posts).toHaveLength(0);
		// Resuelta (como hacen los envíos en tandas con lo cortado a propósito): no vuelve a salir.
		expect((await getOrder(t.db, order.id))?.email_sent_at).toBe(NOW);
		for (let i = 1; i <= 3; i++) {
			const next = await resendUnsentOrderEmails({
				db: t.db,
				origin: ORIGIN,
				fetch: up.fetch,
				now: NOW + i * 15 * MIN
			});
			expect(next).toEqual({ sent: 0, failed: 0, skipped: 0 });
		}
		expect(up.posts).toHaveLength(0);
	});

	it('una orden gratis sin «No fui yo» se reintenta como cualquier otra', async () => {
		const order = await freeOrder(NOW - 30 * MIN, 'gratis@example.com');
		const up = resend();
		const r = await resendUnsentOrderEmails({
			db: t.db,
			origin: ORIGIN,
			fetch: up.fetch,
			now: NOW
		});
		expect(r).toEqual({ sent: 1, failed: 0, skipped: 0 });
		expect(up.posts[0].headers['Idempotency-Key']).toBe(`tickets-${order.id}`);
	});

	it('una dirección que falla siempre se intenta como mucho RETRY_ATTEMPTS veces por día y no frena a las demás', async () => {
		const broken = await paidOrder(NOW - 60 * MIN, 'rota@example.com');
		const down = resend(422);
		for (let i = 0; i < RETRY_ATTEMPTS; i++) {
			const r = await resendUnsentOrderEmails({
				db: t.db,
				origin: ORIGIN,
				fetch: down.fetch,
				now: NOW + i * 15 * MIN,
				limit: 1
			});
			expect(r).toEqual({ sent: 0, failed: 1, skipped: 0 });
		}
		expect(down.posts).toHaveLength(RETRY_ATTEMPTS);
		// La siguiente corrida la saltea y manda la de atrás.
		const ok = await paidOrder(NOW - 30 * MIN, 'otra@example.com');
		const up = resend();
		const r = await resendUnsentOrderEmails({
			db: t.db,
			origin: ORIGIN,
			fetch: up.fetch,
			now: NOW + RETRY_ATTEMPTS * 15 * MIN,
			limit: 1
		});
		expect(r).toEqual({ sent: 1, failed: 0, skipped: 1 });
		expect(up.posts.map((p) => p.headers['Idempotency-Key'])).toEqual([`tickets-${ok.id}`]);
		expect((await getOrder(t.db, broken.id))?.email_sent_at).toBeNull();
	});
});

describe('resendUnsentOrderEmails con el cupo de Resend terminado', () => {
	it('no gasta los intentos del día, corta la corrida y deja el aviso para «Para revisar»', async () => {
		const first = await paidOrder(NOW - 60 * MIN, 'primera@example.com');
		await paidOrder(NOW - 30 * MIN, 'segunda@example.com');
		/** @type {string[]} */
		const keys = [];
		const quota = /** @type {any} */ (
			async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
				keys.push(/** @type {Record<string, string>} */ (init.headers)['Idempotency-Key']);
				return new Response('{"statusCode":429,"name":"daily_quota_exceeded","message":"cupo"}', {
					status: 429
				});
			}
		);
		for (let i = 0; i <= RETRY_ATTEMPTS; i++) {
			const r = await resendUnsentOrderEmails({
				db: t.db,
				origin: ORIGIN,
				fetch: quota,
				now: NOW + i * 15 * MIN
			});
			expect(r).toEqual({ sent: 0, failed: 0, skipped: 0, deferred: 1, stopped: 'quota' });
		}
		// Una sola llamada por corrida, siempre a la más vieja: ninguna quedó salteada.
		expect(keys).toEqual(Array(RETRY_ATTEMPTS + 1).fill(`tickets-${first.id}`));
		const note = await t.db
			.prepare("SELECT value FROM ticket_settings WHERE key = 'resend_quota'")
			.first();
		expect(JSON.parse(String(note?.value))).toEqual({
			at: expect.any(Number),
			code: 'daily_quota_exceeded'
		});
		// Se renueva el cupo: salen las dos.
		const up = resend();
		const r = await resendUnsentOrderEmails({
			db: t.db,
			origin: ORIGIN,
			fetch: up.fetch,
			now: NOW + 2 * H
		});
		expect(r).toEqual({ sent: 2, failed: 0, skipped: 0 });
	});
});
