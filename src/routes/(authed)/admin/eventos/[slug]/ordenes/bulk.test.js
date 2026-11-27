/**
 * Órdenes → la barra de varias compras (acción `bulk`, $lib/server/admin/orderActions.js) y el
 * aviso de compras nuevas (`ordenes/nuevas`). Solo admins; qué se manda (acción conocida, sin
 * repetidas, a lo sumo una tanda); las que no aplican se saltean con su motivo; cada compra hecha
 * deja su línea en Actividad. Lo que se le manda a Resend se captura (no sale nada). D1 de
 * miniflare; evento y personas inventados.
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
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { bulkBatch } from '$lib/admin/orderBulk.js';
import { actions } from './+page.server.js';
import { GET as newOrders } from './nuevas/+server.js';

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
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/** Un fetch falso para Resend: cuenta los POST y contesta `status` (con `name` de error). */
function resend(status = 200, name = '') {
	const posts = { n: 0 };
	const fetch = /** @type {any} */ (
		async () => {
			posts.n++;
			return new Response(status === 200 ? '{"id":"x"}' : JSON.stringify({ name }), { status });
		}
	);
	return { posts, fetch };
}

/**
 * Una orden paga y aprobada (o solo reservada, con `approve: false`).
 * @param {{ slug?: string, approve?: boolean, n?: number }} [o]
 */
async function paidOrder({ slug = SLUG, approve = true, n = 1 } = {}) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: slug,
			type: { id: 'general', price: 10000, capacity: 50 },
			quantity: 1,
			holders: [{ name: `Persona Demo ${n}`, pronouns: 'elle' }],
			buyer: {
				name: `Persona Demo ${n}`,
				pronouns: 'elle',
				email: `persona${n}@example.com`,
				dni: `3011122${n}`
			}
		})
	);
	if (!approve) return /** @type {string} */ (r.order.id);
	await applyPayment(t.db, {
		id: 100 + n,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 10000,
		currency_id: 'ARS'
	});
	return /** @type {string} */ (r.order.id);
}

/**
 * Llama a `bulk` como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {string} accion
 * @param {string[]} ids
 * @param {{ locals?: any, fetch?: any }} [o]
 */
