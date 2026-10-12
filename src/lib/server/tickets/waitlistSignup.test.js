/**
 * Anotarse en la lista de espera (waitlistSignup.js): cuándo se puede, los límites, la misma
 * respuesta esté o no el mail anotado, con cuenta directo a la fila, y los links de confirmar,
 * salir y volver a anotarse. D1 de miniflare; eventos y mails inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { fakeSend, insertOrder, linkIn } from '$lib/server/series/fixtures.js';
import { parseTicketConfig } from './config.js';
import { WAITLIST_CONFIRM_TTL_MS, endWaitlistEntry, joinWaitlist } from './waitlist.js';
import { waitlistLeaveUrl, waitlistRejoinUrl } from './waitlistMail.js';
import {
	WAITLIST_MESSAGES,
	WAITLIST_SIGNUP_LIMITS,
	confirmByToken,
	leaveByToken,
	rejoinByToken,
	signUpForWaitlist,
	waitlistJoinStates
} from './waitlistSignup.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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
});

const NOW = Date.parse('2026-10-11T12:00:00Z');
const H = 60 * 60 * 1000;
const SLUG = 'fiesta-de-prueba';
const EMAIL = 'persona@example.com';
const ORIGIN = 'https://kinkyvibe.example';
const CLIENT = 'cliente-de-prueba';

/**
 * Un evento con lista (por evento salvo que se pida otra cosa), dentro de 10 días.
 * @param {Record<string, unknown>} [over]
 */
function config(over = {}) {
	const c = parseTicketConfig({
		title: 'Fiesta <b>de</b> prueba',
		start: new Date(NOW + 10 * 24 * H).toISOString(),
		status: 'abierto',
		payment_methods: ['mercadopago'],
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 2 }],
		lista_espera: 'evento',
		...over
	});
	if (!c) throw new Error('config inválida');
	return c;
}

/** Vende `n` entradas generales (órdenes aprobadas inventadas). @param {number} n */
async function sell(n, type = 'general') {
	for (let i = 0; i < n; i++) {
		const id = await insertOrder(t.db, { email: `compra${i}@example.com`, slug: SLUG, now: NOW });
		if (type !== 'general')
			await t.db.prepare('UPDATE orders SET ticket_type = ?2 WHERE id = ?1').bind(id, type).run();
	}
}

/** @param {Partial<Parameters<typeof signUpForWaitlist>[0]>} [over] */
function signUp(over = {}) {
	const send = over.send ?? fakeSend();
	return signUpForWaitlist({
		db: t.db,
		eventSlug: SLUG,
		config: config(),
		email: EMAIL,
		client: CLIENT,
		send,
		origin: ORIGIN,
		now: NOW,
		...over
	});
}

async function entries() {
	const { results } = await t.db
		.prepare(
			'SELECT id, email, status, ticket_type, client_hash FROM waitlist_entries ORDER BY created_at, id'
		)
		.all();
	return results;
}

