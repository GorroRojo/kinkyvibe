/**
 * `/inicio` (el inicio del bot, lo mismo que `/start` sin nada) y el botón «🚪 Puerta» del inicio
 * para les admins con el Telegram vinculado (0037). Primero el router con dependencias de mentira;
 * después el webhook armado como la ruta, con la base de prueba (`botDoor` de verdad). Datos y
 * usuarios de Telegram inventados, sin red.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache, isFlagOn, setFlag } from '$lib/server/flags.js';
import {
	botAdminLink,
	consumeAdminLinkCode,
	createAdminLinkCode,
	unlinkAdminTelegram
} from './adminLink.js';
import { botDoor } from './puerta.js';
import { handleUpdate, planUpdate } from './router.js';
import { handleWebhook } from './webhook.js';

const ORIGIN = 'https://ejemplo.test';
const DOOR_URL = `${ORIGIN}/telegram/puerta`;
const DOOR_ROW = [{ text: '🚪 Puerta', web_app: { url: DOOR_URL } }];
const NOW = Date.parse('2031-01-08T12:00:00-03:00');
const EVENTS = [
	{ slug: 'taller-inventado', title: 'Taller inventado', start: '2031-01-09T19:00:00-03:00' }
];
const ADMIN_TG = 5001;
const OTHER_TG = 6002;

/** @param {object} [over] */
const deps = (over = {}) => ({
	listUpcoming: vi.fn(async () => EVENTS),
	origin: ORIGIN,
	now: () => NOW,
	botUsername: 'BotDePrueba',
	...over
});

/**
 * @param {string} text
 * @param {{ type?: string, from?: number | null }} [o]
 */
const msg = (text, { type = 'private', from = ADMIN_TG } = {}) => ({
	update_id: 1,
	message: {
		chat: { id: from ?? 42, type },
		...(from === null ? {} : { from: { id: from, is_bot: false } }),
		text
	}
});

/** @param {string} data @param {{ type?: string, from?: number }} [o] */
const tap = (data, { type = 'private', from = ADMIN_TG } = {}) => ({
	update_id: 1,
	callback_query: {
		id: 'cb',
		from: { id: from },
		data,
		message: { message_id: 9, chat: { id: from, type } }
	}
});

/** @param {any} res @returns {any[][]} */
const keyboard = (res) => res?.reply_markup?.inline_keyboard ?? [];
/** @param {any} res */
const hasDoor = (res) =>
	keyboard(res).some((row) => row.some((/** @type {any} */ b) => b.text === '🚪 Puerta'));

describe('/inicio', () => {
	it('es la misma respuesta que /start, por privado y en un grupo', async () => {
		for (const type of ['private', 'group', 'supergroup']) {
			const start = await handleUpdate(msg('/start', { type }), deps());
			const inicio = await handleUpdate(msg('/inicio', { type }), deps());
			expect(inicio, type).toEqual(start);
			expect(inicio?.text).toContain('Hola, soy el bot de Kinky Vibe');
		}
	});

	it('con token también (el mismo plan), y con @bot o algo después', async () => {
		const start = await planUpdate(msg('/start'), { ...deps(), media: true });
		for (const text of ['/inicio', '/inicio@BotDePrueba', '/inicio semana']) {
			expect(await planUpdate(msg(text), { ...deps(), media: true }), text).toEqual(start);
		}
	});

	it('el deep link ?start=inicio y el botón «🏠 Inicio» muestran lo mismo', async () => {
		const start = await planUpdate(msg('/start'), deps());
		expect(await planUpdate(msg('/start inicio'), deps())).toEqual(start);
		const home = await planUpdate(tap('h'), deps());
		expect(home?.steps[0].method).toBe('editMessageText');
		expect(home?.steps[0].text).toBe(start?.steps[0].text);
		expect(home?.steps[0].reply_markup).toEqual(start?.steps[0].reply_markup);
	});

	it('/start <código> y /start adm_<código> siguen igual; /inicio no vincula nada', async () => {
		const accounts = {
			link: vi.fn(async () => /** @type {const} */ ('linked')),
			unlink: vi.fn(async () => true),
			setMuted: vi.fn(async () => true)
		};
		const adminLink = vi.fn(async () => ({ linked: 'admin-inventade' }));
		const d = deps({ accounts: async () => accounts, adminLink });

		const code = await handleUpdate(msg('/start ABCD2345'), d);
		expect(accounts.link).toHaveBeenCalledWith('ABCD2345', ADMIN_TG);
		expect(code?.text).toContain('quedó conectado');

		const adm = await handleUpdate(msg('/start adm_ABCD2345'), d);
		expect(adminLink).toHaveBeenCalledWith('adm_ABCD2345', ADMIN_TG);
		expect(adm?.text).toContain('quedó vinculado a le admin <b>admin-inventade</b>');
		expect(keyboard(adm)).toEqual([[{ text: '🚪 Abrir la puerta', web_app: { url: DOOR_URL } }]]);

		accounts.link.mockClear();
		adminLink.mockClear();
		for (const text of ['/inicio ABCD2345', '/inicio adm_ABCD2345']) {
			const res = await handleUpdate(msg(text), d);
			expect(res?.text).toContain('Hola, soy el bot de Kinky Vibe');
		}
		expect(accounts.link).not.toHaveBeenCalled();
		expect(adminLink).not.toHaveBeenCalled();
	});

	it('la ayuda nombra /inicio', async () => {
		const res = await handleUpdate(msg('/ayuda'), deps());
		expect(res?.text).toContain('/inicio: volver al inicio');
	});
});

