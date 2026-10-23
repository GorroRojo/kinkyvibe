/**
 * El motor de la lista de espera (waitlistEngine.js) con un reloj fijo: ofrecer de a una persona
 * (dos corridas a la vez ofrecen una sola vez), el aviso a todes (faltan menos de 6 h, o «todes a
 * la vez»), el cierre en comienzo − 30 min, `agotadas`/`cancelado`, la compra abandonada que
 * vuelve a `offered`, un solo mail de «se venció» por ronda, el borrado de las anotaciones sin
 * confirmar, la tanda del cron (los mails de la lista primero) y el empujón con su límite.
 * D1 de miniflare; eventos y mails inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const flag = vi.hoisted(() => ({ on: true }));

vi.mock('$lib/server/flags.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	isFlagOn: async (/** @type {unknown} */ _db, /** @type {string} */ key) =>
		key === 'lista_espera' ? flag.on : false,
	listaEsperaEnabled: async () => flag.on
}));

const NOW = vi.hoisted(() => Date.parse('2026-10-11T12:00:00Z'));

vi.mock('./events.js', async () => {
	const { parseTicketConfig } = await import('./config.js');
	const H = 60 * 60 * 1000;
	/** @param {number} ms */
	const iso = (ms) => new Date(ms).toISOString();
	const common = {
		title: 'Evento de prueba',
		start: iso(NOW + 10 * 24 * H),
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['mercadopago', 'transferencia'],
		lista_espera: 'evento',
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 2 }]
	};
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		// Faltan 10 días: se guarda el lugar 24 h.
		lejos: common,
		// Faltan 20 h: 2 h.
		manana: { ...common, start: iso(NOW + 20 * H) },
		// Faltan 4 h: aviso a todes.
		cerca: { ...common, start: iso(NOW + 4 * H) },
		// «Todes a la vez» desde el principio.
		todes: { ...common, lista_espera: { alcance: 'evento', todes_a_la_vez: true } },
		agotado: { ...common, status: 'agotadas' },
		cancelado: { ...common, status: 'cancelado' },
		// Por tipo: «General» con cupo tiene su lista.
		tipo: {
			...common,
			lista_espera: 'tipo',
			tickets: [
				{ id: 'general', name: 'General', price: 10000, capacity: 1 },
				{ id: 'libre', name: 'Libre', price: 5000 }
			]
		},
		'sin-lista': { ...common, lista_espera: undefined }
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug] ? parseTicketConfig(metas[slug], opts) : null,
		getEventInfo: async () => null,
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { getEventTickets } from './events.js';
import { runMailQueueWith } from './mailQueue.js';
import { HOLD_MS, getTaken, reserveOrder } from './orders.js';
import { endWaitlistEntry, leaveWaitlist } from './waitlist.js';
import {
	ENDED_MAIL_WINDOW_MS,
	advanceWaitlist,
	offerToken,
	pendingWaitlistMails,
	queueEndedMail,
	queueWaitlistAdvance,
	runWaitlistCron,
	sendWaitlistMails,
	waitlistEventsToSweep
} from './waitlistEngine.js';
import { findOffer, waitlistGuard } from './waitlistPurchase.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const H = 60 * 60 * 1000;
const MIN = 60 * 1000;
const ORIGIN = 'https://kinkyvibe.ar';
const BIG = { perEmailQuantity: 1000, perEmailOrders: 1000, perClientQuantity: 1000 };

beforeEach(async () => {
	await resetDB(t.db);
	flag.on = true;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
});

let n = 0;

/**
 * Una persona en la fila (ya confirmada), en orden de `confirmedAt`.
 * @param {string} slug
 * @param {{ type?: string | null, confirmedAt?: number }} [o]
 */
async function waiting(slug, { type = null, confirmedAt = NOW - H + ++n } = {}) {
	const id = crypto.randomUUID();
	await t.db
		.prepare(
			`INSERT INTO waitlist_entries (id, event_slug, ticket_type, email, status, confirmed_at,
				created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, 'waiting', ?5, ?5, ?5)`
		)
		.bind(id, slug, type, `fila${++n}@example.com`, confirmedAt)
		.run();
	return id;
}