describe('waitlistJoinStates: cuándo se puede anotar', () => {
	it('con lugar, «available»; agotado, «open»; la fila cuenta como vendido (por evento, contra el total)', async () => {
		expect(await waitlistJoinStates(t.db, SLUG, config(), NOW)).toEqual([
			{ ticketType: null, name: null, state: 'available' }
		]);
		await sell(2);
		expect((await waitlistJoinStates(t.db, SLUG, config(), NOW))[0].state).toBe('open');
		// Dos tipos: 1 lugar libre en total y 1 persona esperando = agotado para el público.
		const two = config({
			tickets: [
				{ id: 'general', name: 'General', price: 10000, capacity: 2 },
				{ id: 'vip', name: 'VIP', price: 20000, capacity: 1 }
			]
		});
		expect((await waitlistJoinStates(t.db, SLUG, two, NOW))[0].state).toBe('available');
		await joinWaitlist(t.db, { eventSlug: SLUG, email: 'a@example.com', now: NOW });
		// Sin confirmar no guarda nada.
		expect((await waitlistJoinStates(t.db, SLUG, two, NOW))[0].state).toBe('available');
		await t.db
			.prepare(
				"UPDATE waitlist_entries SET status = 'waiting', confirmed_at = ?1, confirm_hash = NULL"
			)
			.bind(NOW)
			.run();
		expect((await waitlistJoinStates(t.db, SLUG, two, NOW))[0].state).toBe('open');
	});

	it('un tipo sin cupo nunca se agota; «agotadas» a mano, sí', async () => {
		const unlimited = config({
			tickets: [
				{ id: 'general', name: 'General', price: 10000, capacity: 2 },
				{ id: 'libre', name: 'Libre', price: 1000 }
			]
		});
		await sell(2);
		expect((await waitlistJoinStates(t.db, SLUG, unlimited, NOW))[0].state).toBe('available');
		expect(
			(await waitlistJoinStates(t.db, SLUG, config({ status: 'agotadas' }), NOW))[0].state
		).toBe('open');
	});

	it('cierra 30 minutos antes del comienzo, al cerrar la venta o con el evento cancelado; antes de abrir, «notyet»', async () => {
		await sell(2);
		const start = NOW + 20 * 60 * 1000;
		expect(
			(
				await waitlistJoinStates(t.db, SLUG, config({ start: new Date(start).toISOString() }), NOW)
			)[0].state
		).toBe('closed');
		expect(
			(
				await waitlistJoinStates(
					t.db,
					SLUG,
					config({ start: new Date(NOW + 31 * 60 * 1000).toISOString() }),
					NOW
				)
			)[0].state
		).toBe('open');
		expect(
			(await waitlistJoinStates(t.db, SLUG, config({ status: 'cancelado' }), NOW))[0].state
		).toBe('closed');
		expect(
			(
				await waitlistJoinStates(
					t.db,
					SLUG,
					config({ tickets_close: new Date(NOW - H).toISOString() }),
					NOW
				)
			)[0].state
		).toBe('closed');
		expect(
			(
				await waitlistJoinStates(
					t.db,
					SLUG,
					config({ tickets_open: new Date(NOW + H).toISOString() }),
					NOW
				)
			)[0].state
		).toBe('notyet');
		expect(await waitlistJoinStates(t.db, SLUG, config({ lista_espera: undefined }), NOW)).toEqual(
			[]
		);
	});

	it('por tipo: un alcance por cada tipo con cupo, cada uno con lo suyo', async () => {
		const typed = config({
			lista_espera: 'tipo',
			tickets: [
				{ id: 'general', name: 'General', price: 10000, capacity: 2 },
				{ id: 'vip', name: 'VIP', price: 20000, capacity: 1 },
				{ id: 'libre', name: 'Libre', price: 1000 }
			]
		});
		await sell(2);
		expect(await waitlistJoinStates(t.db, SLUG, typed, NOW)).toEqual([
			{ ticketType: 'general', name: 'General', state: 'open' },
			{ ticketType: 'vip', name: 'VIP', state: 'available' }
		]);
	});
});