describe('«🚪 Puerta» en el inicio (router)', () => {
	it('con `door` que dice que sí: el botón web_app con la URL de la puerta', async () => {
		const door = vi.fn(async () => true);
		for (const update of [msg('/start'), msg('/inicio'), msg('/start inicio'), tap('h')]) {
			door.mockClear();
			const res = await handleUpdate(update, deps({ door }));
			expect(door).toHaveBeenCalledTimes(1);
			expect(door).toHaveBeenCalledWith(ADMIN_TG);
			expect(keyboard(res)).toContainEqual(DOOR_ROW);
		}
	});

	it('la misma URL que «🚪 Abrir la puerta» de la confirmación del vínculo', async () => {
		const d = deps({ door: async () => true, adminLink: async () => ({ linked: 'x' }) });
		const linked = await handleUpdate(msg('/start adm_ABCD2345'), d);
		const home = await handleUpdate(msg('/inicio'), d);
		const door = keyboard(home)
			.flat()
			.find((b) => b.text === '🚪 Puerta');
		expect(door.web_app).toEqual(keyboard(linked)[0][0].web_app);
	});

	it('no: `door` dice que no, no hay `door` o no hay usuario', async () => {
		expect(hasDoor(await handleUpdate(msg('/inicio'), deps({ door: async () => false })))).toBe(
			false
		);
		expect(hasDoor(await handleUpdate(msg('/inicio'), deps()))).toBe(false);
		const door = vi.fn(async () => true);
		expect(hasDoor(await handleUpdate(msg('/inicio', { from: null }), deps({ door })))).toBe(false);
		expect(door).not.toHaveBeenCalled();
	});

	it('en un grupo ni se pregunta (web_app no anda en grupos)', async () => {
		const door = vi.fn(async () => true);
		for (const type of ['group', 'supergroup', 'channel']) {
			expect(hasDoor(await handleUpdate(msg('/inicio', { type }), deps({ door })))).toBe(false);
			expect(hasDoor(await planUpdate(tap('h', { type }), deps({ door })))).toBe(false);
		}
		expect(door).not.toHaveBeenCalled();
	});

	it('solo se pregunta para el inicio: las otras pantallas no miran nada', async () => {
		const door = vi.fn(async () => true);
		for (const text of ['/semana', '/ayuda', '/fondo', '/start semana']) {
			await handleUpdate(msg(text), deps({ door }));
		}
		await handleUpdate(tap('l:w:0'), deps({ door }));
		expect(door).not.toHaveBeenCalled();
	});

	it('si falla la consulta, el inicio sale igual, sin el botón', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await handleUpdate(
			msg('/inicio'),
			deps({ door: async () => Promise.reject(new Error('base caída')) })
		);
		expect(res?.text).toContain('Hola, soy el bot de Kinky Vibe');
		expect(hasDoor(res)).toBe(false);
		spy.mockRestore();
	});
});

