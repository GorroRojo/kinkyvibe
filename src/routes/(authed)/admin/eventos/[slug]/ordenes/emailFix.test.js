/**
 * Órdenes → «Corregir el mail y reenviar» (acción `email` de eventActions.js): solo admins, solo
 * órdenes aprobadas de este evento. Cambia la dirección, manda las entradas a la nueva con una
 * clave de idempotencia propia (nunca a la vieja) y deja registro sin ninguna de las dos
 * direcciones. Si la nueva tocó «No fui yo», no cambia ni manda nada. Lo que se le manda a Resend
 * se captura (no sale nada). D1 de miniflare; evento y personas inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-11-14T22:00:00-03:00',
		status: 'abierto',
		location: 'Calle Falsa 123',
		payment_methods: ['mercadopago'],
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
	};
	return {
		...actual,
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async () => meta,
		getEventTickets: async (/** @type {string} */ _slug, /** @type {any} */ opts) =>
			parseTicketConfig(meta, opts)
	};
});
vi.mock('$env/dynamic/private', () => ({ env: { RESEND_API_KEY: 're_inventada' } }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { suppressionHash } from '$lib/server/email/suppressions.js';
import {
	applyPayment,
	getOrder,
	reserveOrder,
	updateBuyerEmail
} from '$lib/server/tickets/orders.js';
import { actions } from './+page.server.js';

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

const SLUG = 'evento-de-prueba';
const OLD = 'persona@gmai.com';
const NEW = 'persona@gmail.com';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/** Un fetch falso para Resend: guarda cada POST (con sus headers) y contesta `status`. */
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

/**
 * Una orden paga y aprobada (o solo reservada, con `approve: false`).
 *
 * @param {{ slug?: string, email?: string, approve?: boolean }} [o]
 */
async function paidOrder({ slug = SLUG, email = OLD, approve = true } = {}) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: slug,
			type: { id: 'general', price: 10000, capacity: 50 },
			quantity: 1,
			holders: [{ name: 'Persona Demo', pronouns: 'elle' }],
			buyer: { name: 'Persona Demo', pronouns: 'elle', email, dni: '30111222' }
		})
	);
	if (!approve) return r.order;
	const paid = await applyPayment(t.db, {
		id: 123,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 10000,
		currency_id: 'ARS'
	});
	await t.db.prepare('UPDATE orders SET email_sent_at = 1 WHERE id = ?1').bind(r.order.id).run();
	return /** @type {import('$lib/server/tickets/orders.js').Order} */ (paid.order);
}

/**
 * Llama a la acción como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 *
 * @param {Record<string, string>} fields
 * @param {{ locals?: any, fetch?: any }} [o]
 */