/** @param {string} id */
async function row(id) {
	return /** @type {Record<string, any> | null} */ (
		await t.db.prepare('SELECT * FROM waitlist_entries WHERE id = ?1').bind(id).first()
	);
}

/** @param {string} slug */
async function statuses(slug) {
	const { results } = await t.db
		.prepare(
			`SELECT status, COUNT(*) AS n FROM waitlist_entries WHERE event_slug = ?1 GROUP BY status`
		)
		.bind(slug)
		.all();
	return Object.fromEntries(results.map((r) => [r.status, Number(r.n)]));
}

/**
 * Una venta aprobada (ocupa lugar). Devuelve la orden.
 * @param {string} slug @param {string} [typeId] @param {number} [quantity]
 */
async function sell(slug, typeId = 'general', quantity = 1) {
	const r = await reserveOrder(t.db, {
		eventSlug: slug,
		type: { id: typeId, price: 1000, capacity: null },
		quantity,
		holders: Array.from({ length: quantity }, (_, i) => ({ name: `P ${i}`, pronouns: 'elle' })),
		buyer: { name: 'Venta previa', email: `previa${++n}@example.com`, dni: '30000000' },
		method: 'transferencia',
		limits: BIG,
		now: NOW - 2 * H
	});
	if (!r.ok) throw new Error(`venta previa: ${JSON.stringify(r)}`);
	await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(r.order.id).run();
	return r.order;
}

/** Reembolsa una orden (libera su lugar). @param {string} id */
async function refund(id) {
	await t.db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?1").bind(id).run();
}

/** Un envío de mails de mentira. @param {'sent' | 'failed'} [result] */
function fakeSend(result = 'sent') {
	/** @type {{ to: string, subject: string, text: string, key?: string }[]} */
	const sent = [];
	/** @type {import('./waitlistMail.js').WaitlistSend} */
	const send = async (to, message, key) => {
		sent.push({ to, subject: message.subject, text: message.text, key });
		return result;
	};
	return { send, sent };
}

/** @param {number} now @param {ReturnType<typeof fakeSend>['send']} send @param {number} [limit] */
const mails = (now, send, limit = 100) =>
	sendWaitlistMails(t.db, { limit, send, origin: ORIGIN, now });

/** Lleno el evento (2 lugares) y libero uno. @param {string} slug */
async function soldOutThenOneFree(slug) {
	const a = await sell(slug);
	await sell(slug);
	return a;
}

