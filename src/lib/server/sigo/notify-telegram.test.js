/**
 * Avisos de «Lo que sigo» por Telegram (fase 2 del bot): al chat vinculado, con sus casillas,
 * uno por cuenta, evento, tipo y canal (aunque el cron corra muchas veces), nada entre las 23 y
 * las 9 (sale a las 9), nada con el chat silenciado, y el mail sigue por su lado. Reloj fijo y
 * envío de mentira; D1 de miniflare; cuentas, chats y eventos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeAccount } from '$lib/server/amigues/testing.js';
import { DAY, fakeEvent, fakeSend, insertOrder } from '$lib/server/series/fixtures.js';
import tagsFactory from '$lib/utils/tags';
import {
	consumeLinkCode,
	createLinkCode,
	getTelegramLink,
	setChatMuted
} from '../telegram/link.js';
import { follow, getFollow, listFollows, setFollowOptions } from './follows.js';
import { runFollowNotifications } from './notify.js';

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

const HOUR = 60 * 60 * 1000;
/** Mediodía en Argentina. */
const NOW = Date.parse('2031-03-03T12:00:00-03:00');
const ORIGIN = 'https://kinkyvibe.ar';
const tags = tagsFactory();
const TAG = { kind: /** @type {const} */ ('etiqueta'), key: 'Picantearla' };
const CHAT = 333333333;

/** Un envío por Telegram de mentira. @param {'sent' | 'failed' | 'blocked'} [result] */
function fakeTelegram(result = 'sent') {
	/** @type {{ chatId: string, text: string }[]} */
	const sent = [];
	const state = { result };
	/** @type {import('../telegram/send.js').TelegramSend} */
	const send = async (chatId, text) => {
		sent.push({ chatId, text });
		return state.result;
	};
	return { sent, state, send };
}

/**
 * Una cuenta que sigue la etiqueta con lo que se pida y, si `chat`, su chat vinculado.
 *
 * @param {string} name
 * @param {{ mail_nuevo?: boolean, recordatorio?: boolean, telegram_nuevo?: boolean,
 *   telegram_recordatorio?: boolean }} options
 * @param {{ chat?: number | null, linkedAt?: number, followedAt?: number }} [o]
 */
async function account(
	name,
	options,
	{ chat = CHAT, linkedAt = NOW - DAY, followedAt = NOW - 2 * DAY } = {}
) {
	const a = await makeAccount(t.db, name);
	await follow(t.db, a.id, TAG, { now: followedAt });
	await setFollowOptions(
		t.db,
		a.id,
		TAG,
		{
			calendario: true,
			mail_nuevo: false,
			recordatorio: false,
			telegram_nuevo: false,
			telegram_recordatorio: false,
			...options
		},
		{ now: followedAt }
	);
	if (chat !== null) {
		const r = /** @type {any} */ (await createLinkCode(t.db, a.id, { now: linkedAt }));
		expect(await consumeLinkCode(t.db, r.code, chat, { now: linkedAt })).toMatchObject({
			ok: true
		});
	}
	return a;
}

/** @param {Partial<Parameters<typeof runFollowNotifications>[0]>} o */
const run = (o) =>
	runFollowNotifications({
		db: t.db,
		posts: [],
		tags,
		origin: ORIGIN,
		send: fakeSend(),
		now: NOW,
		...o
	});

describe('las casillas de Telegram en follows', () => {
	it('se guardan aparte de options y no cambian si el formulario no las trae', async () => {
		const a = await account('tg-opciones', { telegram_recordatorio: true }, { chat: null });
		expect((await getFollow(t.db, a.id, TAG))?.telegram).toEqual({
			telegram_nuevo: false,
			telegram_recordatorio: true
		});
		await setFollowOptions(t.db, a.id, TAG, {
			calendario: false,
			mail_nuevo: true,
			recordatorio: false
		});
		const [row] = await listFollows(t.db, a.id);
		expect(row.options).toEqual({ calendario: false, mail_nuevo: true, recordatorio: false });
		expect(row.telegram.telegram_recordatorio).toBe(true);
	});
});

