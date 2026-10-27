/**
 * «Reembolsar todas» de un evento cancelado (decisión 0051): solo admins, solo con el evento
 * cancelado, con la palabra y la cantidad y el total que vio le admin; de a tandas con «Seguir»;
 * cada orden por el mismo paso que «Reembolsar…» (MP con la clave `refund-<orden>`, después se
 * marca); nunca reembolsa dos veces; lo que MP rechaza queda como estaba; la puerta, la carga a
 * mano y las transferencias no se tocan.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Frontmatter del evento de prueba (cada test lo ajusta). */
const meta = /** @type {Record<string, any>} */ ({});
function resetMeta() {
	for (const k of Object.keys(meta)) delete meta[k];
	Object.assign(meta, {
		title: 'Fiesta de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'cancelado',
		location: 'Lugar de prueba',
		payment_methods: ['mercadopago', 'transferencia'],
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 100 }]
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

/**
 * Mercado Pago de mentira: guarda cada pedido de reembolso y, como el real, con la misma
 * X-Idempotency-Key devuelve el mismo reembolso (no reembolsa otra vez). `failFor`: pagos que
 * rechaza. `gatewayOn`: sin él, MP «no está configurado».
 */
const mp = {
	/** @type {{ paymentId: string, key: string }[]} */
	calls: [],
	/** @type {Map<string, string>} clave → pago */
	refunds: new Map(),
	/** @type {Set<string>} */
	failFor: new Set(),
	/** @type {Set<string>} pagos que MP reembolsa pero cuya respuesta se corta (error de nuestro lado) */
	timeoutFor: new Set(),
	/** @type {Set<string>} pagos reembolsados en MP (lo que contesta `getPayment`) */
	refunded: new Set(),
	getPaymentFails: false,
	gatewayOn: true
};
/** Órdenes cuyo `refundOrder` tira (la base se cae después de que MP reembolsó). */
const markFails = new Set();
/** Acciones de Actividad que tiran al anotarse. */
const auditFails = new Set();
/** @type {((paymentId: string) => Promise<void>) | null} algo que pasa mientras MP «contesta» */
let duringRefund = null;
/** @type {string[]} */
const refundMails = [];

vi.mock('$lib/server/tickets/index.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	return {
		...actual,
		getGateway: async () =>
			mp.gatewayOn
				? {
						mock: true,
						refundPayment: async (/** @type {string} */ paymentId, /** @type {string} */ key) => {
							mp.calls.push({ paymentId, key });
							// Un respiro, para que dos pedidos a la vez se crucen de verdad.
							await new Promise((r) => setTimeout(r, 5));
							if (duringRefund) await duringRefund(paymentId);
							if (mp.failFor.has(paymentId)) throw new Error('Mercado Pago → 400: sin saldo');
							if (!mp.refunds.has(key)) mp.refunds.set(key, paymentId);
							mp.refunded.add(paymentId);
							if (mp.timeoutFor.has(paymentId)) throw new Error('timeout esperando a MP');
							return { id: `refund-de-prueba-${paymentId}`, status: 'approved' };
						},
						getPayment: async (/** @type {string} */ paymentId) => {
							if (mp.getPaymentFails) throw new Error('Mercado Pago → 503');
							return {
								id: paymentId,
								status: mp.refunded.has(paymentId) ? 'refunded' : 'approved'
							};
						}
					}
				: null,
		sendRefundEmail: async (/** @type {{ order: { id: string } }} */ { order }) => {
			refundMails.push(order.id);
			return true;
		}
	};
});

vi.mock('$lib/server/tickets/orders.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	return {
		...actual,
		refundOrder: async (/** @type {any} */ db, /** @type {any} */ input) => {
			if (markFails.has(input.orderId)) throw new Error('D1 no contesta');
			return actual.refundOrder(db, input);
		}
	};
});