describe('ofrecer de a una persona', () => {
	it('con un lugar libre se lo guarda 24 h a la primera de la fila (faltan 10 días)', async () => {
		const freed = await soldOutThenOneFree('lejos');
		const first = await waiting('lejos');
		const second = await waiting('lejos');
		expect((await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW })).offered).toBe(0);
		await refund(freed.id);
		const r = await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW });
		expect(r.offered).toBe(1);
		expect(await row(first)).toMatchObject({
			status: 'offered',
			offer_count: 1,
			offered_at: NOW,
			hold_until: NOW + 24 * H
		});
		expect((await row(second))?.status).toBe('waiting');
		// Mientras la reserva sigue vigente, nadie más recibe oferta (aunque se libere otro).
		await t.db.prepare("UPDATE orders SET status = 'refunded' WHERE event_slug = 'lejos'").run();
		expect((await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW + H })).offered).toBe(0);
	});

	it('el token del mail de la oferta es el del link: findOffer lo reconoce', async () => {
		const freed = await soldOutThenOneFree('lejos');
		const id = await waiting('lejos');
		await refund(freed.id);
		await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW });
		const { send, sent } = fakeSend();
		expect(await mails(NOW, send)).toEqual({ sent: 1, failed: 0, remaining: 0 });
		expect(sent[0].key).toBe(`waitlist-offer-${id}-1`);
		const token = /** @type {string} */ (
			sent[0].text.match(/entradas\?lista=([A-Za-z0-9_-]{43})/)?.[1]
		);
		expect(token).toBe(await offerToken(t.db, id, 1));
		expect(await findOffer(t.db, { token, eventSlug: 'lejos', now: NOW })).toMatchObject({
			state: 'valid',
			id,
			holdUntil: NOW + 24 * H
		});
	});

	it('dos corridas a la vez hacen una sola oferta', async () => {
		const freed = await soldOutThenOneFree('lejos');
		for (let i = 0; i < 5; i++) await waiting('lejos');
		await refund(freed.id);
		const runs = await Promise.all(
			Array.from({ length: 4 }, () => advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW }))
		);
		expect(runs.reduce((s, r) => s + r.offered, 0)).toBe(1);
		expect(await statuses('lejos')).toEqual({ offered: 1, waiting: 4 });
	});

	it('la reserva vencida pasa a la siguiente persona y se manda un solo «se venció» por ronda', async () => {
		const freed = await soldOutThenOneFree('manana');
		const first = await waiting('manana');
		const second = await waiting('manana');
		await refund(freed.id);
		await advanceWaitlist(t.db, { eventSlug: 'manana', now: NOW });
		expect((await row(first))?.hold_until).toBe(NOW + 2 * H);
		const { send, sent } = fakeSend();
		await mails(NOW, send);
		const later = NOW + 2 * H;
		const r = await advanceWaitlist(t.db, { eventSlug: 'manana', now: later });
		expect(r).toMatchObject({ expired: 1, offered: 1 });
		expect(await row(first)).toMatchObject({
			status: 'expired',
			end_reason: 'hold_expired',
			offer_token_hash: null
		});
		expect((await row(second))?.status).toBe('offered');
		await mails(later, send);
		await mails(later + MIN, send);
		await advanceWaitlist(t.db, { eventSlug: 'manana', now: later + MIN });
		await mails(later + 2 * MIN, send);
		const expiredMails = sent.filter((m) => m.key?.startsWith('waitlist-expired-'));
		expect(expiredMails.map((m) => m.key)).toEqual([`waitlist-expired-${first}-1`]);
		expect(expiredMails[0].text).toContain('/lista-de-espera/volver/');
		// La oferta de la segunda persona salió una vez.
		expect(sent.filter((m) => m.key === `waitlist-offer-${second}-1`)).toHaveLength(1);
		// Pasado el plazo, ya no se manda el «se venció» que faltara.
		expect(
			(await pendingWaitlistMails(t.db, { now: later + ENDED_MAIL_WINDOW_MS + MIN })).filter(
				(m) => m.kind === 'expired'
			)
		).toEqual([]);
	});

	it('una reserva terminada por admin recibe «se terminó tu lugar» solo si se pidió', async () => {
		const freed = await soldOutThenOneFree('lejos');
		const asked = await waiting('lejos');
		await refund(freed.id);
		await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW });
		const { send, sent } = fakeSend();
		// Sin el mail de la oferta no se puede pedir.
		await endWaitlistEntry(t.db, asked, { reason: 'admin', by: 'admin-de-prueba', now: NOW });
		expect(await queueEndedMail(t.db, asked, NOW)).toBe(false);
		await t.db.prepare('DELETE FROM waitlist_entries').run();

		const freed2 = await soldOutThenOneFree('manana');
		const a = await waiting('manana');
		const b = await waiting('manana');
		await refund(freed2.id);
		await advanceWaitlist(t.db, { eventSlug: 'manana', now: NOW });
		await mails(NOW, send);
		await endWaitlistEntry(t.db, a, { reason: 'admin', by: 'admin-de-prueba', now: NOW + MIN });
		// Sin pedirlo, no sale nada.
		expect(
			(await pendingWaitlistMails(t.db, { now: NOW + MIN })).filter((m) => m.kind === 'expired')
		).toEqual([]);
		expect(await queueEndedMail(t.db, a, NOW + MIN)).toBe(true);
		// Pedirlo otra vez no duplica nada.
		expect(await queueEndedMail(t.db, a, NOW + MIN)).toBe(false);
		await advanceWaitlist(t.db, { eventSlug: 'manana', now: NOW + MIN });
		await mails(NOW + 2 * MIN, send);
		await mails(NOW + 3 * MIN, send);
		const ended = sent.filter((m) => m.key?.startsWith('waitlist-expired-'));
		expect(ended.map((m) => [m.key, m.subject])).toEqual([
			[`waitlist-expired-${a}-1`, 'Se terminó tu lugar para Evento de prueba']
		]);
		expect(ended[0].text).toContain('/lista-de-espera/volver/');
		expect(sent.filter((m) => m.key === `waitlist-offer-${b}-1`)).toHaveLength(1);
	});

	it('si quien tenía el lugar guardado sale de la lista, se le ofrece a quien sigue', async () => {
		const freed = await soldOutThenOneFree('lejos');
		const first = await waiting('lejos');
		const second = await waiting('lejos');
		await refund(freed.id);
		await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW });
		expect((await leaveWaitlist(t.db, first, { now: NOW + H }))?.was).toBe('offered');
		expect((await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW + H })).offered).toBe(1);
		expect(await row(second)).toMatchObject({ status: 'offered', hold_until: NOW + 25 * H });
	});

	it('el último aviso sale con 3 h por delante, solo en reservas de 12 h o más', async () => {
		const freed = await soldOutThenOneFree('lejos');
		const id = await waiting('lejos');
		await refund(freed.id);
		await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW });
		const { send, sent } = fakeSend();
		await mails(NOW, send);
		await mails(NOW + 20 * H, send);
		expect(sent.map((m) => m.key)).toEqual([`waitlist-offer-${id}-1`]);
		await mails(NOW + 21 * H, send);
		await mails(NOW + 22 * H, send);
		expect(sent.map((m) => m.key)).toEqual([`waitlist-offer-${id}-1`, `waitlist-reminder-${id}-1`]);

		// Una reserva de 2 h no tiene último aviso.
		const freed2 = await soldOutThenOneFree('manana');
		const short = await waiting('manana');
		await refund(freed2.id);
		await advanceWaitlist(t.db, { eventSlug: 'manana', now: NOW });
		await mails(NOW, send);
		await mails(NOW + H + 30 * MIN, send);
		expect(sent.filter((m) => m.key?.includes(short)).map((m) => m.key)).toEqual([
			`waitlist-offer-${short}-1`
		]);
	});

	it('por tipo: cada tipo con cupo tiene su fila', async () => {
		const freed = await sell('tipo', 'general');
		const general = await waiting('tipo', { type: 'general' });
		expect((await advanceWaitlist(t.db, { eventSlug: 'tipo', now: NOW })).offered).toBe(0);
		await refund(freed.id);
		expect((await advanceWaitlist(t.db, { eventSlug: 'tipo', now: NOW })).offered).toBe(1);
		expect((await row(general))?.status).toBe('offered');
	});
});