describe('recordatorio por Telegram', () => {
	it('sale una sola vez al chat vinculado, con título, fecha y link', async () => {
		await account('tg-recordatorio', { telegram_recordatorio: true });
		const posts = [fakeEvent('manana-tg', NOW + 20 * HOUR, ['Picantearla'])];
		const tg = fakeTelegram();
		const mail = fakeSend();
		expect(await run({ posts, telegram: tg, send: mail })).toMatchObject({
			sent: 0,
			telegram: { sent: 1, failed: 0, quiet: false }
		});
		expect(tg.sent).toHaveLength(1);
		expect(tg.sent[0].chatId).toBe(String(CHAT));
		expect(tg.sent[0].text).toContain('Recordatorio');
		expect(tg.sent[0].text).toContain('<b>Evento de prueba manana-tg</b>');
		expect(tg.sent[0].text).toContain('https://kinkyvibe.ar/calendario/manana-tg');
		// Nada de otras cosas seguidas ni del lugar.
		expect(tg.sent[0].text).not.toContain('Picantearla');
		expect(mail.sent).toEqual([]);
		// El cron corre cada 15 minutos: no se repite.
		expect(await run({ posts, telegram: tg, now: NOW + 15 * 60 * 1000 })).toMatchObject({
			telegram: { sent: 0 }
		});
		expect(tg.sent).toHaveLength(1);
	});

	it('mail y Telegram van cada uno por su lado (una fila por canal)', async () => {
		await account('tg-y-mail', { recordatorio: true, telegram_recordatorio: true });
		const posts = [fakeEvent('los-dos', NOW + 20 * HOUR, ['Picantearla'])];
		const tg = fakeTelegram();
		const mail = fakeSend();
		expect(await run({ posts, telegram: tg, send: mail })).toMatchObject({
			sent: 1,
			telegram: { sent: 1 }
		});
		const { results } = await t.db
			.prepare('SELECT kind, channel FROM follow_notifications ORDER BY channel')
			.all();
		expect(results).toEqual([
			{ kind: 'recordatorio', channel: 'mail' },
			{ kind: 'recordatorio', channel: 'telegram' }
		]);
	});

	it('con entrada para el evento no sale ni por Telegram ni por mail', async () => {
		const a = await account('tg-con-entrada', { recordatorio: true, telegram_recordatorio: true });
		await insertOrder(t.db, { email: a.email, slug: 'con-entrada', now: NOW - DAY });
		const posts = [fakeEvent('con-entrada', NOW + 20 * HOUR, ['Picantearla'])];
		const tg = fakeTelegram();
		const mail = fakeSend();
		expect(await run({ posts, telegram: tg, send: mail })).toMatchObject({
			sent: 0,
			telegram: { sent: 0 }
		});
		expect(tg.sent).toEqual([]);
		expect(mail.sent).toEqual([]);
	});

	it('sin el canal (bot apagado o sin token) no sale nada por Telegram y el mail sigue', async () => {
		await account('tg-sin-canal', { recordatorio: true, telegram_recordatorio: true });
		const posts = [fakeEvent('sin-canal', NOW + 20 * HOUR, ['Picantearla'])];
		const r = await run({ posts, telegram: null });
		expect(r).toMatchObject({ sent: 1, telegram: null });
		const { results } = await t.db.prepare('SELECT channel FROM follow_notifications').all();
		expect(results).toEqual([{ channel: 'mail' }]);
	});

	it('sin chat vinculado, o sin la casilla, no sale', async () => {
		await account('tg-sin-chat', { telegram_recordatorio: true }, { chat: null });
		await account('tg-sin-casilla', { recordatorio: false }, { chat: CHAT + 1 });
		const tg = fakeTelegram();
		await run({ posts: [fakeEvent('nadie', NOW + 20 * HOUR, ['Picantearla'])], telegram: tg });
		expect(tg.sent).toEqual([]);
	});
});

describe('horario de silencio', () => {
	it('entre las 23 y las 9 no sale; a las 9 sí, una vez; el mail no espera', async () => {
		await account('tg-noche', { recordatorio: true, telegram_recordatorio: true });
		const night = Date.parse('2031-03-03T23:30:00-03:00');
		const posts = [fakeEvent('a-la-manana', night + 20 * HOUR, ['Picantearla'])];
		const tg = fakeTelegram();
		const mail = fakeSend();
		expect(await run({ posts, telegram: tg, send: mail, now: night })).toMatchObject({
			sent: 1,
			telegram: { sent: 0, quiet: true }
		});
		const early = Date.parse('2031-03-04T08:59:00-03:00');
		expect(await run({ posts, telegram: tg, send: mail, now: early })).toMatchObject({
			telegram: { sent: 0, quiet: true }
		});
		expect(tg.sent).toEqual([]);
		const { results } = await t.db.prepare('SELECT channel FROM follow_notifications').all();
		expect(results).toEqual([{ channel: 'mail' }]);

		const nine = Date.parse('2031-03-04T09:00:00-03:00');
		expect(await run({ posts, telegram: tg, send: mail, now: nine })).toMatchObject({
			sent: 0,
			telegram: { sent: 1, quiet: false }
		});
		expect(
			await run({ posts, telegram: tg, send: mail, now: nine + 15 * 60 * 1000 })
		).toMatchObject({ telegram: { sent: 0 } });
		expect(tg.sent).toHaveLength(1);
		expect(mail.sent).toHaveLength(1);
	});
});

