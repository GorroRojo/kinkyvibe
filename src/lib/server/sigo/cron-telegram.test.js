/**
 * El cron de «Lo que sigo» y Telegram: sin el interruptor `telegram_bot` no manda nada por
 * Telegram; prendido y sin TELEGRAM_BOT_TOKEN se saltea con una línea en el log; con los dos,
 * llama a la API de Telegram (un `fetch` de mentira: nunca sale nada a la red). D1 de miniflare;
 * cuentas, chats, eventos y token inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeAccount } from '$lib/server/amigues/testing.js';
import { fakeEvent, fakeSend } from '$lib/server/series/fixtures.js';
import { consumeLinkCode, createLinkCode } from '../telegram/link.js';
import { follow, setFollowOptions } from './follows.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const TAG = { kind: /** @type {const} */ ('etiqueta'), key: 'shibari' };
const TOKEN = '000000:token-inventado-para-pruebas';
const CHAT = 444444444;

const md = vi.hoisted(() => /** @type {{ listed: any[] }} */ ({ listed: [] }));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki || unlisted ? [] : structuredClone(md.listed)
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
	md.listed = [fakeEvent('md-manana-tg', NOW + 10 * HOUR, ['shibari'])];
	const a = await makeAccount(t.db, 'cron-tg');
	await follow(t.db, a.id, TAG, { now: NOW - 30 * 24 * HOUR });
	await setFollowOptions(t.db, a.id, TAG, {
		calendario: true,
		mail_nuevo: false,
		recordatorio: false,
		telegram_nuevo: false,
		telegram_recordatorio: true
	});
	const r = /** @type {any} */ (await createLinkCode(t.db, a.id, { now: NOW - HOUR }));
	await consumeLinkCode(t.db, r.code, CHAT, { now: NOW - HOUR });
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** @param {Record<string, string>} env */
async function cron(env) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { CONTENIDO_DB_ENABLED: '0', LO_QUE_SIGO_ENABLED: '1', CUENTAS_ENABLED: '1', ...env }
	}));
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
	return import('./cron.js');
}

const fakeFetch = () =>
	vi.fn(async (/** @type {any} */ _url, /** @type {any} */ _init) => new Response('{}'));

/** @param {Awaited<ReturnType<typeof cron>>} m @param {typeof fetch} f */
const runIt = (m, f) =>
	m.runSigoCron({
		db: t.db,
		platform: t.platform,
		origin: 'https://kinkyvibe.ar',
		fetch: f,
		now: NOW,
		send: fakeSend()
	});

describe('runSigoCron y Telegram', () => {
	it('con el bot apagado no manda nada por Telegram', async () => {
		const m = await cron({ TELEGRAM_BOT_ENABLED: '0', TELEGRAM_BOT_TOKEN: TOKEN });
		const f = fakeFetch();
		expect(await runIt(m, /** @type {any} */ (f))).toMatchObject({ telegram: null });
		expect(f).not.toHaveBeenCalled();
	});

	it('prendido y sin token: se saltea con una línea en el log', async () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const m = await cron({ TELEGRAM_BOT_ENABLED: '1' });
		const f = fakeFetch();
		expect(await runIt(m, /** @type {any} */ (f))).toMatchObject({ telegram: null });
		expect(f).not.toHaveBeenCalled();
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('falta TELEGRAM_BOT_TOKEN'));
		spy.mockRestore();
	});

	it('prendido y con token: manda el recordatorio por la API de Telegram', async () => {
		const m = await cron({ TELEGRAM_BOT_ENABLED: '1', TELEGRAM_BOT_TOKEN: TOKEN });
		const f = fakeFetch();
		expect(await runIt(m, /** @type {any} */ (f))).toMatchObject({ telegram: { sent: 1 } });
		expect(f).toHaveBeenCalledTimes(1);
		const [url, init] = f.mock.calls[0];
		expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
		const body = JSON.parse(init.body);
		expect(body.chat_id).toBe(String(CHAT));
		expect(body.text).toContain('/calendario/md-manana-tg');
	});
});
