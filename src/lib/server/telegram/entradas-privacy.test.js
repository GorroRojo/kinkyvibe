/**
 * «🎟 Mis entradas» con la base (D1 de miniflare; datos inventados): cada chat ve solo las
 * entradas de **su** cuenta vinculada (compras con la cuenta o con su mail verificado, como Mi
 * rincón), solo de compras aprobadas, y ningún botón armado a mano (el id de otra entrada, de otra
 * cuenta) muestra una entrada ajena ni su token. Sin chat vinculado, con la cuenta borrada o en un
 * grupo, nada.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { planUpdate } from './router.js';
import { shortHash } from './nav.js';
import { accountTickets, botTickets } from './tickets.js';
import { saveObject } from '$lib/server/objects/save.js';
import { setPerPartTickets, setWorkshopParts } from '$lib/server/eventos/partes.js';
import { isPastTicket } from './misEntradas.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// Los datos del evento (título, fecha, tipos): lo de la base de eventos se prueba en tickets/.
vi.mock('$lib/server/tickets/events.js', () => ({
	getEventTickets: async (/** @type {string} */ slug) =>
		slug === 'evento-borrado'
			? null
			: {
					title: slug === 'taller-inventado' ? 'Taller inventado' : 'Fiesta inventada',
					start:
						slug === 'fiesta-pasada' ? '2030-12-01T23:00:00-03:00' : '2031-01-10T21:00:00-03:00',
					online: false,
					types: [{ id: 'general', name: 'General' }]
				}
}));

const NOW = Date.parse('2031-01-08T12:00:00-03:00');
const ORIGIN = 'https://ejemplo.test';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const MAIL_A = 'persona-a@example.com';
const MAIL_B = 'persona-b@example.com';
const MAIL_C = 'persona-c@example.com';

/** Un token inventado de 43 caracteres. @param {string} ch */
const tok = (ch) => ch.repeat(43);

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

let seq = 0;
/**
 * Una compra con sus entradas.
 *
 * @param {{ account?: string | null, email: string, status?: string, slug?: string,
 *   tickets: { id: string, token: string, holder: string }[] }} o
 */