vi.mock('$lib/server/admin/audit.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	return {
		...actual,
		logAdminAction: async (/** @type {any[]} */ ...args) => {
			if (auditFails.has(args[2]?.action)) throw new Error('Actividad no contesta');
			return actual.logAdminAction(...args);
		}
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { parseTicketConfig } from '$lib/server/tickets/config.js';
import { applyPayment, getOrder, refundOrder, reserveOrder } from '$lib/server/tickets/orders.js';
import { createManualOrder } from '$lib/server/tickets/manual.js';
import { REFUND_ALL_BATCH, isMpRefundable, refundAllPreview } from '$lib/server/admin/refunds.js';
import * as page from './+page.server.js';

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
	mp.calls = [];
	mp.refunds = new Map();
	mp.failFor = new Set();
	mp.timeoutFor = new Set();
	mp.refunded = new Set();
	mp.getPaymentFails = false;
	mp.gatewayOn = true;
	markFails.clear();
	auditFails.clear();
	duringRefund = null;
	refundMails.length = 0;
});

const SLUG = 'fiesta-de-prueba';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };
const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));
const NOW = Date.parse('2026-10-20T15:00:00-03:00');

/**
 * Llama a una form action como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {Record<string, string>} fields
 * @param {any} [locals]
 */
async function post(fields, locals = admin) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		params: { slug: SLUG },
		platform: t.platform,
		locals,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL(`http://localhost/admin/eventos/${SLUG}/ordenes`),
		fetch: noFetch
	};
	try {
		const out = await /** @type {any} */ (page.actions).refundAll(event);
		return out?.data ? { ...out.data, status: out.status } : out;
	} catch (thrown) {
		return { thrown };
	}
}

const type = () => /** @type {any} */ (parseTicketConfig(meta)).types[0];

/** Una compra online pagada con Mercado Pago (pago n.° `paymentId`). @param {number} paymentId @param {number} [quantity] */
async function mpOrder(paymentId, quantity = 1) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: SLUG,
			type: type(),
			quantity,
			holders: Array.from({ length: quantity }, (_, i) => ({
				name: `Persona ${i}`,
				pronouns: 'elle'
			})),
			buyer: {
				name: `Persona ${paymentId}`,
				pronouns: 'elle',
				email: `p${paymentId}@example.com`,
				dni: '30111222'
			},
			now: NOW + paymentId
		})
	);
	const res = await applyPayment(
		t.db,
		{
			id: paymentId,
			status: 'approved',
			external_reference: r.order.id,
			transaction_amount: r.order.total,
			currency_id: 'ARS'
		},
		{ now: NOW + paymentId }
	);
	return /** @type {any} */ (res.order);
}

/** Una venta cargada a mano (efectivo). @param {string} method @param {number} amount */
async function manualOrder(method = 'efectivo', amount = 10000) {
	const r = /** @type {any} */ (
		await createManualOrder(t.db, {
			eventSlug: SLUG,
			type: type(),
			quantity: 1,
			holders: [{ name: 'Persona en la puerta', pronouns: 'elle' }],
			buyer: { name: 'Persona en la puerta', email: '' },
			method: /** @type {any} */ (method),
			amount,
			by: 'admin-de-prueba',
			now: NOW
		})
	);
	expect(r.ok).toBe(true);
	return r.order;
}

/** @param {{ count: number, total: number }} p */
const confirmFields = (p) => ({
	confirm: 'REEMBOLSAR',
	count: String(p.count),
	total: String(p.total)
});