describe('aviso a todes', () => {
	it('faltan menos de 6 h: se le avisa a toda la fila a la vez, sin lugar guardado', async () => {
		const freed = await soldOutThenOneFree('cerca');
		const ids = [await waiting('cerca'), await waiting('cerca'), await waiting('cerca')];
		await refund(freed.id);
		expect((await advanceWaitlist(t.db, { eventSlug: 'cerca', now: NOW })).offered).toBe(3);
		for (const id of ids)
			expect(await row(id)).toMatchObject({ status: 'offered', hold_until: null, offer_count: 1 });
		// Quien confirma después también recibe el aviso (sigue habiendo lugar).
		const late = await waiting('cerca', { confirmedAt: NOW + MIN });
		expect((await advanceWaitlist(t.db, { eventSlug: 'cerca', now: NOW + 2 * MIN })).offered).toBe(
			1
		);
		expect((await row(late))?.hold_until).toBeNull();
		const { send, sent } = fakeSend();
		await mails(NOW + 2 * MIN, send);
		expect(sent).toHaveLength(4);
		expect(sent[0].text).toContain('toda la lista a la vez');
	});

	it('«todes a la vez» desde el principio, aunque falten días', async () => {
		const freed = await soldOutThenOneFree('todes');
		await waiting('todes');
		await waiting('todes');
		await refund(freed.id);
		expect((await advanceWaitlist(t.db, { eventSlug: 'todes', now: NOW })).offered).toBe(2);
		expect(await statuses('todes')).toEqual({ offered: 2 });
	});

	it('dos corridas a la vez no le ofrecen dos veces a nadie', async () => {
		const freed = await soldOutThenOneFree('cerca');
		for (let i = 0; i < 4; i++) await waiting('cerca');
		await refund(freed.id);
		const runs = await Promise.all([
			advanceWaitlist(t.db, { eventSlug: 'cerca', now: NOW }),
			advanceWaitlist(t.db, { eventSlug: 'cerca', now: NOW })
		]);
		expect(runs[0].offered + runs[1].offered).toBe(4);
		const { results } = await t.db
			.prepare("SELECT offer_count FROM waitlist_entries WHERE event_slug = 'cerca'")
			.all();
		expect(results.map((r) => r.offer_count)).toEqual([1, 1, 1, 1]);
	});
});

