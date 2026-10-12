/**
 * Mensajes › Lo que sigo (load): solo admins (sin sesión, 303 al login; sin permiso, 403), se ve
 * con el interruptor apagado, trae los números y «Lo más seguido», y nunca llega al navegador quién
 * sigue qué, ni el token o el secreto del bot. D1 de miniflare, datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { makeAccount, makeProfile } from '$lib/server/amigues/testing.js';
import { setFlag } from '$lib/server/flags.js';

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

const TOKEN = '123456:TOKEN-INVENTADO-PARA-LA-PRUEBA';
const SECRET = 'secreto-inventado-del-webhook-0002';

async function page({ token = TOKEN, secret = SECRET } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret }
	}));
	return import('./+page.server.js');
}

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
/** @param {any} user */
const ev = (user) =>
	fakeRequestEvent({ platform: t.platform, path: '/admin/mensajes/lo-que-sigo', user });

/** @param {string} accountId @param {'etiqueta' | 'perfil'} kind @param {string} key */
async function addFollow(accountId, kind, key) {
	const now = Date.now();
	await t.db
		.prepare(
			`INSERT INTO follows (account_id, target_kind, target_key, in_calendar, mail_new,
				mail_reminder, created_at, updated_at) VALUES (?1, ?2, ?3, 1, 1, 0, ?4, ?4)`
		)
		.bind(accountId, kind, key, now)
		.run();
}

describe('/admin/mensajes/lo-que-sigo', () => {
	it('sin sesión: al login; sin permiso: 403', async () => {
		const { load } = await page();
		expect(await thrown(() => load(ev(null)))).toMatchObject({ status: 303 });
		expect(await thrown(() => load(ev({ id: 1, login: 'alguien-de-prueba' })))).toMatchObject({
			status: 403
		});
	});

	it('con el interruptor apagado se ve igual, con ceros', async () => {
		await setFlag(t.db, 'lo_que_sigo', false, { by: 'prueba' });
		const data = /** @type {any} */ (await (await page()).load(ev(admin)));
		expect(data.flags).toEqual({ lo_que_sigo: false, telegram_bot: false });
		expect(data.stats.accounts).toBe(0);
		expect(data.stats.ranking).toEqual({ etiqueta: [], perfil: [], lugar: [] });
	});

	it('admins: interruptores, números y lo más seguido; sin quién sigue qué ni secretos', async () => {
		await setFlag(t.db, 'lo_que_sigo', true, { by: 'prueba' });
		await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
		const a = await makeAccount(t.db, 'sigue-en-la-prueba');
		const b = await makeAccount(t.db, 'sigue-tambien');
		const p = await makeProfile(t.db, { title: 'Perfil De Prueba' });
		await addFollow(a.id, 'etiqueta', 'shibari');
		await addFollow(b.id, 'etiqueta', 'shibari');
		await addFollow(b.id, 'perfil', String(p.id));
		await t.db
			.prepare(
				`INSERT INTO telegram_chats (account_id, chat_id, linked_at, muted, updated_at)
				VALUES (?1, '700000099', 1, 0, 1)`
			)
			.bind(a.id)
			.run();

		const data = /** @type {any} */ (await (await page()).load(ev(admin)));
		expect(data.flags).toEqual({ lo_que_sigo: true, telegram_bot: true });
		expect(data.telegramConfig).toEqual({ secretOk: true, tokenOk: true });
		expect(data.stats.accounts).toBe(2);
		expect(data.stats.follows).toEqual({ total: 3, etiqueta: 2, perfil: 1, lugar: 0 });
		expect(data.stats.ranking.etiqueta[0]).toMatchObject({ key: 'shibari', count: 2 });
		expect(data.stats.ranking.perfil[0]).toMatchObject({ title: 'Perfil De Prueba', count: 1 });
		expect(data.stats.telegram).toEqual({ linked: 1, muted: 0 });

		const all = JSON.stringify(data);
		for (const x of [a.id, b.id, a.email, b.email, '700000099', TOKEN, SECRET])
			expect(all).not.toContain(x);
	});

	it('dice si falta configurar el bot, sin los valores', async () => {
		const data = /** @type {any} */ (await (await page({ token: '', secret: '' })).load(ev(admin)));
		expect(data.telegramConfig).toEqual({ secretOk: false, tokenOk: false });
	});
});
