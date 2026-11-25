/**
 * «Con la entrada abierta ahora» (presence.js): la página de la entrada anota la última vez que
 * estuvo a la vista, la Puerta lista las de los últimos 5 minutos y el cron la borra después del
 * evento. D1 de miniflare; personas y eventos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, checkIn, reserveOrder } from './orders.js';
import {
	OPEN_NOW_MS,
	PRESENCE_MIN_GAP_MS,
	clearPresenceAfterEvents,
	inPresenceWindow,
	openNowList,
	presenceWindow,
	seenNow,
	touchTicketPresence
} from './presence.js';

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

const EVENT = 'fiesta-de-prueba';
const OTHER = 'otra-fiesta-de-prueba';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
/** El evento: sábado 10/10/2026 de 22 a 4 (hora de Argentina). */
const TONIGHT = { start: '2026-10-10T22:00-03:00', end: '2026-10-11T04:00-03:00' };
/** 21:30 del día del evento. */
const NOW = Date.parse('2026-10-10T21:30-03:00');

/** @type {Record<string, any>} */
let configs = {};
/** @param {string} slug */
const configFor = async (slug) => configs[slug] ?? null;

/**
 * Una entrada de `slug`; aprobada salvo `pay: false` (queda reservada, sin pagar).
 * @param {{ slug?: string, name?: string, pay?: boolean }} [o]
 */
