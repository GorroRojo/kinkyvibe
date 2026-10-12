/**
 * El cron de siempre (`POST /api/cron/recordatorios`) con los avisos de admins por Telegram
 * (decisión 0041, PR 2): desde las 9 (hora de Argentina) manda el resumen diario a quien lo
 * prendió, una sola vez por día; con los interruptores apagados, la corrida es la de antes.
 * D1 de miniflare; evento, admins y compras inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const envVars = vi.hoisted(() => /** @type {Record<string, string>} */ ({}));

vi.mock('$env/dynamic/private', () => ({ env: envVars }));
vi.mock('$lib/server/series/web.js', () => ({ runSeriesCron: async () => null }));
vi.mock('$lib/server/sigo/cron.js', () => ({ runSigoCron: async () => null }));
vi.mock('$lib/server/telegram/commandsSync.js', () => ({ syncBotCommands: async () => 'skip' }));
vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const meta = {
		title: 'Fiesta de prueba',
		start: '2031-01-10T23:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['transferencia'],
		tickets: [{ id: 'general', name: 'General', price: 1000, capacity: 40 }]
	};
	const config = () => parseTicketConfig(meta, {});
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug) =>
			slug === 'fiesta-de-prueba' ? config() : null,
		getEventInfo: async () => null,
		getEventMeta: async () => meta,
		listTicketedEvents: async () => [{ slug: 'fiesta-de-prueba', config: config() }]
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache } from '$lib/server/flags.js';
import { setAdminNotice } from '$lib/server/telegram/adminData.js';
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
afterEach(() => {
	vi.useRealTimers();
});

const SECRET = 'secreto-de-prueba-inventado-123';
const SLUG = 'fiesta-de-prueba';
const ADMIN = ADMINS[0];
const ADMIN_TG = '5001';
const MORNING = Date.parse('2031-01-08T09:05:00-03:00');

beforeEach(async () => {
	await resetDB(t.db);
	clearFlagCache();
	for (const k of Object.keys(envVars)) delete envVars[k];
	Object.assign(envVars, {
		CRON_SECRET: SECRET,
		RESEND_API_KEY: 're_inventada',
		TELEGRAM_BOT_TOKEN: 'token-inventado',
		TELEGRAM_BOT_ENABLED: '1',
		TELEGRAM_ADMIN_ENABLED: '1'
	});
	await t.db
		.prepare(
			'INSERT INTO telegram_admin_links (telegram_user_id, github_id, github_login, linked_at) VALUES (?1, ?2, ?3, 1)'
		)
		.bind(ADMIN_TG, ADMIN.id, ADMIN.login)
		.run();
	await setAdminNotice(t.db, ADMIN.id, 'resumen_diario', true);
	// Ayer a la tarde: una venta de 2 entradas (con datos inventados que nunca salen).
	const at = Date.parse('2031-01-07T18:00:00-03:00');
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
				buyer_name, buyer_email, buyer_dni, status, payment_method, created_at, updated_at,
				expires_at)
			VALUES ('00000000-0000-4000-9000-000000000001', ?1, 'general', 2, 1000, 2000, 2000,
				'Persona Secreta', 'secreta@example.com', '30111222', 'approved', 'mercadopago', ?2, ?2, ?2)`
		)
		.bind(SLUG, at)
		.run();
});

/** Telegram de mentira (y nada más: el cron no tiene mails para mandar). */
function telegram() {
	/** @type {any[]} */
	const sent = [];
	/** @type {typeof fetch} */
	const fetchFn = async (input, init) => {
		const url = new URL(String(input));
		if (url.host !== 'api.telegram.org') throw new Error(`fetch inesperado a ${url.host}`);
		sent.push(JSON.parse(String(init?.body)));
		return new Response(JSON.stringify({ ok: true }), { status: 200 });
	};
	return { fetchFn, sent };
}

/** @param {typeof fetch} fetchFn @param {number} now */
async function run(fetchFn, now) {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(now);
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
	vi.useRealTimers();
	return { status: res.status, body: await res.json() };
}

describe('cron con los avisos de admins', () => {
	it('a las 9: el resumen sale una vez, por el chat privado y sin datos de quien compra', async () => {
		const { fetchFn, sent } = telegram();
		const { status, body } = await run(fetchFn, MORNING);
		expect(status).toBe(200);
		expect(body.telegramAdmin).toEqual({ sent: 1, failed: 0, events: 1 });
		expect(sent).toHaveLength(1);
		expect(sent[0].chat_id).toBe(ADMIN_TG);
		expect(sent[0].text).toContain('Resumen diario · Fiesta de prueba');
		expect(sent[0].text).toContain('Desde ayer a las 9:00: 2 vendidas · en total: 2/40');
		expect(sent[0].reply_markup.inline_keyboard[0][0].url).toBe(
			`https://kinkyvibe.ar/admin/eventos/${SLUG}`
		);
		for (const secret of ['Persona Secreta', 'secreta@example.com', '30111222']) {
			expect(JSON.stringify(sent)).not.toContain(secret);
		}
		// La corrida siguiente (15 minutos después) no lo repite.
		const again = await run(fetchFn, MORNING + 15 * 60_000);
		expect(again.body.telegramAdmin).toEqual({ sent: 0, failed: 0, events: 0 });
		expect(sent).toHaveLength(1);
	});

	it('antes de las 9 no sale', async () => {
		const { fetchFn, sent } = telegram();
		const { body } = await run(fetchFn, Date.parse('2031-01-08T08:45:00-03:00'));
		expect(body.telegramAdmin).toEqual({ skipped: 'hour' });
		expect(sent).toEqual([]);
	});

	it('con «Telegram para admins» o el bot apagados, la corrida es la de antes', async () => {
		for (const key of ['TELEGRAM_ADMIN_ENABLED', 'TELEGRAM_BOT_ENABLED']) {
			envVars.TELEGRAM_BOT_ENABLED = '1';
			envVars.TELEGRAM_ADMIN_ENABLED = '1';
			envVars[key] = '0';
			clearFlagCache();
			const { fetchFn, sent } = telegram();
			const { status, body } = await run(fetchFn, MORNING);
			expect(status).toBe(200);
			expect(body.telegramAdmin).toEqual({ skipped: 'off' });
			expect(sent).toEqual([]);
		}
	});
});