describe('qué cuenta «Reembolsar todas»', () => {
	it('solo las aprobadas de MP online con número de pago; el resto, para devolver a mano', async () => {
		const a = await mpOrder(101, 2);
		await mpOrder(102);
		const cash = await manualOrder('efectivo', 9000);
		await manualOrder('cortesia', 0);
		const preview = await refundAllPreview(t.db, SLUG);
		expect(preview.mp).toEqual({ count: 2, total: a.total + 10000 });
		expect(preview.manual).toEqual([
			{
				id: cash.id,
				name: 'Persona en la puerta',
				method: 'efectivo',
				channel: 'manual',
				total: 9000
			}
		]);
		expect(preview.free).toBe(1);
		expect(isMpRefundable({ ...a, channel: 'puerta' })).toBe(false);
		expect(isMpRefundable({ ...a, mp_payment_id: null })).toBe(false);
		expect(isMpRefundable({ ...a, status: 'refunded' })).toBe(false);
	});

	it('la pestaña Órdenes lo muestra solo con el evento cancelado', async () => {
		await mpOrder(101);
		const load = async () =>
			/** @type {any} */ (
				await page.load(
					/** @type {any} */ ({
						locals: admin,
						url: new URL(`http://localhost/admin/eventos/${SLUG}/ordenes`),
						params: { slug: SLUG },
						platform: t.platform,
						setHeaders: () => {}
					})
				)
			);
		expect((await load()).refundAll).toMatchObject({
			mp: { count: 1, total: 10000 },
			word: 'REEMBOLSAR',
			batch: REFUND_ALL_BATCH
		});
		meta.status = 'abierto';
		expect((await load()).refundAll).toBeNull();
	});
});

describe('«Reembolsar todas»: quién y cuándo', () => {
	it('evento no cancelado: rechazado, sin tocar nada', async () => {
		const o = await mpOrder(101);
		meta.status = 'abierto';
		const r = await post(confirmFields({ count: 1, total: o.total }));
		expect(r.refundAll).toMatchObject({ ok: false });
		expect(r.refundAll.message).toMatch(/evento cancelado/);
		expect(mp.calls).toEqual([]);
		expect((await getOrder(t.db, o.id))?.status).toBe('approved');
	});

	it('sin sesión o sin ser admin: rechazado (redirect / 403), sin tocar nada', async () => {
		const o = await mpOrder(101);
		const anon = await post(confirmFields({ count: 1, total: o.total }), {});
		expect(anon.thrown).toMatchObject({ status: 303 });
		const other = await post(confirmFields({ count: 1, total: o.total }), notAdmin);
		expect(other.thrown).toMatchObject({ status: 403 });
		expect(mp.calls).toEqual([]);
		expect((await getOrder(t.db, o.id))?.status).toBe('approved');
	});

	it('sin la palabra, o con una cantidad o un total que ya no son los de ahora: rechazado', async () => {
		const o = await mpOrder(101);
		expect((await post({ count: '1', total: String(o.total) })).refundAll.message).toMatch(
			/escribí REEMBOLSAR/
		);
		expect(
			(await post({ ...confirmFields({ count: 1, total: o.total }), confirm: 'reembolsa' }))
				.refundAll.ok
		).toBe(false);
		// Entró otra compra después de abrir la página.
		await mpOrder(102);
		const stale = await post(confirmFields({ count: 1, total: o.total }));
		expect(stale.refundAll.message).toMatch(/ahora son 2 por/);
		expect(mp.calls).toEqual([]);
		// Sin MP configurado: no se hace nada.
		mp.gatewayOn = false;
		const off = await post(confirmFields({ count: 2, total: o.total + 10000 }));
		expect(off.refundAll.message).toMatch(/Mercado Pago no está disponible/);
		expect((await getOrder(t.db, o.id))?.status).toBe('approved');
	});
});