describe('cierre de la lista', () => {
	it('cierra en comienzo − 30 min: hasta un minuto antes ofrece, después cierra y avisa una vez', async () => {
		const start = NOW + 4 * H;
		const freed = await soldOutThenOneFree('cerca');
		const a = await waiting('cerca');
		const b = await waiting('cerca');
		// Un minuto antes del cierre: todavía ofrece (aviso a todes).
		await refund(freed.id);
		const before = start - 31 * MIN;
		expect((await advanceWaitlist(t.db, { eventSlug: 'cerca', now: before })).offered).toBe(2);
		const c = await waiting('cerca', { confirmedAt: before + 1 });
		// En el cierre justo: todo lo vivo pasa a `expired` / `closed`.
		const cutoff = start - 30 * MIN;
		const r = await advanceWaitlist(t.db, { eventSlug: 'cerca', now: cutoff });
		expect(r).toMatchObject({ offered: 0, closed: 3 });
		for (const id of [a, b, c])
			expect(await row(id)).toMatchObject({ status: 'expired', end_reason: 'closed' });
		const { send, sent } = fakeSend();
		await mails(cutoff, send);
		await mails(cutoff + MIN, send);
		const closed = sent.filter((m) => m.key?.startsWith('waitlist-closed-'));
		expect(closed.map((m) => m.key).sort()).toEqual(
			[a, b, c].map((id) => `waitlist-closed-${id}`).sort()
		);
	});

	it('quien confirma después del cierre queda cerrade en la próxima pasada', async () => {
		const start = NOW + 4 * H;
		const late = await waiting('cerca', { confirmedAt: start - 10 * MIN });
		await advanceWaitlist(t.db, { eventSlug: 'cerca', now: start - 10 * MIN });
		expect(await row(late)).toMatchObject({ status: 'expired', end_reason: 'closed' });
	});

	it('agotadas a mano: no ofrece aunque haya lugar libre', async () => {
		const freed = await soldOutThenOneFree('agotado');
		const id = await waiting('agotado');
		await refund(freed.id);
		expect((await advanceWaitlist(t.db, { eventSlug: 'agotado', now: NOW })).offered).toBe(0);
		expect((await row(id))?.status).toBe('waiting');
	});

	it('evento cancelado: no ofrece y cierra la lista con `event_cancelled`', async () => {
		const freed = await soldOutThenOneFree('cancelado');
		const id = await waiting('cancelado');
		await refund(freed.id);
		const r = await advanceWaitlist(t.db, { eventSlug: 'cancelado', now: NOW });
		expect(r).toMatchObject({ offered: 0, closed: 1 });
		expect(await row(id)).toMatchObject({ status: 'expired', end_reason: 'event_cancelled' });
		const { send, sent } = fakeSend();
		await mails(NOW, send);
		expect(sent).toHaveLength(1);
		expect(sent[0].text).toContain('El evento se canceló.');
	});

	it('sin configuración (o sin lista) no cierra ni ofrece nada', async () => {
		const id = await waiting('sin-lista');
		expect(await advanceWaitlist(t.db, { eventSlug: 'sin-lista', now: NOW })).toMatchObject({
			skipped: 'no-list'
		});
		expect(await advanceWaitlist(t.db, { eventSlug: 'no-existe', now: NOW })).toMatchObject({
			skipped: 'no-config'
		});
		expect((await row(id))?.status).toBe('waiting');
	});
});

