/**
 * El cron de siempre (`POST /api/cron/recordatorios`) con la lista de espera: con el interruptor
 * prendido avanza la lista de cada evento y sus mails salen en la misma corrida, primero en la
 * tanda; apagado, la corrida es la de antes. Si el motor falla, los demás mails salen igual.
 * D1 de miniflare; eventos y mails inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const envVars = vi.hoisted(() => /** @type {Record<string, string>} */ ({}));
const engine = vi.hoisted(() => ({ fail: false }));

vi.mock('$env/dynamic/private', () => ({ env: envVars }));
vi.mock('$lib/server/series/web.js', () => ({ runSeriesCron: async () => null }));
vi.mock('$lib/server/sigo/cron.js', () => ({ runSigoCron: async () => null }));
vi.mock('$lib/server/telegram/commandsSync.js', () => ({ syncBotCommands: async () => 'skip' }));
vi.mock('$lib/server/tickets/waitlistEngine.js', async (importOriginal) => {
	const real = /** @type {typeof import('$lib/server/tickets/waitlistEngine.js')} */ (
		await importOriginal()
	);
	return {
		...real,
		/** @type {typeof real.runWaitlistCron} */
		runWaitlistCron: async (db, input) => {
			if (engine.fail) throw new Error('motor roto inventado');
			return real.runWaitlistCron(db, input);
		}
	};
});
vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['transferencia'],
		lista_espera: 'evento',
		tickets: [{ id: 'general', name: 'General', price: 1000, capacity: 1 }]
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
	engine.fail = false;
	for (const k of Object.keys(envVars)) delete envVars[k];
	Object.assign(envVars, { CRON_SECRET: SECRET, RESEND_API_KEY: 're_inventada' });
	// Alguien esperando y un lugar libre (cupo 1, nada vendido).
	await t.db
		.prepare(
			`INSERT INTO waitlist_entries (id, event_slug, email, status, confirmed_at, created_at,
				updated_at)
			VALUES (?1, ?2, 'fila@example.com', 'waiting', 1, 1, 1)`
		)
		.bind(crypto.randomUUID(), SLUG)
		.run();
});

/** Resend de mentira. */
function resend() {
	/** @type {any[]} */
	const sent = [];
	/** @type {typeof fetch} */
	const fetchFn = async (input, init) => {
		const url = new URL(String(input));
		if (url.host !== 'api.resend.com') throw new Error(`fetch inesperado a ${url.host}`);
		sent.push({
			...JSON.parse(String(init?.body)),
			key: new Headers(init?.headers).get('Idempotency-Key')
		});
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

describe('cron con la lista de espera', () => {
	it('prendida: ofrece el lugar y el mail de la oferta sale en la misma corrida, primero', async () => {
		envVars.LISTA_ESPERA_ENABLED = '1';
		const { fetchFn, sent } = resend();
		const { status, body } = await run(fetchFn);
		expect(status).toBe(200);
		expect(body.waitlistAdvance).toMatchObject({ events: 1, offered: 1, failed: 0 });
		expect(body.waitlist).toMatchObject({ sent: 1, failed: 0, remaining: 0 });
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual(['fila@example.com']);
		expect(sent[0].text).toContain(`/calendario/${SLUG}/entradas?lista=`);
		// La corrida siguiente no lo vuelve a mandar.
		const again = await run(fetchFn);
		expect(again.body.waitlist).toMatchObject({ sent: 0, remaining: 0 });
		expect(sent).toHaveLength(1);
	});

	it('apagada: la corrida es la de antes (ni avanza ni manda)', async () => {
		envVars.LISTA_ESPERA_ENABLED = '0';
		const { fetchFn, sent } = resend();
		const { status, body } = await run(fetchFn);
		expect(status).toBe(200);
		expect(body).not.toHaveProperty('waitlistAdvance');
		expect(body).not.toHaveProperty('waitlist');
		expect(sent).toHaveLength(0);
		const row = await t.db.prepare('SELECT status FROM waitlist_entries').first();
		expect(row?.status).toBe('waiting');
	});

	it('si el motor falla, la corrida sigue y responde bien', async () => {
		envVars.LISTA_ESPERA_ENABLED = '1';
		engine.fail = true;
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fetchFn } = resend();
		const { status, body } = await run(fetchFn);
		err.mockRestore();
		expect(status).toBe(200);
		expect(body).toHaveProperty('reminders');
		expect(body).not.toHaveProperty('waitlistAdvance');
	});
});
