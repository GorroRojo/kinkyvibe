/**
 * «Con la entrada abierta ahora»: la página de la entrada avisa a `POST …/visto` solo si el `load`
 * dice `presence` (entrada válida, sin ingreso, el día del evento y no une admin), y el endpoint
 * anota la última vez con el token como única llave. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, checkIn, reserveOrder } from '$lib/server/tickets/orders.js';
import { load } from '../+page.server.js';
import { POST } from './+server.js';

/** El evento empieza hace una hora (está dentro de su ventana), salvo que el test lo cambie. */
const ev = vi.hoisted(() => ({ start: '', online: false }));
vi.mock('$lib/server/tickets/events.js', () => ({
	getEventTickets: async (/** @type {string} */ slug) => ({
		slug,
		title: 'Fiesta de prueba',
		start: ev.start,
		online: ev.online,
		types: [{ id: 'general', name: 'General' }]
	})
}));

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
	ev.start = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	ev.online = false;
});

const ADMIN = { id: 4594048, login: 'GorroRojo', name: null, avatar_url: '' };

async function ticketFor() {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: 'fiesta-de-prueba',
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona Inventada', pronouns: 'elle' }],
			buyer: { name: 'Persona Inventada', email: 'p@example.com', dni: '30111222' }
		})
	);
	const { tickets } = await applyPayment(t.db, {
		id: 1,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return tickets[0];
}

/** @param {string} token @param {Partial<App.Locals>} [locals] */
function event(token, locals = {}) {
	return /** @type {any} */ ({
		params: { token },
		platform: t.platform,
		locals,
		url: new URL(`http://localhost/entradas/t/${token}`),
		request: new Request(`http://localhost/entradas/t/${token}/visto`, { method: 'POST' })
	});
}

/** @param {string} id */
async function lastSeen(id) {
	const row = await t.db.prepare('SELECT last_seen_at FROM tickets WHERE id = ?1').bind(id).first();
	return row?.last_seen_at ?? null;
}

describe('POST /entradas/t/<token>/visto', () => {
	it('anota la última vez (204, sin caché) y un segundo aviso enseguida no vuelve a escribir', async () => {
		const ticket = await ticketFor();
		const r = await POST(event(ticket.token));
		expect(r.status).toBe(204);
		expect(r.headers.get('cache-control')).toBe('no-store');
		const first = await lastSeen(ticket.id);
		expect(first).toBeGreaterThan(Date.now() - 60_000);
		expect((await POST(event(ticket.token))).status).toBe(204);
		expect(await lastSeen(ticket.id)).toBe(first);
	});

	it('404 sin entrada; 410 si ya entró, fuera del día del evento o si la abre une admin', async () => {
		expect((await POST(event('no-es-un-token'))).status).toBe(404);
		expect((await POST(event('C'.repeat(43)))).status).toBe(404);

		const ticket = await ticketFor();
		expect((await POST(event(ticket.token, { user: /** @type {any} */ (ADMIN) }))).status).toBe(
			410
		);
		ev.start = '2099-12-01T22:00:00-03:00';
		expect((await POST(event(ticket.token))).status).toBe(410);
		expect(await lastSeen(ticket.id)).toBe(null);

		ev.start = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		await checkIn(t.db, { token: ticket.token, eventSlug: 'fiesta-de-prueba', by: 'admin' });
		expect((await POST(event(ticket.token))).status).toBe(410);
		expect(await lastSeen(ticket.id)).toBe(null);
	});
});

describe('la página de la entrada: `presence`', () => {
	it('solo con la entrada válida, sin ingreso, el día de un evento presencial y sin ser admin', async () => {
		const ticket = await ticketFor();
		const page = /** @type {any} */ (await load(event(ticket.token)));
		expect(page.presence).toBe(true);
		const asAdmin = /** @type {any} */ (
			await load(event(ticket.token, { user: /** @type {any} */ (ADMIN), user_token: 'x' }))
		);
		expect(asAdmin.presence).toBe(false);
		ev.online = true;
		expect(/** @type {any} */ (await load(event(ticket.token))).presence).toBe(false);
		ev.online = false;
		ev.start = '2099-12-01T22:00:00-03:00';
		expect(/** @type {any} */ (await load(event(ticket.token))).presence).toBe(false);
		ev.start = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		await checkIn(t.db, { token: ticket.token, eventSlug: 'fiesta-de-prueba', by: 'admin' });
		expect(/** @type {any} */ (await load(event(ticket.token))).presence).toBe(false);
	});
});