describe('compra con la oferta que no se pagó', () => {
	/** Ofrece y compra con el link (Mercado Pago: la orden queda `pending` 20 min). */
	async function offeredAndBought() {
		const freed = await soldOutThenOneFree('lejos');
		const id = await waiting('lejos');
		const next = await waiting('lejos');
		await refund(freed.id);
		await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW });
		const before = await row(id);
		const config = /** @type {import('./config.js').EventTickets} */ (
			await getEventTickets('lejos')
		);
		const type = config.types[0];
		const at = NOW + H;
		const r = await reserveOrder(t.db, {
			eventSlug: 'lejos',
			type,
			quantity: 1,
			holders: [{ name: 'Quien compra', pronouns: 'elle' }],
			buyer: { name: 'Quien compra', email: 'compra@example.com', dni: '30000000' },
			method: 'mercadopago',
			limits: BIG,
			now: at,
			waitlist: waitlistGuard(config, type, await getTaken(t.db, 'lejos', at), at, id)
		});
		expect(r.ok).toBe(true);
		expect((await row(id))?.status).toBe('purchased');
		return { id, next, before, order: /** @type {any} */ (r).order, at };
	}

	it('vuelve a `offered` con el mismo vencimiento y el mismo link, sin otro mail de oferta', async () => {
		const { id, next, before, at } = await offeredAndBought();
		const { send, sent } = fakeSend();
		await mails(NOW, send);
		// La reserva de MP venció sin pagar.
		const later = at + HOLD_MS + MIN;
		const r = await advanceWaitlist(t.db, { eventSlug: 'lejos', now: later });
		expect(r).toMatchObject({ restored: 1, offered: 0 });
		expect(await row(id)).toMatchObject({
			status: 'offered',
			order_id: null,
			hold_until: before?.hold_until,
			offer_count: 1,
			offer_token_hash: before?.offer_token_hash
		});
		expect((await row(next))?.status).toBe('waiting');
		const token = await offerToken(t.db, id, 1);
		expect((await findOffer(t.db, { token, eventSlug: 'lejos', now: later })).state).toBe('valid');
		await mails(later, send);
		expect(sent.map((m) => m.key)).toEqual([`waitlist-offer-${id}-1`]);
	});

	it('una orden cancelada también la devuelve; pasado su vencimiento original, no', async () => {
		const { id, order, before } = await offeredAndBought();
		await t.db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?1").bind(order.id).run();
		const deadline = /** @type {number} */ (before?.hold_until);
		// Pasado el vencimiento: queda comprada (no vuelve) y la lista sigue con quien seguía.
		const r = await advanceWaitlist(t.db, { eventSlug: 'lejos', now: deadline });
		expect(r.restored).toBe(0);
		expect((await row(id))?.status).toBe('purchased');
	});

	it('una orden rechazada sigue guardando el lugar hasta que vence: no vuelve antes', async () => {
		const { id, next, order, at } = await offeredAndBought();
		await t.db.prepare("UPDATE orders SET status = 'rejected' WHERE id = ?1").bind(order.id).run();
		// Sin nadie más vivo en la lista, el cron no tiene por qué mirar el evento.
		await t.db
			.prepare(
				"UPDATE waitlist_entries SET status = 'cancelled', end_reason = 'left', ended_at = ?2 WHERE id = ?1"
			)
			.bind(next, at)
			.run();
		const before = at + HOLD_MS - MIN;
		expect(await waitlistEventsToSweep(t.db, before)).toEqual([]);
		expect((await advanceWaitlist(t.db, { eventSlug: 'lejos', now: before })).restored).toBe(0);
		expect(await row(id)).toMatchObject({ status: 'purchased', order_id: order.id });
		// Vencida la reserva rechazada, sí vuelve.
		const later = at + HOLD_MS + MIN;
		expect(await waitlistEventsToSweep(t.db, later)).toEqual(['lejos']);
		expect((await advanceWaitlist(t.db, { eventSlug: 'lejos', now: later })).restored).toBe(1);
		expect(await row(id)).toMatchObject({ status: 'offered', order_id: null });
	});

	it('rechazada y después aprobada (reintento del pago): queda comprada con su orden', async () => {
		const { id, order, at } = await offeredAndBought();
		await t.db.prepare("UPDATE orders SET status = 'rejected' WHERE id = ?1").bind(order.id).run();
		expect((await advanceWaitlist(t.db, { eventSlug: 'lejos', now: at + MIN })).restored).toBe(0);
		await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(order.id).run();
		expect((await advanceWaitlist(t.db, { eventSlug: 'lejos', now: at + 2 * MIN })).restored).toBe(
			0
		);
		expect(await row(id)).toMatchObject({ status: 'purchased', order_id: order.id });
	});

	it('mientras la orden sigue vigente, no vuelve', async () => {
		const { id, at } = await offeredAndBought();
		expect(
			(await advanceWaitlist(t.db, { eventSlug: 'lejos', now: at + HOLD_MS - MIN })).restored
		).toBe(0);
		expect((await row(id))?.status).toBe('purchased');
	});
});