describe('signUpForWaitlist', () => {
	beforeEach(async () => {
		await sell(2);
	});

	it('sin cuenta: queda sin confirmar y le llega el mail con confirmar y salir', async () => {
		const send = fakeSend();
		expect(await signUp({ send })).toEqual({ ok: true, status: 'pending' });
		expect(await entries()).toEqual([
			expect.objectContaining({
				email: EMAIL,
				status: 'pending_confirmation',
				ticket_type: null,
				client_hash: CLIENT
			})
		]);
		expect(send.sent).toHaveLength(1);
		const [mail] = send.sent;
		expect(mail.to).toBe(EMAIL);
		expect(mail.key).toBeUndefined();
		expect(mail.subject).toBe('Confirmá tu lugar en la lista de espera · Fiesta <b>de</b> prueba');
		expect(linkIn(mail.text, '/lista-de-espera/confirmar/')).toMatch(
			/\/confirmar\/[A-Za-z0-9_-]{43}$/
		);
		expect(linkIn(mail.text, '/lista-de-espera/salir/')).toBeTruthy();
	});

	it('la misma respuesta esté o no el mail anotado; si ya está en la fila, no se le manda nada', async () => {
		const send = fakeSend();
		const first = await signUp({ send });
		// Otra vez sin confirmar: mismo mensaje y un link nuevo (el viejo deja de valer).
		const second = await signUp({ send });
		expect(second).toEqual(first);
		expect(send.sent).toHaveLength(2);
		const oldToken = String(linkIn(send.sent[0].text, '/lista-de-espera/confirmar/'))
			.split('/')
			.pop();
		const newToken = String(linkIn(send.sent[1].text, '/lista-de-espera/confirmar/'))
			.split('/')
			.pop();
		expect(await confirmByToken(t.db, oldToken, NOW + 1)).toBeNull();
		expect(await confirmByToken(t.db, newToken, NOW + 1)).not.toBeNull();
		// Ya en la fila: igual, sin mail y sin gastar el cupo de mails de esa dirección.
		for (let i = 0; i < 5; i++) expect(await signUp({ send, client: `otro-${i}` })).toEqual(first);
		expect(send.sent).toHaveLength(2);
		expect((await entries()).map((e) => e.status)).toEqual(['waiting']);
	});

	it('con cuenta y su mail verificado: directo a la fila, sin mail', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL);
		const send = fakeSend();
		const member = { id: account.id, email: EMAIL };
		expect(await signUp({ send, member, email: ' Persona@Example.com ' })).toEqual({
			ok: true,
			status: 'waiting'
		});
		expect(await signUp({ send, member })).toEqual({ ok: true, status: 'waiting' });
		expect(send.sent).toHaveLength(0);
		expect((await entries()).map((e) => e.status)).toEqual(['waiting']);
		// Con otro mail que el de la cuenta: hay que confirmarlo.
		expect(await signUp({ send, member, email: 'otro@example.com' })).toEqual({
			ok: true,
			status: 'pending'
		});
		expect(send.sent.map((m) => m.to)).toEqual(['otro@example.com']);
	});

	it('límites: mails de confirmar a una dirección por día', async () => {
		const send = fakeSend();
		for (let i = 0; i < WAITLIST_SIGNUP_LIMITS.email.limit; i++)
			expect((await signUp({ send, client: `c-${i}` })).ok).toBe(true);
		expect(await signUp({ send, client: 'c-otra' })).toEqual({
			ok: false,
			status: 429,
			message: WAITLIST_MESSAGES.tooMany
		});
		expect(send.sent).toHaveLength(WAITLIST_SIGNUP_LIMITS.email.limit);
	});

	it('límites: pedidos por conexión, y anotaciones vivas por evento desde una conexión', async () => {
		const send = fakeSend();
		for (let i = 0; i < WAITLIST_SIGNUP_LIMITS.perEvent; i++)
			expect(await signUp({ send, email: `p${i}@example.com` })).toEqual({
				ok: true,
				status: 'pending'
			});
		const r = await signUp({ send, email: 'una.mas@example.com' });
		expect(r).toMatchObject({ ok: false, status: 429 });
		expect(send.sent).toHaveLength(WAITLIST_SIGNUP_LIMITS.perEvent);
		// Por conexión, para cualquier evento y mail: el pedido 11 de la hora no pasa.
		const other = 'otra-conexion';
		for (let i = 0; i < WAITLIST_SIGNUP_LIMITS.client.limit; i++)
			await signUp({ send, client: other, email: 'p0@example.com' });
		expect(await signUp({ send, client: other, email: 'nueva@example.com' })).toMatchObject({
			ok: false,
			status: 429
		});
		expect(
			await signUp({ send, client: other, email: 'nueva@example.com', now: NOW + 61 * 60 * 1000 })
		).toMatchObject({ ok: true });
	});

	it('mail inválido, evento con lugar, sin lista, tipo que no es de la lista y mail que no sale', async () => {
		expect(await signUp({ email: 'no-es-un-mail' })).toMatchObject({ ok: false, status: 400 });
		await resetDB(t.db);
		expect(await signUp()).toEqual({
			ok: false,
			status: 409,
			message: WAITLIST_MESSAGES.available
		});
		await sell(2);
		expect(await signUp({ config: config({ lista_espera: undefined }) })).toMatchObject({
			status: 404
		});
		const typed = config({ lista_espera: 'tipo' });
		expect(await signUp({ config: typed, ticketType: 'otro' })).toEqual({
			ok: false,
			status: 400,
			message: WAITLIST_MESSAGES.badType
		});
		const send = fakeSend('failed');
		expect(await signUp({ config: typed, ticketType: 'general', send })).toEqual({
			ok: false,
			status: 502,
			message: WAITLIST_MESSAGES.mailFailed
		});
		expect(send.sent[0].text).toContain('Entrada: General');
		expect(await entries()).toEqual([expect.objectContaining({ ticket_type: 'general' })]);
		expect(await signUp({ config: config({ status: 'cancelado' }) })).toEqual({
			ok: false,
			status: 409,
			message: WAITLIST_MESSAGES.closed
		});
	});
});

