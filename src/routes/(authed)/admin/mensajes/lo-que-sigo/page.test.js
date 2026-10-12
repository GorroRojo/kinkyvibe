/**
 * Mensajes › Lo que sigo (load): solo admins (sin sesión, 303 al login; sin permiso, 403), se ve
 * con el interruptor apagado, trae los números y «Lo más seguido» y, solo para admins, quién sigue
 * cada cosa y lo que sigue cada cuenta (decisión 0043; sin las cuentas borradas). Los números
 * (`stats`) siguen sin ids ni mails, y nunca llegan los chats, el token o el secreto del bot. D1 de
 * miniflare, datos inventados.
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
	it('sin sesión: al login; sin permiso: 403 (aunque haya gente siguiendo cosas)', async () => {
		const a = await makeAccount(t.db, 'alguien-que-sigue');
		await addFollow(a.id, 'etiqueta', 'shibari');
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

	it('admins: interruptores, números y lo más seguido; los números sin quién, nunca secretos', async () => {
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

		// Los números no dicen quién: eso va solo en `followers`.
		const stats = JSON.stringify(data.stats);
		for (const x of [a.id, b.id, a.email, b.email]) expect(stats).not.toContain(x);
		const all = JSON.stringify(data);
		for (const x of ['700000099', TOKEN, SECRET]) expect(all).not.toContain(x);
	});

	it('admins: quién sigue cada cosa y lo que sigue cada cuenta, sin las borradas', async () => {
		const a = await makeAccount(t.db, 'sigue-en-la-prueba');
		const b = await makeAccount(t.db, 'sigue-tambien');
		const gone = await makeAccount(t.db, 'cuenta-borrada-de-prueba');
		const p = await makeProfile(t.db, { title: 'Perfil De Prueba' });
		const lugar = await makeProfile(t.db, { title: 'Lugar De Prueba', kind: 'lugar' });
		await addFollow(a.id, 'etiqueta', 'shibari');
		await addFollow(b.id, 'etiqueta', 'shibari');
		await addFollow(b.id, 'perfil', String(p.id));
		await addFollow(b.id, 'perfil', String(lugar.id));
		await addFollow(gone.id, 'etiqueta', 'shibari');
		await t.db
			.prepare(
				`UPDATE accounts SET deleted_at = ?2, email = NULL, email_verified_at = NULL,
					password_hash = NULL, preferences = '{}' WHERE id = ?1`
			)
			.bind(gone.id, Date.now())
			.run();

		const data = /** @type {any} */ (await (await page()).load(ev(admin)));
		const href = (/** @type {string} */ id) => `/admin/comunidad/cuentas/${id}#sigue`;
		const fa = { id: a.id, email: a.email, href: href(a.id) };
		const fb = { id: b.id, email: b.email, href: href(b.id) };
		expect(data.followers.byTarget).toEqual({
			'etiqueta:shibari': [fb, fa].sort((x, y) => x.email.localeCompare(y.email)),
			[`perfil:${p.id}`]: [fb],
			[`lugar:${lugar.id}`]: [fb]
		});
		expect(data.followers.people).toEqual([
			{
				...fb,
				count: 3,
				items: [
					{ group: 'etiqueta', title: 'shibari' },
					{ group: 'perfil', title: 'Perfil De Prueba' },
					{ group: 'lugar', title: 'Lugar De Prueba' }
				]
			},
			{ ...fa, count: 1, items: [{ group: 'etiqueta', title: 'shibari' }] }
		]);
		expect(data.followers.truncated).toBe(false);
		// La cuenta borrada no aparece ni se cuenta.
		expect(JSON.stringify(data)).not.toContain(gone.id);
		expect(data.stats.ranking.etiqueta[0]).toMatchObject({ key: 'shibari', count: 2 });
	});

	it('dice si falta configurar el bot, sin los valores', async () => {
		const data = /** @type {any} */ (await (await page({ token: '', secret: '' })).load(ev(admin)));
		expect(data.telegramConfig).toEqual({ secretOk: false, tokenOk: false });
	});
});