describe('«Reembolsar todas»: reembolsos', () => {
	it('reembolsa por el mismo paso que «Reembolsar…»: MP con refund-<orden>, marca, mail y Actividad', async () => {
		const a = await mpOrder(101);
		const b = await mpOrder(102, 2);
		const cash = await manualOrder('efectivo', 9000);
		const r = await post(confirmFields({ count: 2, total: a.total + b.total }));
		expect(r.refundAll).toMatchObject({ ok: true, remaining: 0 });
		expect(r.refundAll.results.map((/** @type {any} */ x) => x.result)).toEqual([
			'refunded',
			'refunded'
		]);
		expect(mp.calls).toEqual([
			{ paymentId: '101', key: `refund-${a.id}` },
			{ paymentId: '102', key: `refund-${b.id}` }
		]);
		for (const o of [a, b]) {
			expect(await getOrder(t.db, o.id)).toMatchObject({
				status: 'refunded',
				refunded_by: ADMINS[0].login
			});
		}
		expect(refundMails.sort()).toEqual([a.id, b.id].sort());
		// La venta en efectivo no se tocó.
		expect((await getOrder(t.db, cash.id))?.status).toBe('approved');
		const audit = await listAudit(t.db, { limit: 10 });
		expect(audit.map((e) => e.action).sort()).toEqual([
			'event.refund_all',
			'order.refund',
			'order.refund'
		]);
	});

	it('doble envío (dos pedidos a la vez y otro después): nunca reembolsa dos veces', async () => {
		const a = await mpOrder(101);
		const b = await mpOrder(102);
		const fields = confirmFields({ count: 2, total: a.total + b.total });
		const [one, two] = await Promise.all([post(fields), post(fields)]);
		// Los dos pedidos pueden llegar a MP, pero con la misma clave: un solo reembolso por pago.
		expect(new Set(mp.calls.map((c) => c.key))).toEqual(
			new Set([`refund-${a.id}`, `refund-${b.id}`])
		);
		expect([...mp.refunds.values()].sort()).toEqual(['101', '102']);
		// Cada orden se marcó una vez y salió un solo mail por orden.
		const results = [...(one.refundAll?.results ?? []), ...(two.refundAll?.results ?? [])];
		expect(results.filter((/** @type {any} */ x) => x.result === 'refunded')).toHaveLength(2);
		expect(refundMails.sort()).toEqual([a.id, b.id].sort());
		// Un tercer envío ya no encuentra nada: ni MP ni mails.
		const calls = mp.calls.length;
		const again = await post(confirmFields({ count: 0, total: 0 }));
		expect(again.refundAll.message).toMatch(/No queda ninguna orden/);
		expect(mp.calls).toHaveLength(calls);
		expect(refundMails).toHaveLength(2);
	});

	it('si MP rechaza una, esa queda aprobada con el motivo y las demás siguen', async () => {
		const a = await mpOrder(101);
		const b = await mpOrder(102);
		const c = await mpOrder(103);
		mp.failFor.add('102');
		const r = await post(confirmFields({ count: 3, total: a.total + b.total + c.total }));
		expect(r.refundAll.ok).toBe(false);
		expect(r.refundAll.results.map((/** @type {any} */ x) => [x.result, x.ok])).toEqual([
			['refunded', true],
			['mp-failed', false],
			['refunded', true]
		]);
		expect(r.refundAll.results[1].reason).toMatch(/Mercado Pago no aceptó el reembolso/);
		expect((await getOrder(t.db, b.id))?.status).toBe('approved');
		expect((await getOrder(t.db, b.id))?.refunded_at ?? null).toBeNull();
		expect(refundMails.sort()).toEqual([a.id, c.id].sort());
		const [summary] = (await listAudit(t.db, { limit: 10 })).filter(
			(e) => e.action === 'event.refund_all'
		);
		expect(summary.summary).toMatch(/2 reembolsadas, 1 sin reembolsar/);
		// Volver a empezar la reintenta (y solo esa).
		mp.failFor.clear();
		const retry = await post(confirmFields({ count: 1, total: b.total }));
		expect(retry.refundAll.results).toMatchObject([{ result: 'refunded' }]);
		expect((await getOrder(t.db, b.id))?.status).toBe('refunded');
	});

	it('de a tandas: «Seguir» continúa desde la última, sin repetir ni saltear', async () => {
		const orders = [];
		for (let i = 0; i < REFUND_ALL_BATCH + 3; i++) orders.push(await mpOrder(200 + i));
		const total = orders.reduce((s, o) => s + o.total, 0);
		mp.failFor.add('201'); // una falla en la primera tanda: no se reintenta sola en la segunda
		const first = await post(confirmFields({ count: orders.length, total }));
		expect(first.refundAll.results).toHaveLength(REFUND_ALL_BATCH);
		expect(first.refundAll.remaining).toBe(3);
		const second = await post({ confirm: 'REEMBOLSAR', after: first.refundAll.after });
		expect(second.refundAll.results).toHaveLength(3);
		expect(second.refundAll.remaining).toBe(0);
		// Cada pago se pidió una sola vez, en orden de compra.
		expect(mp.calls.map((c) => c.paymentId)).toEqual(orders.map((_, i) => String(200 + i)));
		const statuses = await Promise.all(
			orders.map(async (o) => (await getOrder(t.db, o.id))?.status)
		);
		expect(statuses.filter((s) => s === 'refunded')).toHaveLength(orders.length - 1);
		expect((await getOrder(t.db, orders[1].id))?.status).toBe('approved');
	});
});