async function bulk(accion, ids, { locals = admin, fetch = resend().fetch } = {}) {
	const body = new FormData();
	body.set('accion', accion);
	for (const id of ids) body.append('order', id);
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
		return /** @type {any} */ (await actions.bulk(event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

const audit = async () =>
	(await listAudit(t.db)).map((e) => ({
		action: e.action,
		target: e.targetId,
		bulk: /** @type {any} */ (e.detail)?.bulk ?? false
	}));

describe('Órdenes: varias compras a la vez', () => {
	it('solo admins', async () => {
		const a = await paidOrder();
		const r = await bulk('facturada', [a], { locals: notAdmin });
		expect(r.thrown).toBeGreaterThanOrEqual(300);
		expect(await audit()).toEqual([]);
	});

	it('valida lo que llega: acción, ninguna, demasiadas', async () => {
		const a = await paidOrder();
		expect((await bulk('reembolsar', [a])).status).toBe(400);
		expect((await bulk('facturada', [])).status).toBe(400);
		const many = Array.from({ length: bulkBatch('reenviar') + 1 }, (_, i) => `x${i}`);
		const r = await bulk('reenviar', many);
		expect(r.status).toBe(400);
		expect(r.data.bulk.message).toMatch(/demasiadas/);
		expect(await audit()).toEqual([]);
	});

	it('facturada: hace las que aplican, saltea con motivo y anota una vez por compra', async () => {
		const a = await paidOrder({ n: 1 });
		const b = await paidOrder({ n: 2 });
		const pending = await paidOrder({ n: 3, approve: false });
		const other = await paidOrder({ n: 4, slug: 'otro-evento' });
		await bulk('facturada', [b]);
		// Repetida: cuenta una vez.
		const r = await bulk('facturada', [a, a, b, pending, other, 'no-existe']);
		expect(r.bulk.done).toEqual([a]);
		expect(r.bulk.skipped).toEqual([
			{ id: b, reason: 'ya-facturada' },
			{ id: pending, reason: 'sin-pago' },
			{ id: other, reason: 'no-encontrada' },
			{ id: 'no-existe', reason: 'no-encontrada' }
		]);
		expect(r.bulk.message).toBe(
			'1 hecha, 4 salteadas (1 ya facturada; 1 sin pago para facturar; 2 que no encontramos).'
		);
		const log = await audit();
		expect(
			log
				.filter((e) => e.action === 'order.invoiced')
				.map((e) => e.target)
				.sort()
		).toEqual([a, b].sort());
		expect(log.every((e) => e.bulk)).toBe(true);

		const off = await bulk('sin-facturar', [a, b, pending]);
		expect(off.bulk.done).toEqual([a, b]);
		expect(off.bulk.skipped).toEqual([{ id: pending, reason: 'ya-sin-facturar' }]);
		expect((await audit()).filter((e) => e.action === 'order.uninvoiced')).toHaveLength(2);
	});

	it('revisada: solo las que estaban para revisar', async () => {
		const a = await paidOrder({ n: 1 });
		const b = await paidOrder({ n: 2 });
		await t.db
			.prepare(`UPDATE orders SET needs_review = 'late_payment' WHERE id = ?1`)
			.bind(a)
			.run();
		const r = await bulk('revisada', [a, b]);
		expect(r.bulk.done).toEqual([a]);
		expect(r.bulk.skipped).toEqual([{ id: b, reason: 'sin-revisar' }]);
		const row = await t.db.prepare('SELECT needs_review FROM orders WHERE id = ?1').bind(a).first();
		expect(row?.needs_review).toBeNull();
		expect(await audit()).toEqual([{ action: 'order.reviewed', target: a, bulk: true }]);
	});

	it('reenviar: solo aprobadas, un mail y una línea por compra', async () => {
		const a = await paidOrder({ n: 1 });
		const b = await paidOrder({ n: 2 });
		const pending = await paidOrder({ n: 3, approve: false });
		const mail = resend();
		const r = await bulk('reenviar', [a, pending, b], { fetch: mail.fetch });
		expect(r.bulk.done).toEqual([a, b]);
		expect(r.bulk.skipped).toEqual([{ id: pending, reason: 'no-aprobada' }]);
		expect(mail.posts.n).toBe(2);
		const log = await audit();
		expect(log.map((e) => e.action)).toEqual(['order.resend', 'order.resend']);
		expect(log.every((e) => e.bulk)).toBe(true);
	});

	it('reenviar: si Resend pide esperar, corta y las que faltan quedan salteadas', async () => {
		const a = await paidOrder({ n: 1 });
		const b = await paidOrder({ n: 2 });
		const mail = resend(429, 'daily_quota_exceeded');
		const r = await bulk('reenviar', [a, b], { fetch: mail.fetch });
		expect(r.bulk.done).toEqual([]);
		expect(r.bulk.stopped).toBe(true);
		expect(r.bulk.skipped).toEqual([
			{ id: a, reason: 'esperar' },
			{ id: b, reason: 'esperar' }
		]);
		expect(mail.posts.n).toBe(1);
	});
});

describe('Órdenes: compras nuevas', () => {
	/**
	 * @param {number} since
	 * @param {any} [locals]
	 */
	async function ask(since, locals = admin) {
		/** @type {any} */
		const event = {
			params: { slug: SLUG },
			platform: t.platform,
			locals,
			url: new URL(`http://localhost/admin/eventos/${SLUG}/ordenes/nuevas?desde=${since}`)
		};
		try {
			return await (await newOrders(event)).json();
		} catch (e) {
			return { thrown: /** @type {any} */ (e).status };
		}
	}

	it('trae solo ids y estados de las aprobadas o reservadas desde entonces', async () => {
		const before = Date.now() - 1000;
		const a = await paidOrder({ n: 1 });
		await paidOrder({ n: 2, slug: 'otro-evento' });
		const r = await ask(before);
		expect(r.orders).toEqual([{ id: a, status: 'approved' }]);
		expect((await ask(Date.now() + 60_000)).orders).toEqual([]);
	});

	it('solo admins', async () => {
		expect((await ask(1, notAdmin)).thrown).toBeGreaterThanOrEqual(300);
	});
});
