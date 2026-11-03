/**
 * La lista de espera con las pausas de emergencia ($lib/server/emergencia.js): con
 * `TICKETS_PAUSED` o `MAILS_PAUSED` el empujón no avanza la lista (un lugar guardado que no se
 * puede comprar, o del que nadie se entera, se vencería igual), y con `MAILS_PAUSED` sus mails no
 * salen ni gastan intentos: salen en la primera tanda después de la pausa.
 * D1 de miniflare; eventos y mails inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const envVars = vi.hoisted(() => /** @type {Record<string, string>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env: envVars }));
vi.mock('$lib/server/flags.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	isFlagOn: async (/** @type {unknown} */ _db, /** @type {string} */ key) => key === 'lista_espera',
	listaEsperaEnabled: async () => true
}));
vi.mock('./events.js', async () => {
	const { parseTicketConfig } = await import('./config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['transferencia'],
		lista_espera: 'evento',
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 2 }]
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			slug === 'lejos' ? parseTicketConfig(meta, opts) : null,
		getEventInfo: async () => null,
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { queueWaitlistAdvance, sendWaitlistMails, advanceWaitlist } from './waitlistEngine.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const SLUG = 'lejos';
const ENTRY = 'a0000000-0000-4000-8000-000000000001';
const ORIGIN = 'https://kinkyvibe.example';

beforeEach(async () => {
	await resetDB(t.db);
	for (const k of Object.keys(envVars)) delete envVars[k];
	// Alguien esperando y lugar libre (nada vendido).
	await t.db
		.prepare(
			`INSERT INTO waitlist_entries (id, event_slug, email, status, confirmed_at, created_at,
				updated_at)
			VALUES (?1, ?2, 'fila@example.com', 'waiting', 1, 1, 1)`
		)
		.bind(ENTRY, SLUG)
		.run();
	const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
	onTestFinished(() => spy.mockRestore());
});

const status = async () =>
	(await t.db.prepare('SELECT status FROM waitlist_entries WHERE id = ?1').bind(ENTRY).first())
		?.status;

/** Un envío de mails de mentira. */
function fakeSend() {
	/** @type {string[]} */
	const sent = [];
	/** @type {import('./waitlistMail.js').WaitlistSend} */
	const send = async (to) => {
		sent.push(to);
		return 'sent';
	};
	return { send, sent };
}

describe('el empujón con una pausa', () => {
	it.each([['TICKETS_PAUSED'], ['MAILS_PAUSED']])('con %s no avanza la lista', async (name) => {
		envVars[name] = '1';
		expect(await queueWaitlistAdvance({ db: t.db, eventSlug: SLUG })).toBe('paused');
		expect(await status()).toBe('waiting');
		delete envVars[name];
		expect(await queueWaitlistAdvance({ db: t.db, eventSlug: SLUG })).toBe('done');
		expect(await status()).toBe('offered');
	});
});

describe('los mails de la lista con MAILS_PAUSED', () => {
	it('no salen ni gastan intentos; sin la pausa, sale la oferta', async () => {
		// Une admin pasó el lugar a mano: la oferta ya existe y su mail está pendiente.
		await advanceWaitlist(t.db, { eventSlug: SLUG });
		expect(await status()).toBe('offered');
		envVars.MAILS_PAUSED = '1';
		const { send, sent } = fakeSend();
		expect(await sendWaitlistMails(t.db, { limit: 10, send, origin: ORIGIN })).toEqual({
			sent: 0,
			failed: 0,
			remaining: 0
		});
		expect(sent).toEqual([]);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM waitlist_sends').first())?.n).toBe(0);

		delete envVars.MAILS_PAUSED;
		expect(await sendWaitlistMails(t.db, { limit: 10, send, origin: ORIGIN })).toMatchObject({
			sent: 1,
			failed: 0
		});
		expect(sent).toEqual(['fila@example.com']);
	});
});
