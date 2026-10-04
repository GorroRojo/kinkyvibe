/**
 * Ajustes → Automatizaciones: solo admins (sin sesión, 303 al login; sin permiso, 403) y nunca un
 * secreto en lo que llega al navegador. D1 de miniflare.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

const TOKEN = '987654:TOKEN-INVENTADO-PARA-LA-PRUEBA';
const SECRET = 'secreto-inventado-del-webhook-0001';

async function page() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_ENABLED: '1' }
	}));
	return import('./+page.server.js');
}

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
/** @param {any} user */
const ev = (user) =>
	fakeRequestEvent({ platform: t.platform, path: '/admin/ajustes/automatizaciones', user });

describe('/admin/ajustes/automatizaciones', () => {
	it('sin sesión: al login; sin permiso: 403', async () => {
		const { load } = await page();
		expect(await thrown(() => load(ev(null)))).toMatchObject({ status: 303 });
		expect(await thrown(() => load(ev({ id: 1, login: 'alguien-de-prueba' })))).toMatchObject({
			status: 403
		});
	});

	it('admins: crons, mails, Telegram y reglas; sin el token ni el secreto', async () => {
		const { load } = await page();
		const data = /** @type {any} */ (await load(ev(admin)));
		expect(data.crons.map((/** @type {any} */ c) => c.id)).toEqual([
			'cron-recordatorios',
			'cron-backup'
		]);
		expect(data.mails.length).toBeGreaterThan(0);
		expect(data.telegram).toMatchObject({ state: 'on' });
		expect(data.rules.soon).toBe(true);
		const all = JSON.stringify(data);
		expect(all).not.toContain(TOKEN);
		expect(all).not.toContain(SECRET);
	});
});