describe('anotaciones sin confirmar', () => {
	it('se borran pasadas las 48 h; las más nuevas quedan', async () => {
		/** @param {number} expires */
		const pending = async (expires) => {
			const id = crypto.randomUUID();
			await t.db
				.prepare(
					`INSERT INTO waitlist_entries (id, event_slug, email, status, confirm_hash,
						confirm_expires_at, created_at, updated_at)
					VALUES (?1, 'lejos', ?2, 'pending_confirmation', ?3, ?4, ?5, ?5)`
				)
				.bind(id, `sin${++n}@example.com`, 'a'.repeat(63) + (n % 10), expires, NOW - 48 * H)
				.run();
			return id;
		};
		const old = await pending(NOW);
		const fresh = await pending(NOW + H);
		expect((await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW })).deleted).toBe(1);
		expect(await row(old)).toBeNull();
		expect((await row(fresh))?.status).toBe('pending_confirmation');
		// El cron también mira los eventos que solo tienen anotaciones sin confirmar.
		expect(await runWaitlistCron(t.db, { enabled: true, now: NOW + 2 * H })).toMatchObject({
			events: 1,
			deleted: 1
		});
		expect(await row(fresh)).toBeNull();
	});
});

describe('el cron', () => {
	it('con el interruptor apagado no hace nada', async () => {
		const freed = await soldOutThenOneFree('lejos');
		await waiting('lejos');
		await refund(freed.id);
		expect(await runWaitlistCron(t.db, { enabled: false, now: NOW })).toBeNull();
		expect(await statuses('lejos')).toEqual({ waiting: 1 });
	});

	it('avanza cada evento con anotaciones vivas; uno que falla no frena a los demás', async () => {
		const freed = await soldOutThenOneFree('lejos');
		await waiting('lejos');
		await waiting('tipo', { type: 'general' });
		await refund(freed.id);
		const configOf = async (/** @type {string} */ slug) => {
			if (slug === 'tipo') throw new Error('falla inventada');
			return getEventTickets(slug);
		};
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await runWaitlistCron(t.db, { enabled: true, now: NOW, configOf })).toMatchObject({
			events: 2,
			failed: 1,
			offered: 1
		});
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it('la tanda: los mails de la lista van primero y comparten el límite', async () => {
		const freed = await soldOutThenOneFree('cerca');
		for (let i = 0; i < 7; i++) await waiting('cerca');
		await refund(freed.id);
		await advanceWaitlist(t.db, { eventSlug: 'cerca', now: NOW });
		const { send, sent } = fakeSend();
		/** @type {number[]} */
		const reminderLimits = [];
		const run = () =>
			runMailQueueWith(t.db, {
				limit: 5,
				sendWaitlist: (limit) => mails(NOW, send, limit),
				sendReminders: async (limit) => {
					reminderLimits.push(limit);
					return { sent: Math.min(limit, 1), failed: 0, remaining: 0 };
				},
				sendStreamLink: async () => ({ sent: 0, failed: 0, remaining: 0 })
			});
		expect(await run()).toMatchObject({
			limit: 5,
			waitlist: { sent: 5, failed: 0, remaining: 2 },
			reminders: { sent: 0, failed: 0, remaining: 0 }
		});
		expect(await run()).toMatchObject({
			waitlist: { sent: 2, failed: 0, remaining: 0 },
			reminders: { sent: 1 }
		});
		expect(reminderLimits).toEqual([0, 3]);
		expect(sent).toHaveLength(7);
		expect(new Set(sent.map((m) => m.to)).size).toBe(7);
	});

	it('un mail que falla se reintenta en la próxima tanda', async () => {
		const freed = await soldOutThenOneFree('lejos');
		const id = await waiting('lejos');
		await refund(freed.id);
		await advanceWaitlist(t.db, { eventSlug: 'lejos', now: NOW });
		const bad = fakeSend('failed');
		expect(await mails(NOW, bad.send)).toEqual({ sent: 0, failed: 1, remaining: 0 });
		const good = fakeSend();
		expect(await mails(NOW + MIN, good.send)).toEqual({ sent: 1, failed: 0, remaining: 0 });
		expect(good.sent[0].key).toBe(`waitlist-offer-${id}-1`);
	});
});

describe('el empujón', () => {
	it('avanza la lista en el momento y como mucho una vez por minuto y evento', async () => {
		const freed = await soldOutThenOneFree('lejos');
		const first = await waiting('lejos');
		const second = await waiting('lejos');
		await refund(freed.id);
		/** @type {Promise<unknown>[]} */
		const waited = [];
		const platform = /** @type {any} */ ({
			env: { DB: t.db },
			ctx: { waitUntil: (/** @type {Promise<unknown>} */ p) => waited.push(p) }
		});
		const outcome = queueWaitlistAdvance({ platform, eventSlug: 'lejos', now: NOW });
		expect(waited).toHaveLength(1);
		expect(await outcome).toBe('done');
		expect((await row(first))?.status).toBe('offered');
		// Sale de la lista enseguida: el segundo empujón del mismo minuto no hace nada.
		await leaveWaitlist(t.db, first, { now: NOW + 1000 });
		expect(await queueWaitlistAdvance({ db: t.db, eventSlug: 'lejos', now: NOW + 2000 })).toBe(
			'throttled'
		);
		expect((await row(second))?.status).toBe('waiting');
		expect(await queueWaitlistAdvance({ db: t.db, eventSlug: 'lejos', now: NOW + MIN })).toBe(
			'done'
		);
		expect((await row(second))?.status).toBe('offered');
	});

	it('con `fetch` y `origin` manda los mails de ese evento', async () => {
		const freed = await soldOutThenOneFree('lejos');
		await waiting('lejos');
		await refund(freed.id);
		const fetchFn = vi.fn(async () => new Response('{"id":"x"}', { status: 200 }));
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(
			await queueWaitlistAdvance({
				db: t.db,
				eventSlug: 'lejos',
				fetch: /** @type {any} */ (fetchFn),
				origin: ORIGIN,
				now: NOW
			})
		).toBe('done');
		const row = await t.db
			.prepare("SELECT kind, round FROM waitlist_sends WHERE status IN ('sent', 'retry')")
			.first();
		expect(row).toMatchObject({ kind: 'offer', round: 1 });
		log.mockRestore();
		err.mockRestore();
	});

	it('apagado o sin nadie en la lista: no hace nada (ni gasta el límite)', async () => {
		flag.on = false;
		expect(await queueWaitlistAdvance({ db: t.db, eventSlug: 'lejos', now: NOW })).toBe('off');
		flag.on = true;
		expect(await queueWaitlistAdvance({ db: t.db, eventSlug: 'lejos', now: NOW })).toBe('idle');
		const { results } = await t.db.prepare('SELECT bucket FROM rate_limits').all();
		expect(results).toEqual([]);
		expect(await queueWaitlistAdvance({ eventSlug: 'lejos' })).toBe('no-db');
	});

	it('nunca tira: un error queda en el log', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = /** @type {any} */ ({
			prepare: () => {
				throw new Error('base rota inventada');
			}
		});
		expect(await queueWaitlistAdvance({ db: broken, eventSlug: 'lejos', now: NOW })).toBe('error');
		expect(err).toHaveBeenCalled();
		err.mockRestore();
	});
});
