/**
 * Ajustes → Admins: «Vincular Telegram» y «Desvincular» (la puerta por Telegram). Solo admins;
 * el link lleva `?start=adm_<código>` del bot, la base guarda solo el hash y desvincular deja
 * registro. D1 de miniflare; usuario del bot inventado.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { setFlag } from '$lib/server/flags.js';
import { sha256Hex } from '$lib/server/hash.js';
import { consumeAdminLinkCode } from '$lib/server/telegram/adminLink.js';

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
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

const BOT = 'bot_inventado_de_prueba';

async function page({ bot = BOT } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { TELEGRAM_BOT_USERNAME: bot } }));
	return import('./+page.server.js');
}

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
/** @param {any} user */
const ev = (user) =>
	fakeRequestEvent({ platform: t.platform, path: '/admin/ajustes/admins', user });
/** @param {string} action @param {any} user */
const post = (action, user) =>
	fakeRequestEvent({
		platform: t.platform,
		path: `/admin/ajustes/admins?/${action}`,
		user,
		form: {}
	});

describe('/admin/ajustes/admins: Telegram para la puerta', () => {
	it('sin sesión: al login; sin permiso: 403 (también las acciones)', async () => {
		const { load, actions } = await page();
		const nobody = { id: 1, login: 'alguien-de-prueba' };
		expect(await thrown(() => load(ev(null)))).toMatchObject({ status: 303 });
		expect(await thrown(() => load(ev(nobody)))).toMatchObject({ status: 403 });
		expect(
			await thrown(() => actions.vincularTelegram(post('vincularTelegram', nobody)))
		).toMatchObject({ status: 403 });
		expect(
			await thrown(() => actions.desvincularTelegram(post('desvincularTelegram', nobody)))
		).toMatchObject({ status: 403 });
	});

	it('con el bot apagado no se puede vincular y lo dice', async () => {
		const { load, actions } = await page();
		const data = /** @type {any} */ (await load(ev(admin)));
		expect(data.telegram).toEqual({ linkedAt: null, blocked: expect.stringContaining('apagado') });
		const r = /** @type {any} */ (await actions.vincularTelegram(post('vincularTelegram', admin)));
		expect(r.status).toBe(503);
		const { results } = await t.db.prepare('SELECT * FROM telegram_admin_link_codes').all();
		expect(results).toEqual([]);
	});

	it('con el bot prendido pero la puerta apagada no se puede vincular y lo dice', async () => {
		await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
		const { load, actions } = await page();
		const data = /** @type {any} */ (await load(ev(admin)));
		expect(data.telegram).toEqual({
			linkedAt: null,
			blocked: expect.stringContaining('puerta por Telegram está apagada')
		});
		const r = /** @type {any} */ (await actions.vincularTelegram(post('vincularTelegram', admin)));
		expect(r.status).toBe(503);
		const { results } = await t.db.prepare('SELECT * FROM telegram_admin_link_codes').all();
		expect(results).toEqual([]);
	});

	it('vincular: link t.me con adm_<código> y QR; el bot lo usa; la lista lo marca; desvincular', async () => {
		await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
		await setFlag(t.db, 'telegram_puerta', true, { by: 'prueba' });
		const { load, actions } = await page();
		const r = /** @type {any} */ (await actions.vincularTelegram(post('vincularTelegram', admin)));
		const m = /^https:\/\/t\.me\/bot_inventado_de_prueba\?start=adm_([2-9A-HJ-NP-Z]{8})$/.exec(
			r.telegramLink
		);
		expect(m).not.toBeNull();
		const code = /** @type {RegExpExecArray} */ (m)[1];
		expect(r.telegramQr).toContain('<svg');
		expect(r.telegramExpiresAt).toBeGreaterThan(Date.now());
		const row = await t.db.prepare('SELECT code_hash FROM telegram_admin_link_codes').first();
		expect(row?.code_hash).toBe(await sha256Hex(code));

		expect((await consumeAdminLinkCode(t.db, `adm_${code}`, 7001)).ok).toBe(true);
		const data = /** @type {any} */ (await load(ev(admin)));
		expect(data.telegram.linkedAt).toEqual(expect.any(Number));
		expect(data.telegram.blocked).toBeNull();
		expect(data.admins.find((/** @type {any} */ a) => a.id === admin.id).telegram).toBe(true);
		expect(data.admins.filter((/** @type {any} */ a) => a.telegram)).toHaveLength(1);

		const out = /** @type {any} */ (
			await actions.desvincularTelegram(post('desvincularTelegram', admin))
		);
		expect(out.telegramMessage).toContain('desvinculado');
		expect(/** @type {any} */ (await load(ev(admin))).telegram.linkedAt).toBeNull();
		const { results } = await t.db
			.prepare('SELECT action, actor_login FROM admin_audit ORDER BY id')
			.all();
		expect(results).toEqual([
			{ action: 'telegram.admin_link', actor_login: admin.login },
			{ action: 'telegram.admin_unlink', actor_login: admin.login }
		]);
	});

	it('con la puerta apagada pero «Telegram para admins» prendido, se puede vincular (0041)', async () => {
		await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
		await setFlag(t.db, 'telegram_admin', true, { by: 'prueba' });
		const { load, actions } = await page();
		expect(/** @type {any} */ (await load(ev(admin))).telegram.blocked).toBeNull();
		const r = /** @type {any} */ (await actions.vincularTelegram(post('vincularTelegram', admin)));
		expect(r.telegramLink).toMatch(/\?start=adm_[2-9A-HJ-NP-Z]{8}$/);
	});

	it('sin TELEGRAM_BOT_USERNAME no hay link', async () => {
		await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
		await setFlag(t.db, 'telegram_puerta', true, { by: 'prueba' });
		const { actions } = await page({ bot: '' });
		const r = /** @type {any} */ (await actions.vincularTelegram(post('vincularTelegram', admin)));
		expect(r.status).toBe(503);
		expect(r.data.telegramError).toContain('TELEGRAM_BOT_USERNAME');
	});
});