describe('confirmar, salir y volver a anotarse', () => {
	/** Anota y devuelve el token de confirmar del mail. */
	async function pending(email = EMAIL) {
		await sell(2);
		const send = fakeSend();
		await signUp({ send, email });
		return String(linkIn(send.sent[0].text, '/lista-de-espera/confirmar/')).split('/').pop();
	}

	it('confirmar: entra a la fila; el link usado o vencido no sirve', async () => {
		const token = await pending();
		expect(await confirmByToken(t.db, token, NOW + WAITLIST_CONFIRM_TTL_MS)).toBeNull();
		expect(await confirmByToken(t.db, token, NOW + 1)).toEqual({
			id: expect.any(String),
			eventSlug: SLUG,
			ticketType: null
		});
		expect((await entries())[0].status).toBe('waiting');
		expect(await confirmByToken(t.db, token, NOW + 2)).toBeNull();
		expect(await confirmByToken(t.db, 'inventado', NOW + 2)).toBeNull();
	});

	it('salir: con la firma de verdad sale; con una inventada, no; la segunda vez, ya no estaba', async () => {
		await pending();
		const [row] = await entries();
		const id = String(row.id);
		const url = await waitlistLeaveUrl(t.db, ORIGIN, id);
		const token = url.split('/').pop();
		expect(await leaveByToken(t.db, `${id}.${'x'.repeat(32)}`)).toEqual({ ok: false });
		expect(await leaveByToken(t.db, 'basura')).toEqual({ ok: false });
		const rejoin = String((await waitlistRejoinUrl(t.db, ORIGIN, id)).split('/').pop());
		expect(await leaveByToken(t.db, rejoin)).toEqual({ ok: false });
		expect(await entries()).toHaveLength(1);
		// Sin confirmar, salir borra la anotación (nunca dio su consentimiento).
		expect(await leaveByToken(t.db, token, NOW + 1)).toEqual({
			ok: true,
			left: true,
			was: 'pending_confirmation',
			eventSlug: SLUG
		});
		expect(await entries()).toHaveLength(0);
		expect(await leaveByToken(t.db, token, NOW + 2)).toEqual({
			ok: true,
			left: false,
			was: null,
			eventSlug: null
		});
	});

	it('salir de la fila (confirmada): queda cancelled por «left»', async () => {
		const token = await pending();
		await confirmByToken(t.db, token, NOW + 1);
		const [row] = await entries();
		const leave = (await waitlistLeaveUrl(t.db, ORIGIN, String(row.id))).split('/').pop();
		expect(await leaveByToken(t.db, leave, NOW + 2)).toMatchObject({
			ok: true,
			left: true,
			was: 'waiting'
		});
		const after = await t.db.prepare('SELECT status, end_reason FROM waitlist_entries').first();
		expect(after).toEqual({ status: 'cancelled', end_reason: 'left' });
	});

	it('volver: después de que venció su lugar, al final de la fila y sin confirmar; solo con su link', async () => {
		const token = await pending();
		await confirmByToken(t.db, token, NOW + 1);
		const [row] = await entries();
		const id = String(row.id);
		// Le ofrecieron un lugar (lo hace el motor) y se le venció.
		await t.db
			.prepare(
				`UPDATE waitlist_entries SET status = 'offered', offer_count = 1, offered_at = ?2,
					hold_until = ?3, offer_token_hash = ?4 WHERE id = ?1`
			)
			.bind(id, NOW + 2, NOW + H, 'a'.repeat(64))
			.run();
		const rejoin = String((await waitlistRejoinUrl(t.db, ORIGIN, id)).split('/').pop());
		const configOf = async () => config();
		// Todavía con el lugar: no se puede «volver».
		expect(await rejoinByToken(t.db, rejoin, { configOf, now: NOW + 3 })).toEqual({
			ok: false,
			reason: 'gone'
		});
		await endWaitlistEntry(t.db, id, { reason: 'hold_expired', now: NOW + H });
		const leave = String((await waitlistLeaveUrl(t.db, ORIGIN, id)).split('/').pop());
		expect(await rejoinByToken(t.db, leave, { configOf, now: NOW + 2 * H })).toEqual({
			ok: false,
			reason: 'invalid'
		});
		expect(
			await rejoinByToken(t.db, `${id}.${'y'.repeat(32)}`, { configOf, now: NOW + 2 * H })
		).toEqual({
			ok: false,
			reason: 'invalid'
		});
		// La lista ya cerró (evento cancelado) o el evento ya no tiene lista: no.
		expect(
			await rejoinByToken(t.db, rejoin, {
				configOf: async () => config({ status: 'cancelado' }),
				now: NOW + 2 * H
			})
		).toEqual({ ok: false, reason: 'closed' });
		expect(
			await rejoinByToken(t.db, rejoin, { configOf: async () => null, now: NOW + 2 * H })
		).toEqual({ ok: false, reason: 'closed' });
		const r = await rejoinByToken(t.db, rejoin, { configOf, now: NOW + 2 * H });
		expect(r).toEqual({ ok: true, status: 'waiting', eventSlug: SLUG });
		expect(await rejoinByToken(t.db, rejoin, { configOf, now: NOW + 3 * H })).toEqual({
			ok: true,
			status: 'already',
			eventSlug: SLUG
		});
		const rows = await entries();
		expect(rows.map((e) => e.status)).toEqual(['expired', 'waiting']);
	});
});