async function fix(fields, { locals = admin, fetch = resend().fetch } = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		params: { slug: SLUG },
		platform: t.platform,
		locals,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL(`http://localhost/admin/eventos/${SLUG}/ordenes`),
		fetch
	};
	try {
		return /** @type {any} */ (await actions.email(event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

const emailOf = async (/** @type {string} */ id) => (await getOrder(t.db, id))?.buyer_email;

describe('Corregir el mail y reenviar', () => {
	it('cambia la dirección y manda las entradas solo a la nueva, con una clave nueva', async () => {
		const order = await paidOrder();
		const r = resend();
		const res = await fix({ order: order.id, email: '  Persona@Gmail.com ' }, { fetch: r.fetch });
		expect(res.emailFix).toMatchObject({ ok: true, order: order.id });
		expect(await emailOf(order.id)).toBe(NEW);
		expect(r.posts).toHaveLength(1);
		expect(r.posts[0].body.to).toEqual([NEW]);
		const key = r.posts[0].headers['Idempotency-Key'];
		expect(key).toMatch(new RegExp(`^tickets-${order.id}-mail-\\d+$`));
		expect((await getOrder(t.db, order.id))?.email_sent_at).toEqual(expect.any(Number));

		const log = (await listAudit(t.db)).filter((e) => e.action === 'order.email_change');
		expect(log).toHaveLength(1);
		expect(log[0].targetId).toBe(order.id);
		// Ninguna de las dos direcciones queda en el registro.
		const logged = JSON.stringify(log[0]);
		expect(logged).not.toContain('gmai');
		expect(logged).not.toContain('@');
	});

	it('si Resend falla, la dirección queda corregida y el mail como no enviado', async () => {
		const order = await paidOrder();
		const down = resend(500);
		const res = await fix({ order: order.id, email: NEW }, { fetch: down.fetch });
		expect(res.status).toBe(502);
		expect(res.data.emailFix.ok).toBe(false);
		expect(down.posts.map((p) => p.body.to)).toEqual([[NEW]]);
		expect(await getOrder(t.db, order.id)).toMatchObject({
			buyer_email: NEW,
			email_sent_at: null
		});
	});

	it('limpia el rebote de la dirección vieja y guarda el id del envío nuevo', async () => {
		const order = await paidOrder();
		// Como lo deja el webhook de Resend cuando el mail a la dirección vieja rebotó.
		await t.db
			.prepare(
				`UPDATE orders SET email_id = 'id-viejo', email_problem = 'bounced', email_problem_at = 1
				WHERE id = ?1`
			)
			.bind(order.id)
			.run();
		const res = await fix({ order: order.id, email: NEW }, { fetch: resend().fetch });
		expect(res.emailFix.ok).toBe(true);
		expect(await getOrder(t.db, order.id)).toMatchObject({
			buyer_email: NEW,
			email_id: 'x',
			email_problem: null,
			email_problem_at: null
		});
	});

	it('si Resend falla, igual se va el rebote de la dirección vieja (y su id)', async () => {
		const order = await paidOrder();
		await t.db
			.prepare(
				`UPDATE orders SET email_id = 'id-viejo', email_problem = 'bounced', email_problem_at = 1
				WHERE id = ?1`
			)
			.bind(order.id)
			.run();
		const res = await fix({ order: order.id, email: NEW }, { fetch: resend(500).fetch });
		expect(res.status).toBe(502);
		expect(await getOrder(t.db, order.id)).toMatchObject({
			buyer_email: NEW,
			email_sent_at: null,
			email_id: null,
			email_problem: null,
			email_problem_at: null
		});
	});

	it('no admin: no cambia ni manda nada', async () => {
		const order = await paidOrder();
		const r = resend();
		expect(
			await fix({ order: order.id, email: NEW }, { locals: notAdmin, fetch: r.fetch })
		).toEqual({ thrown: 403 });
		expect(await emailOf(order.id)).toBe(OLD);
		expect(r.posts).toHaveLength(0);
	});

	it('no corrige órdenes de otro evento ni sin aprobar', async () => {
		const other = await paidOrder({ slug: 'otro-evento-de-prueba' });
		const pending = await paidOrder({ approve: false });
		const r = resend();
		for (const id of [other.id, pending.id, 'no-existe']) {
			const res = await fix({ order: id, email: NEW }, { fetch: r.fetch });
			expect(res.status).toBe(400);
		}
		expect(await emailOf(other.id)).toBe(OLD);
		expect(await emailOf(pending.id)).toBe(OLD);
		expect(r.posts).toHaveLength(0);
	});

	it('rechaza un mail mal formado y la misma dirección', async () => {
		const order = await paidOrder();
		const r = resend();
		for (const email of ['', 'sin-arroba', 'a@b', OLD.toUpperCase()]) {
			const res = await fix({ order: order.id, email }, { fetch: r.fetch });
			expect(res.status).toBe(400);
		}
		expect(await emailOf(order.id)).toBe(OLD);
		expect(r.posts).toHaveLength(0);
		expect((await listAudit(t.db)).filter((e) => e.action === 'order.email_change')).toEqual([]);
	});

	it('los códigos combo de la orden pasan a la dirección nueva', async () => {
		const order = await paidOrder();
		const other = await paidOrder({ email: 'otra@example.com' });
		const insert = (
			/** @type {string} */ code,
			/** @type {string} */ id,
			/** @type {string} */ to
		) =>
			t.db
				.prepare(
					`INSERT INTO discount_codes (code, kind, value, event_slug, max_uses, max_tickets, active,
						created_at, created_by, buyer_email, source_order_id)
					VALUES (?1, 'percent', 10, 'otro-evento-de-prueba', 1, 1, 1, 1, 'combo', ?3, ?2)`
				)
				.bind(code, id, to)
				.run();
		await insert('COMBO-AAAAAA', order.id, OLD);
		await insert('COMBO-BBBBBB', other.id, 'otra@example.com');
		expect(await updateBuyerEmail(t.db, { orderId: order.id, eventSlug: SLUG, email: NEW })).toBe(
			true
		);
		const { results } = await t.db
			.prepare('SELECT code, buyer_email FROM discount_codes ORDER BY code')
			.all();
		expect(results).toEqual([
			{ code: 'COMBO-AAAAAA', buyer_email: NEW },
			{ code: 'COMBO-BBBBBB', buyer_email: 'otra@example.com' }
		]);
		// Otro evento: ni la orden ni sus códigos cambian.
		expect(await updateBuyerEmail(t.db, { orderId: other.id, eventSlug: 'x', email: NEW })).toBe(
			false
		);
		expect(await emailOf(other.id)).toBe('otra@example.com');
	});

	it('si la dirección nueva tocó «No fui yo», avisa y no cambia ni manda nada', async () => {
		const order = await paidOrder();
		await t.db
			.prepare('INSERT INTO email_suppressions (email_hash, created_at) VALUES (?1, 1)')
			.bind(await suppressionHash(NEW))
			.run();
		const r = resend();
		const res = await fix({ order: order.id, email: NEW }, { fetch: r.fetch });
		expect(res.status).toBe(409);
		expect(res.data.emailFix.message).toContain('No fui yo');
		expect(await emailOf(order.id)).toBe(OLD);
		expect(r.posts).toHaveLength(0);
	});
});