describe('«Reembolsar…» de una orden sigue igual (el mismo paso)', () => {
	/** @param {string} order */
	async function single(order) {
		const body = new FormData();
		body.set('order', order);
		/** @type {any} */
		const event = {
			params: { slug: SLUG },
			platform: t.platform,
			locals: admin,
			request: new Request('http://localhost/x', { method: 'POST', body }),
			url: new URL(`http://localhost/admin/eventos/${SLUG}/ordenes`),
			fetch: noFetch
		};
		const out = await /** @type {any} */ (page.actions).refund(event);
		return out?.data ?? out;
	}

	it('MP con refund-<orden>; si MP rechaza, 502 y la orden no cambia; la segunda vez, «ya estaba»', async () => {
		const o = await mpOrder(101);
		mp.failFor.add('101');
		expect((await single(o.id)).refund.message).toMatch(/Mercado Pago no aceptó el reembolso/);
		expect((await getOrder(t.db, o.id))?.status).toBe('approved');
		mp.failFor.clear();
		expect((await single(o.id)).refund).toMatchObject({ ok: true });
		expect(mp.calls.map((c) => c.key)).toEqual([`refund-${o.id}`, `refund-${o.id}`]);
		expect(refundMails).toEqual([o.id]);
		expect((await single(o.id)).refund.message).toMatch(/ya estaba reembolsada/);
		expect(mp.calls).toHaveLength(2);
		// Y «Reembolsar todas» ya no la cuenta.
		expect((await refundAllPreview(t.db, SLUG)).mp.count).toBe(0);
	});
});