async function ticketFor({ slug = EVENT, name = 'Persona Inventada', pay = true } = {}) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: slug,
			type: { id: 'general', price: 8000, capacity: 20 },
			quantity: 1,
			holders: [{ name, pronouns: 'elle' }],
			buyer: { name, pronouns: 'elle', email: 'persona@example.com', dni: '30111222' }
		})
	);
	if (!pay) {
		const { results } = await t.db
			.prepare('SELECT * FROM tickets WHERE order_id = ?1')
			.bind(r.order.id)
			.all();
		// Sin pagar todavía no hay entradas: una a mano, de una orden no aprobada.
		if (results.length) return /** @type {any} */ (results[0]);
		await t.db
			.prepare(
				`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, token, code)
				VALUES (?1, ?2, ?3, 'general', ?4, ?5, 'ZZZZZ2')`
			)
			.bind('ticket-sin-pagar', r.order.id, slug, name, 'A'.repeat(43))
			.run();
		return { id: 'ticket-sin-pagar', token: 'A'.repeat(43), order_id: r.order.id };
	}
	const { tickets } = await applyPayment(t.db, {
		id: Math.floor(Math.random() * 1e9),
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return /** @type {{ id: string, token: string, order_id: string }} */ (tickets[0]);
}

/** @param {string} id */
async function lastSeen(id) {
	const row = await t.db.prepare('SELECT last_seen_at FROM tickets WHERE id = ?1').bind(id).first();
	return row?.last_seen_at ?? null;
}

beforeEach(() => {
	configs = { [EVENT]: { ...TONIGHT }, [OTHER]: { ...TONIGHT } };
});

describe('presenceWindow', () => {
	it('desde las 00:00 del día del evento hasta el fin del día en que termina más 6 horas', () => {
		expect(presenceWindow(TONIGHT)).toEqual({
			from: Date.parse('2026-10-10T00:00-03:00'),
			to: Date.parse('2026-10-11T23:59:59.999-03:00') + 6 * HOUR
		});
		expect(inPresenceWindow(TONIGHT, Date.parse('2026-10-09T23:59-03:00'))).toBe(false);
		expect(inPresenceWindow(TONIGHT, Date.parse('2026-10-10T00:00-03:00'))).toBe(true);
		expect(inPresenceWindow(TONIGHT, Date.parse('2026-10-11T03:00-03:00'))).toBe(true);
		expect(inPresenceWindow(TONIGHT, Date.parse('2026-10-12T06:01-03:00'))).toBe(false);
	});

	it('sin evento, online o sin fecha: nunca', () => {
		expect(presenceWindow(null)).toBe(null);
		expect(presenceWindow({ ...TONIGHT, online: true })).toBe(null);
		expect(presenceWindow({})).toBe(null);
	});
});

describe('touchTicketPresence', () => {
	it('anota la última vez y la actualiza después de un minuto', async () => {
		const ticket = await ticketFor();
		expect(await touchTicketPresence(t.db, { token: ticket.token, now: NOW, configFor })).toBe(
			'ok'
		);
		expect(await lastSeen(ticket.id)).toBe(NOW);
		const later = NOW + MIN;
		expect(await touchTicketPresence(t.db, { token: ticket.token, now: later, configFor })).toBe(
			'ok'
		);
		expect(await lastSeen(ticket.id)).toBe(later);
	});

	it('como mucho una escritura por minuto: un aviso antes de tiempo no escribe', async () => {
		const ticket = await ticketFor();
		await touchTicketPresence(t.db, { token: ticket.token, now: NOW, configFor });
		let reads = 0;
		const counting = async (/** @type {string} */ slug) => {
			reads++;
			return configFor(slug);
		};
		const soon = NOW + PRESENCE_MIN_GAP_MS - 1;
		expect(
			await touchTicketPresence(t.db, { token: ticket.token, now: soon, configFor: counting })
		).toBe('recent');
		expect(await lastSeen(ticket.id)).toBe(NOW);
		// Ni siquiera lee el evento.
		expect(reads).toBe(0);
	});

	it('no anota entradas inexistentes, sin pagar, anuladas ni ya usadas', async () => {
		expect(await touchTicketPresence(t.db, { token: 'no-es-un-token', now: NOW, configFor })).toBe(
			'not-found'
		);
		expect(await touchTicketPresence(t.db, { token: 'B'.repeat(43), now: NOW, configFor })).toBe(
			'not-found'
		);

		const unpaid = await ticketFor({ pay: false });
		expect(await touchTicketPresence(t.db, { token: unpaid.token, now: NOW, configFor })).toBe(
			'void'
		);
		expect(await lastSeen(unpaid.id)).toBe(null);

		const cancelled = await ticketFor({ name: 'Persona Anulada' });
		await t.db
			.prepare(`UPDATE orders SET status = 'cancelled' WHERE id = ?1`)
			.bind(cancelled.order_id)
			.run();
		expect(await touchTicketPresence(t.db, { token: cancelled.token, now: NOW, configFor })).toBe(
			'void'
		);
		expect(await lastSeen(cancelled.id)).toBe(null);

		const used = await ticketFor({ name: 'Persona Adentro' });
		await checkIn(t.db, { token: used.token, eventSlug: EVENT, by: 'admin-de-prueba', now: NOW });
		expect(await touchTicketPresence(t.db, { token: used.token, now: NOW, configFor })).toBe(
			'used'
		);
		expect(await lastSeen(used.id)).toBe(null);
	});

	it('fuera del día del evento (antes, después, online o sin evento) no escribe', async () => {
		const ticket = await ticketFor();
		const cases = [
			Date.parse('2026-10-09T20:00-03:00'),
			Date.parse('2026-10-12T07:00-03:00'),
			Date.parse('2026-12-10T21:00-03:00')
		];
		for (const now of cases) {
			expect(await touchTicketPresence(t.db, { token: ticket.token, now, configFor })).toBe(
				'closed'
			);
		}
		configs[EVENT] = { ...TONIGHT, online: true };
		expect(await touchTicketPresence(t.db, { token: ticket.token, now: NOW, configFor })).toBe(
			'closed'
		);
		delete configs[EVENT];
		expect(await touchTicketPresence(t.db, { token: ticket.token, now: NOW, configFor })).toBe(
			'closed'
		);
		expect(await lastSeen(ticket.id)).toBe(null);
	});
});

describe('la Puerta: seenNow + openNowList', () => {
	it('lista las vistas en los últimos 5 minutos, sin las que ya entraron, la más reciente primero', async () => {
		const a = await ticketFor({ name: 'Persona A' });
		const b = await ticketFor({ name: 'Persona B' });
		const old = await ticketFor({ name: 'Persona Vieja' });
		const inside = await ticketFor({ name: 'Persona Adentro' });
		const other = await ticketFor({ slug: OTHER, name: 'Persona de Otro Evento' });
		await touchTicketPresence(t.db, { token: old.token, now: NOW - OPEN_NOW_MS - 1, configFor });
		await touchTicketPresence(t.db, { token: a.token, now: NOW - 3 * MIN, configFor });
		await touchTicketPresence(t.db, { token: b.token, now: NOW - MIN, configFor });
		await touchTicketPresence(t.db, { token: inside.token, now: NOW - MIN, configFor });
		await touchTicketPresence(t.db, { token: other.token, now: NOW - MIN, configFor });
		// Entra después de haberla abierto: deja de estar en la lista.
		await checkIn(t.db, { token: inside.token, eventSlug: EVENT, by: 'admin-de-prueba', now: NOW });

		const seen = await seenNow(t.db, EVENT, NOW);
		expect([...seen.keys()].sort()).toEqual([a.id, b.id, inside.id].sort());
		const row = (/** @type {any} */ x, /** @type {string} */ holder, at = null) => ({
			ticketId: x.id,
			holder,
			type: 'General',
			at,
			valid: true
		});
		const rows = [
			row(a, 'Persona A'),
			row(b, 'Persona B'),
			row(old, 'Persona Vieja'),
			row(inside, 'Persona Adentro', /** @type {any} */ (NOW))
		];
		expect(openNowList(rows, seen)).toEqual([
			{ ticketId: b.id, holder: 'Persona B', type: 'General', seenAt: NOW - MIN },
			{ ticketId: a.id, holder: 'Persona A', type: 'General', seenAt: NOW - 3 * MIN }
		]);
		// Una entrada que dejó de ser válida tampoco.
		expect(openNowList([{ ...rows[1], valid: false }], seen)).toEqual([]);
	});
});

describe('clearPresenceAfterEvents', () => {
	it('borra después del evento; mientras sigue, no', async () => {
		// Un evento sin fin: la ventana termina a las 6 del día siguiente.
		configs[EVENT] = { start: TONIGHT.start };
		const a = await ticketFor({ name: 'Persona A' });
		const b = await ticketFor({ slug: OTHER, name: 'Persona B' });
		await touchTicketPresence(t.db, { token: a.token, now: NOW, configFor });
		await touchTicketPresence(t.db, { token: b.token, now: NOW, configFor });
		// El otro evento se corrió a la semana siguiente: todavía no terminó.
		configs[OTHER] = { start: '2026-10-17T22:00-03:00' };

		// Durante el evento: nada.
		const during = Date.parse('2026-10-11T02:00-03:00');
		expect(await clearPresenceAfterEvents(t.db, { now: during, configFor })).toBe(0);
		expect(await lastSeen(a.id)).toBe(NOW);

		// Pasada la ventana del evento (fin del día + 6 horas): se borra la suya, no la del otro.
		const after = Date.parse('2026-10-11T06:01-03:00');
		expect(await clearPresenceAfterEvents(t.db, { now: after, configFor })).toBe(1);
		expect(await lastSeen(a.id)).toBe(null);
		expect(await lastSeen(b.id)).toBe(NOW);

		// Un valor de más de un día se borra siempre, aunque su evento no haya terminado.
		expect(await clearPresenceAfterEvents(t.db, { now: NOW + 24 * HOUR + 1, configFor })).toBe(1);
		expect(await lastSeen(b.id)).toBe(null);
	});

	it('un evento que ya no existe: se borra; uno que no se pudo leer: queda para la próxima', async () => {
		const a = await ticketFor({ name: 'Persona A' });
		await touchTicketPresence(t.db, { token: a.token, now: NOW, configFor });
		const failing = async () => {
			throw new Error('sin base');
		};
		expect(await clearPresenceAfterEvents(t.db, { now: NOW + MIN, configFor: failing })).toBe(0);
		expect(await lastSeen(a.id)).toBe(NOW);
		delete configs[EVENT];
		expect(await clearPresenceAfterEvents(t.db, { now: NOW + MIN, configFor })).toBe(1);
		expect(await lastSeen(a.id)).toBe(null);
	});
});