describe('/silenciar', () => {
	it('con el chat silenciado no sale nada; al reanudar, lo pendiente sale', async () => {
		await account('tg-silencio', { telegram_recordatorio: true });
		await setChatMuted(t.db, CHAT, true);
		const posts = [fakeEvent('silenciado', NOW + 20 * HOUR, ['Picantearla'])];
		const tg = fakeTelegram();
		await run({ posts, telegram: tg });
		expect(tg.sent).toEqual([]);
		await setChatMuted(t.db, CHAT, false);
		await run({ posts, telegram: tg, now: NOW + 1000 });
		expect(tg.sent).toHaveLength(1);
	});
});

describe('algo nuevo por Telegram', () => {
	it('solo de lo que se anunció después de vincular el chat', async () => {
		const a = await account(
			'tg-nuevo',
			{ mail_nuevo: true, telegram_nuevo: true },
			{ linkedAt: NOW + 500 }
		);
		// La primera corrida anota lo que ya estaba (sin avisar).
		await run({ posts: [fakeEvent('semilla', NOW + 30 * DAY, ['otra'])] });
		const before = fakeEvent('antes-de-vincular', NOW + 10 * DAY, ['Picantearla']);
		const tg = fakeTelegram();
		const mail = fakeSend();
		// Se ve en NOW + 100, antes de vincular (NOW + 500): mail sí, Telegram no.
		await run({ posts: [before], telegram: tg, send: mail, now: NOW + 100 });
		expect(mail.sent).toHaveLength(1);
		expect(tg.sent).toEqual([]);
		const after = fakeEvent('despues-de-vincular', NOW + 12 * DAY, ['Picantearla']);
		await run({ posts: [before, after], telegram: tg, send: mail, now: NOW + 1000 });
		expect(tg.sent).toHaveLength(1);
		expect(tg.sent[0].text).toContain('Se anunció algo nuevo');
		expect(tg.sent[0].text).toContain('/calendario/despues-de-vincular');
		expect(mail.sent).toHaveLength(2);
		expect((await getTelegramLink(t.db, a.id))?.chatId).toBe(String(CHAT));
	});
});

describe('cuando Telegram no recibe', () => {
	it('si falla, se suelta la fila y se reintenta en la próxima', async () => {
		await account('tg-falla', { telegram_recordatorio: true });
		const posts = [fakeEvent('reintento', NOW + 20 * HOUR, ['Picantearla'])];
		const tg = fakeTelegram('failed');
		expect(await run({ posts, telegram: tg })).toMatchObject({ telegram: { failed: 1 } });
		tg.state.result = 'sent';
		expect(await run({ posts, telegram: tg, now: NOW + 1000 })).toMatchObject({
			telegram: { sent: 1 }
		});
		expect(await run({ posts, telegram: tg, now: NOW + 2000 })).toMatchObject({
			telegram: { sent: 0 }
		});
	});

	it('si bloqueó al bot, se desvincula el chat y no se insiste', async () => {
		const a = await account('tg-bloqueo', { telegram_recordatorio: true, telegram_nuevo: true });
		const posts = [
			fakeEvent('bloqueado-1', NOW + 20 * HOUR, ['Picantearla']),
			fakeEvent('bloqueado-2', NOW + 21 * HOUR, ['Picantearla'])
		];
		const tg = fakeTelegram('blocked');
		await run({ posts, telegram: tg });
		expect(tg.sent).toHaveLength(1);
		expect(await getTelegramLink(t.db, a.id)).toBeNull();
		await run({ posts, telegram: tg, now: NOW + 1000 });
		expect(tg.sent).toHaveLength(1);
	});

	it('el tope por corrida de Telegram es aparte del de mails', async () => {
		await account('tg-tope', { recordatorio: true, telegram_recordatorio: true });
		const posts = [
			fakeEvent('tope-1', NOW + 20 * HOUR, ['Picantearla']),
			fakeEvent('tope-2', NOW + 21 * HOUR, ['Picantearla'])
		];
		const tg = fakeTelegram();
		const mail = fakeSend();
		expect(
			await run({ posts, telegram: tg, send: mail, limit: 0, telegramLimit: 1 })
		).toMatchObject({ sent: 0, telegram: { sent: 1 } });
	});
});