describe('«Reembolsar todas»: errores del lado nuestro', () => {
	it('MP reembolsó pero la respuesta se cortó: se consulta el pago, se marca y cuenta como hecha', async () => {
		const a = await mpOrder(101);
		const b = await mpOrder(102);
		mp.timeoutFor.add('101');
		const r = await post(confirmFields({ count: 2, total: a.total + b.total }));
		expect(r.refundAll.results.map((/** @type {any} */ x) => x.result)).toEqual([
			'refunded',
			'refunded'
		]);
		expect(r.refundAll.ok).toBe(true);
		expect(await getOrder(t.db, a.id)).toMatchObject({
			status: 'refunded',
			refunded_by: ADMINS[0].login
		});
		// Un solo reembolso en MP y un solo mail: nadie la va a devolver otra vez a mano.
		expect(mp.calls.filter((c) => c.paymentId === '101')).toHaveLength(1);
		expect(refundMails.sort()).toEqual([a.id, b.id].sort());
	});

	it('error de MP y el pago no figura reembolsado (o MP no contesta): queda aprobada, con «revisá en MP»', async () => {
		const a = await mpOrder(101);
		const b = await mpOrder(102);
		mp.failFor.add('101');
		mp.failFor.add('102');
		mp.getPaymentFails = true; // la segunda: MP tampoco contesta la consulta
		const r = await post(confirmFields({ count: 2, total: a.total + b.total }));
		expect(r.refundAll.results.map((/** @type {any} */ x) => x.result)).toEqual([
			'mp-failed',
			'mp-failed'
		]);
		expect(r.refundAll.results[0].reason).toMatch(/revisá el pago en Mercado Pago/);
		for (const o of [a, b]) expect((await getOrder(t.db, o.id))?.status).toBe('approved');
		expect(refundMails).toEqual([]);
	});

	it('error de MP pero mientras tanto la orden quedó reembolsada (webhook): «ya estaba», sin otro mail', async () => {
		const a = await mpOrder(101);
		mp.failFor.add('101');
		mp.getPaymentFails = true;
		duringRefund = async () => {
			await refundOrder(t.db, { orderId: a.id, eventSlug: SLUG, by: 'webhook-de-prueba' });
		};
		const r = await post(confirmFields({ count: 1, total: a.total }));
		expect(r.refundAll.results).toMatchObject([{ result: 'already', ok: true }]);
		expect(refundMails).toEqual([]);
	});

	it('un error después de pedirle el reembolso a MP no corta la tanda: «not-marked» y sigue; el resumen se anota igual', async () => {
		const a = await mpOrder(101);
		const b = await mpOrder(102);
		const c = await mpOrder(103);
		markFails.add(b.id);
		const r = await post(confirmFields({ count: 3, total: a.total + b.total + c.total }));
		expect(r.refundAll.results.map((/** @type {any} */ x) => [x.id, x.result, x.ok])).toEqual([
			[a.id, 'refunded', true],
			[b.id, 'not-marked', false],
			[c.id, 'refunded', true]
		]);
		expect(r.refundAll.results[1].reason).toMatch(/revisá el pago en Mercado Pago/);
		expect((await getOrder(t.db, c.id))?.status).toBe('refunded');
		const [summary] = (await listAudit(t.db, { limit: 10 })).filter(
			(e) => e.action === 'event.refund_all'
		);
		expect(summary.summary).toMatch(/2 reembolsadas, 1 sin reembolsar/);
	});

	it('si la Actividad falla, el mail sale igual y la tanda devuelve su resumen', async () => {
		const a = await mpOrder(101);
		auditFails.add('order.refund');
		auditFails.add('event.refund_all');
		const r = await post(confirmFields({ count: 1, total: a.total }));
		expect(r.refundAll).toMatchObject({ ok: true, remaining: 0 });
		expect(r.refundAll.results).toMatchObject([{ id: a.id, result: 'refunded' }]);
		expect(refundMails).toEqual([a.id]);
		expect((await getOrder(t.db, a.id))?.status).toBe('refunded');
	});

	it('«Seguir» con un `after` que no es una orden de este evento: 400, sin volver a empezar', async () => {
		const a = await mpOrder(101);
		for (const after of [crypto.randomUUID(), 'no-es-un-id']) {
			const r = await post({ confirm: 'REEMBOLSAR', after });
			expect(r.status).toBe(400);
			expect(r.refundAll).toMatchObject({ ok: false });
			expect(r.refundAll.message).toMatch(/No sabemos desde dónde seguir/);
		}
		// Una orden real, pero de otro evento.
		await t.db
			.prepare("UPDATE orders SET event_slug = 'otro-evento' WHERE id = ?1")
			.bind(a.id)
			.run();
		const other = await post({ confirm: 'REEMBOLSAR', after: a.id });
		expect(other.refundAll.message).toMatch(/No sabemos desde dónde seguir/);
		expect(mp.calls).toEqual([]);
	});
});