async function order({
	account = null,
	email,
	status = 'approved',
	slug = 'taller-inventado',
	tickets
}) {
	const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
				buyer_name, buyer_email, status, created_at, updated_at, expires_at, account_id)
			VALUES (?1, ?2, 'general', ?3, 1000, ?4, ?4, 'Persona Inventada', ?5, ?6, ?7, ?7, ?7, ?8)`
		)
		.bind(id, slug, tickets.length, 1000 * tickets.length, email, status, NOW - seq, account)
		.run();
	for (const [i, tk] of tickets.entries()) {
		await t.db
			.prepare(
				`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, token, code)
				VALUES (?1, ?2, ?3, 'general', ?4, ?5, ?6)`
			)
			.bind(tk.id, id, slug, tk.holder, tk.token, `AB${seq}${i}`.padEnd(6, 'X'))
			.run();
	}
	return id;
}

beforeEach(async () => {
	await resetDB(t.db);
	seq = 0;
	const accounts = [
		[A, MAIL_A, NOW],
		[B, MAIL_B, NOW],
		// C: el mail sin verificar.
		[C, MAIL_C, null]
	];
	for (const [id, email, verified] of accounts) {
		await t.db
			.prepare(
				'INSERT INTO accounts (id, email, email_verified_at, created_at, updated_at) VALUES (?1, ?2, ?3, 1, 1)'
			)
			.bind(id, email, verified)
			.run();
	}
	for (const [account, chat] of [
		[A, '42'],
		[B, '43'],
		[C, '45']
	]) {
		await t.db
			.prepare(
				'INSERT INTO telegram_chats (account_id, chat_id, linked_at, muted, updated_at) VALUES (?1, ?2, 1, 0, 1)'
			)
			.bind(account, chat)
			.run();
	}
	// A: una compra con la cuenta y una con su mail verificado (sin cuenta), aprobadas.
	await order({
		account: A,
		email: MAIL_A,
		tickets: [{ id: 'ticket-a1', token: tok('a'), holder: 'Persona A Uno' }]
	});
	await order({
		email: MAIL_A.toUpperCase(),
		slug: 'fiesta-inventada',
		tickets: [{ id: 'ticket-a2', token: tok('b'), holder: 'Persona A Dos' }]
	});
	// A: una pasada, una reembolsada y una que espera la transferencia (sin entradas que valgan).
	await order({
		account: A,
		email: MAIL_A,
		slug: 'fiesta-pasada',
		tickets: [{ id: 'ticket-a3', token: tok('c'), holder: 'Persona A Pasada' }]
	});
	await order({
		account: A,
		email: MAIL_A,
		status: 'refunded',
		tickets: [{ id: 'ticket-a4', token: tok('d'), holder: 'Persona A Reembolso' }]
	});
	await order({
		account: A,
		email: MAIL_A,
		status: 'awaiting_transfer',
		tickets: [{ id: 'ticket-a5', token: tok('e'), holder: 'Persona A Espera' }]
	});
	// B: la suya.
	await order({
		account: B,
		email: MAIL_B,
		tickets: [{ id: 'ticket-b1', token: tok('f'), holder: 'Persona B Uno' }]
	});
	// Con el mail de C (sin verificar) y sin cuenta: no es de C.
	await order({
		email: MAIL_C,
		tickets: [{ id: 'ticket-c1', token: tok('g'), holder: 'Persona C Uno' }]
	});
});

const deps = () => ({
	listUpcoming: async () => [],
	origin: ORIGIN,
	now: () => NOW,
	botUsername: 'BotDePrueba',
	media: true,
	accounts: async () => ({
		link: vi.fn(),
		unlink: vi.fn(),
		setMuted: vi.fn(),
		tickets: botTickets(t.db)
	})
});

/** @param {string} data @param {number} [chat] @param {string} [type] */
const tap = (data, chat = 42, type = 'private') => ({
	callback_query: {
		id: 'cb',
		from: { id: 77 },
		data,
		message: { message_id: 9, chat: { id: chat, type } }
	}
});
/** @param {string} text @param {number} [chat] @param {string} [type] */
const msg = (text, chat = 42, type = 'private') => ({
	message: { chat: { id: chat, type }, from: { id: 77 }, text }
});

/** Todo lo que el plan manda, como texto (sin la foto). @param {any} plan */
const sent = (plan) => JSON.stringify(plan, (k, v) => (k === 'upload' ? '[foto]' : v));

const OTHERS = [tok('d'), tok('e'), tok('f'), tok('g')];

describe('accountTickets', () => {
	it('las de compras aprobadas de la cuenta: con la cuenta o con su mail verificado', async () => {
		const list = await accountTickets(t.db, A);
		expect(list.map((x) => x.holder).sort()).toEqual([
			'Persona A Dos',
			'Persona A Pasada',
			'Persona A Uno'
		]);
		expect(list.find((x) => x.holder === 'Persona A Uno')).toMatchObject({
			id: shortHash('ticket-a1'),
			token: tok('a'),
			type: 'General',
			title: 'Taller inventado'
		});
		// Sin los datos de quien compró.
		expect(JSON.stringify(list)).not.toContain('@example.com');
	});

	it('la entrada de un taller en varias partes trae las fechas de todas (sigue próxima entre partes)', async () => {
		/** @param {string} slug @param {string} start @param {Record<string, unknown>} [data] */
		const event = (slug, start, data = {}) =>
			saveObject(
				t.db,
				{
					type: 'evento',
					slug,
					title: `Evento ${slug}`,
					data: { start, ...data },
					visibility: 'public'
				},
				{ actor: 'admin-de-prueba' }
			);
		await event('taller-inventado', '2031-01-10T21:00:00-03:00');
		await event('taller-inventado-parte-2', '2031-01-17T21:00:00-03:00');
		await event('taller-inventado-parte-3', '2031-01-24T21:00:00-03:00', { status: 'cancelado' });
		expect(
			await setWorkshopParts(t.db, {
				eventSlug: 'taller-inventado',
				partSlugs: ['taller-inventado-parte-2', 'taller-inventado-parte-3'],
				by: 'admin-de-prueba'
			})
		).toEqual({ ok: true });
		const mine = async () =>
			(await accountTickets(t.db, A)).find((x) => x.holder === 'Persona A Uno');
		const ticket = await mine();
		expect(ticket?.parts).toEqual([
			{ n: 1, start: '2031-01-10T21:00:00-03:00', end: null, cancelled: false },
			{ n: 2, start: '2031-01-17T21:00:00-03:00', end: null, cancelled: false },
			{ n: 3, start: '2031-01-24T21:00:00-03:00', end: null, cancelled: true }
		]);
		expect(isPastTicket(/** @type {any} */ (ticket), Date.parse('2031-01-12T12:00:00-03:00'))).toBe(
			false
		);
		// Las otras, de eventos sueltos, sin partes.
		const others = (await accountTickets(t.db, A)).filter((x) => x.holder !== 'Persona A Uno');
		for (const x of others) expect(x.parts).toBeUndefined();
		// Con «Entradas por parte», cada parte vende la suya: la entrada del taller es solo de la 1.
		await setPerPartTickets(t.db, {
			eventSlug: 'taller-inventado',
			perPart: true,
			by: 'admin-de-prueba'
		});
		expect((await mine())?.parts).toBeUndefined();
	});

	it('un mail sin verificar no trae compras; otra cuenta, solo lo suyo', async () => {
		expect(await accountTickets(t.db, C)).toEqual([]);
		expect((await accountTickets(t.db, B)).map((x) => x.token)).toEqual([tok('f')]);
	});
});

describe('el bot, con la base', () => {
	it('la lista del chat 42: solo las de su cuenta, de los próximos eventos', async () => {
		const p = await planUpdate(msg('/entradas'), deps());
		const out = sent(p);
		expect(out).toContain('Taller inventado');
		expect(out).toContain('Fiesta inventada');
		expect(out).toContain(`tk:${shortHash('ticket-a1')}:u`);
		expect(out).not.toContain(shortHash('ticket-b1'));
		expect(out).not.toContain(shortHash('ticket-c1'));
		expect(out).not.toContain(shortHash('ticket-a4'));
		expect(out).not.toContain(shortHash('ticket-a5'));
		for (const token of OTHERS) expect(out).not.toContain(token);
	});

	it('la tarjeta de una entrada propia: su QR y su página', async () => {
		const p = await planUpdate(tap(`tk:${shortHash('ticket-a1')}:u`), deps());
		const step = /** @type {any} */ (p?.steps[0]);
		expect(step.method).toBe('editMessageMedia');
		expect(step.qr.type).toBe('image/png');
		expect(sent(p)).toContain(`${ORIGIN}/entradas/t/${tok('a')}`);
	});

	it('botones armados a mano con entradas ajenas (otra cuenta, reembolsada, sin verificar): nada', async () => {
		for (const id of ['ticket-b1', 'ticket-c1', 'ticket-a4', 'ticket-a5']) {
			for (const view of ['u', 'o']) {
				const p = await planUpdate(tap(`tk:${shortHash(id)}:${view}`), deps());
				expect(p).toEqual({
					steps: [],
					callback: { id: 'cb', text: 'Esa entrada ya no está acá.' }
				});
			}
		}
	});

	it('el chat de otra cuenta no ve las de la 42, ni con su botón', async () => {
		const p = await planUpdate(tap(`tk:${shortHash('ticket-a1')}:u`, 43), deps());
		expect(sent(p)).not.toContain(tok('a'));
		expect(p?.callback?.text).toBe('Esa entrada ya no está acá.');
		const list = await planUpdate(msg('/entradas', 43), deps());
		expect(sent(list)).toContain('Persona B Uno');
		expect(sent(list)).not.toContain('Persona A');
	});

	it('un chat sin vincular o de una cuenta borrada: cómo conectar, ninguna entrada', async () => {
		const unlinked = await planUpdate(msg('/entradas', 44), deps());
		expect(sent(unlinked)).toContain('conectá este chat con tu cuenta');
		await t.db
			.prepare(
				'UPDATE accounts SET deleted_at = 1, email = NULL, email_verified_at = NULL WHERE id = ?1'
			)
			.bind(A)
			.run();
		for (const update of [msg('/entradas'), tap(`tk:${shortHash('ticket-a1')}:u`)]) {
			const p = await planUpdate(update, deps());
			expect(sent(p)).toContain('conectá este chat con tu cuenta');
			expect(sent(p)).not.toContain(tok('a'));
		}
	});

	it('en un grupo (aunque el id coincida con un chat vinculado): nada de la cuenta', async () => {
		for (const update of [
			msg('/entradas', 42, 'supergroup'),
			tap('t:u:0', 42, 'supergroup'),
			tap(`tk:${shortHash('ticket-a1')}:u`, 42, 'group')
		]) {
			const out = sent(await planUpdate(update, deps()));
			expect(out).not.toContain('Taller inventado');
			expect(out).not.toContain(tok('a'));
		}
	});
});