describe('«🚪 Puerta» en el inicio (webhook como la ruta, base de prueba)', () => {
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
		clearFlagCache();
	});

	const SECRET = 'un-secreto-de-prueba-largo';
	const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };

	/**
	 * Lo mismo que arma `src/routes/api/telegram/+server.js` (sin token: la respuesta es el método).
	 *
	 * @param {object} update
	 */
	async function webhook(update) {
		const puerta = await isFlagOn(t.db, 'telegram_puerta');
		const res = await handleWebhook({
			request: new Request(`${ORIGIN}/api/telegram`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-telegram-bot-api-secret-token': SECRET
				},
				body: JSON.stringify(update)
			}),
			secret: SECRET,
			enabled: await isFlagOn(t.db, 'telegram_bot'),
			origin: ORIGIN,
			listUpcoming: async () => EVENTS,
			adminLink: puerta ? botAdminLink(t.db) : null,
			door: puerta ? botDoor(t.db) : null
		});
		const text = await res.text();
		return text ? JSON.parse(text) : null;
	}

	/** @param {{ bot?: boolean, puerta?: boolean }} flags */
	async function flags({ bot = true, puerta = true }) {
		await setFlag(t.db, 'telegram_bot', bot, { by: 'prueba' });
		await setFlag(t.db, 'telegram_puerta', puerta, { by: 'prueba' });
		clearFlagCache();
	}

	/** Vincula como desde el panel: código nuevo y `/start adm_<código>` desde ese usuario. */
	async function link() {
		const c = await createAdminLinkCode(t.db, ADMIN, { now: Date.now() - 60_000 });
		if (!c.ok) throw new Error('sin código');
		const r = await consumeAdminLinkCode(t.db, `adm_${c.code}`, ADMIN_TG);
		if (!r.ok) throw new Error('no vinculó');
	}

	it('admin vinculade, bot y puerta prendidos: «🚪 Puerta» en /start, /inicio y «🏠 Inicio»', async () => {
		await flags({});
		await link();
		for (const update of [msg('/start'), msg('/inicio'), tap('h')]) {
			const res = await webhook(update);
			expect(keyboard(res)).toContainEqual(DOOR_ROW);
		}
		// Las otras pantallas, sin cambios.
		expect(hasDoor(await webhook(msg('/semana')))).toBe(false);
	});

	it('admin sin vincular (o que se desvinculó): nada', async () => {
		await flags({});
		expect(hasDoor(await webhook(msg('/inicio')))).toBe(false);
		await link();
		expect(hasDoor(await webhook(msg('/inicio')))).toBe(true);
		await unlinkAdminTelegram(t.db, { user: ADMIN });
		expect(hasDoor(await webhook(msg('/inicio')))).toBe(false);
	});

	it('vinculade pero ya no está en ADMINS: nada', async () => {
		await flags({});
		const notAdmin = 999_999_999;
		expect(ADMINS.some((a) => a.id === notAdmin)).toBe(false);
		await t.db
			.prepare(
				`INSERT INTO telegram_admin_links (telegram_user_id, github_id, github_login, linked_at)
				VALUES (?1, ?2, 'ex-admin-inventade', ?3)`
			)
			.bind(String(ADMIN_TG), notAdmin, NOW)
			.run();
		expect(hasDoor(await webhook(msg('/inicio')))).toBe(false);
	});

	it('con la puerta apagada: el inicio de siempre', async () => {
		await flags({ puerta: false });
		await link();
		const res = await webhook(msg('/inicio'));
		expect(res?.text).toContain('Hola, soy el bot de Kinky Vibe');
		expect(hasDoor(res)).toBe(false);
	});

	it('con el bot apagado: no contesta nada', async () => {
		await flags({});
		await link();
		await flags({ bot: false });
		expect(await webhook(msg('/inicio'))).toBeNull();
		expect(await webhook(msg('/start'))).toBeNull();
	});

	it('en un grupo, aunque escriba le admin vinculade: nada', async () => {
		await flags({});
		await link();
		for (const type of ['group', 'supergroup']) {
			expect(hasDoor(await webhook(msg('/inicio', { type })))).toBe(false);
			expect(hasDoor(await webhook(msg('/start', { type })))).toBe(false);
		}
	});

	it('une usuarie común: el inicio de siempre, igual que sin puerta', async () => {
		await flags({});
		await link();
		const common = await webhook(msg('/inicio', { from: OTHER_TG }));
		expect(hasDoor(common)).toBe(false);
		await flags({ puerta: false });
		expect(await webhook(msg('/inicio', { from: OTHER_TG }))).toEqual(common);
	});
});
