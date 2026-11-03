/**
 * El cron de mails (`POST /api/cron/recordatorios`) con las pausas de emergencia
 * ($lib/server/emergencia.js): con `MAILS_PAUSED` no sale ningún mail en tanda (la tanda, las
 * series y «Lo que sigo» se saltean), la lista de espera no avanza y nada se pierde: sin la
 * variable, la corrida siguiente manda lo que quedó. El reintento del mail de las entradas (de una
 * compra) sigue saliendo. Con `TICKETS_PAUSED`, la lista tampoco avanza.
 * D1 de miniflare; eventos y mails inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const envVars = vi.hoisted(() => /** @type {Record<string, string>} */ ({}));
const calls = vi.hoisted(() => ({ series: 0, sigo: 0 }));

vi.mock('$env/dynamic/private', () => ({ env: envVars }));
vi.mock('$lib/server/series/web.js', () => ({
	runSeriesCron: async () => {
		calls.series++;
		return { sent: 0 };
	}
}));
vi.mock('$lib/server/sigo/cron.js', () => ({
	runSigoCron: async () => {
		calls.sigo++;
		return { sent: 0 };
	}
}));
vi.mock('$lib/server/telegram/commandsSync.js', () => ({ syncBotCommands: async () => 'skip' }));
vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['mercadopago'],
		lista_espera: 'evento',
		tickets: [{ id: 'general', name: 'General', price: 1000, capacity: 5 }]
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			slug === 'fiesta-de-prueba' ? parseTicketConfig(meta, opts) : null,
		getEventInfo: async () => null,
		getEventMeta: async () => meta,
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { clearFlagCache } from '$lib/server/flags.js';
import { applyPayment, getOrder, reserveOrder } from '$lib/server/tickets/orders.js';
import { POST } from './+server.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const SECRET = 'secreto-de-prueba-inventado-123';
const SLUG = 'fiesta-de-prueba';

beforeEach(async () => {
	await resetDB(t.db);
	clearFlagCache();
	calls.series = 0;
	calls.sigo = 0;
	for (const k of Object.keys(envVars)) delete envVars[k];
	Object.assign(envVars, {
		CRON_SECRET: SECRET,
		RESEND_API_KEY: 're_inventada',
		LISTA_ESPERA_ENABLED: '1'
	});
	// Alguien esperando y lugar libre: sin pausa, el cron le ofrece el lugar y le manda el mail.
	await t.db
		.prepare(
			`INSERT INTO waitlist_entries (id, event_slug, email, status, confirmed_at, created_at,
				updated_at)
			VALUES (?1, ?2, 'fila@example.com', 'waiting', 1, 1, 1)`
		)
		.bind(crypto.randomUUID(), SLUG)
		.run();
	for (const level of /** @type {const} */ (['log', 'warn', 'error'])) {
		const spy = vi.spyOn(console, level).mockImplementation(() => {});
		onTestFinished(() => spy.mockRestore());
	}
});

/** Resend de mentira. */
function resend() {
	/** @type {{ to: string[], subject: string }[]} */
	const sent = [];
	/** @type {typeof fetch} */
	const fetchFn = async (input, init) => {
		const url = new URL(String(input));
		if (url.host !== 'api.resend.com') throw new Error(`fetch inesperado a ${url.host}`);
		sent.push(JSON.parse(String(init?.body)));
		return new Response(JSON.stringify({ id: 'resend-id' }), { status: 200 });
	};
	return { fetchFn, sent };
}

/** @param {typeof fetch} fetchFn */
async function run(fetchFn) {
	const res = await POST(
		/** @type {any} */ ({
			request: new Request('https://kinkyvibe.ar/api/cron/recordatorios', {
				method: 'POST',
				headers: { 'x-cron-secret': SECRET }
			}),
			platform: t.platform,
			url: new URL('https://kinkyvibe.ar/api/cron/recordatorios'),
			fetch: fetchFn
		})
	);
	return { status: res.status, body: await res.json() };
}

const waitlistStatus = async () =>
	(await t.db.prepare('SELECT status FROM waitlist_entries').first())?.status;

/** Una orden paga hace una hora cuyo mail de entradas no salió (el reintento la toma). */
async function unsentPaidOrder() {
	const at = Date.now() - 60 * 60 * 1000;
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: SLUG,
			type: { id: 'general', price: 1000, capacity: 50 },
			quantity: 1,
			holders: [{ name: 'Persona Demo', pronouns: 'elle' }],
			buyer: { name: 'Persona Demo', pronouns: 'elle', email: 'compra@example.com', dni: '1' },
			now: at - 60_000
		})
	);
	await applyPayment(
		t.db,
		{
			id: 4242,
			status: 'approved',
			external_reference: r.order.id,
			transaction_amount: 1000,
			currency_id: 'ARS'
		},
		{ now: at }
	);
	return r.order.id;
}

describe('cron con MAILS_PAUSED', () => {
	it('no manda ningún mail en tanda ni avanza la lista; al sacarla, sale todo', async () => {
		envVars.MAILS_PAUSED = '1';
		const { fetchFn, sent } = resend();
		const paused = await run(fetchFn);
		expect(paused.status).toBe(200);
		expect(paused.body.paused).toEqual({ tickets: false, mails: true });
		expect(paused.body.waitlistAdvance).toBeUndefined();
		expect(paused.body.reminders).toBeUndefined();
		expect(calls).toEqual({ series: 0, sigo: 0 });
		expect(sent).toHaveLength(0);
		expect(await waitlistStatus()).toBe('waiting');
		// Nada quedó gastado: ni intentos ni envíos reservados.
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM waitlist_sends').first())?.n).toBe(0);

		delete envVars.MAILS_PAUSED;
		const after = await run(fetchFn);
		expect(after.body.paused).toBeUndefined();
		expect(after.body.waitlistAdvance).toMatchObject({ offered: 1 });
		expect(after.body.waitlist).toMatchObject({ sent: 1, failed: 0 });
		expect(calls).toEqual({ series: 1, sigo: 1 });
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual(['fila@example.com']);
	});

	it('el reintento del mail de las entradas sigue saliendo (es de una compra)', async () => {
		envVars.MAILS_PAUSED = 'Se mandó mal un aviso';
		const id = await unsentPaidOrder();
		const { fetchFn, sent } = resend();
		const { body } = await run(fetchFn);
		expect(body.paused).toEqual({ tickets: false, mails: true });
		expect(body.unsentOrders).toEqual({ sent: 1, failed: 0 });
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual(['compra@example.com']);
		expect((await getOrder(t.db, id))?.email_sent_at).toBeTruthy();
	});
});

describe('cron con TICKETS_PAUSED', () => {
	it('la lista de espera no avanza (no se podría comprar), los demás mails siguen', async () => {
		envVars.TICKETS_PAUSED = 'Volvemos en un rato';
		const { fetchFn, sent } = resend();
		const { status, body } = await run(fetchFn);
		expect(status).toBe(200);
		expect(body.paused).toEqual({ tickets: true, mails: false });
		expect(body.waitlistAdvance).toBeUndefined();
		expect(body.reminders).toMatchObject({ sent: 0 });
		expect(calls).toEqual({ series: 1, sigo: 1 });
		expect(sent).toHaveLength(0);
		expect(await waitlistStatus()).toBe('waiting');
	});
});
