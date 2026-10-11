/**
 * La puerta por Mini App de Telegram: los permisos se miran en cada pedido (initData válido,
 * Telegram vinculado desde el panel a une admin que sigue en ADMINS) y el ingreso usa el mismo
 * `checkIn` que el panel. Base de prueba, datos inventados, token inventado.
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import { sellAtDoor } from '$lib/server/tickets/door.js';
import { createAdminLinkCode, consumeAdminLinkCode, unlinkAdminTelegram } from './adminLink.js';
import { doorAdmin, doorCheckIn, doorEnabled } from './puerta.js';

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

const TOKEN = '123456789:token-inventado-solo-para-pruebas';
const NOW = Date.parse('2031-01-08T23:00:00Z');
const EVENT = 'fiesta-de-prueba';
const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };
const ADMIN_LOGIN = ADMIN.login;

/** @param {number} userId @param {number} [authDate] */
function initData(userId, authDate = Math.floor(NOW / 1000) - 30) {
	const fields = { auth_date: String(authDate), user: JSON.stringify({ id: userId }) };
	const dcs = Object.entries(fields)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v}`)
		.join('\n');
	const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
	return new URLSearchParams({
		...fields,
		hash: createHmac('sha256', secret).update(dcs).digest('hex')
	}).toString();
}

/**
 * Vincula como desde el panel: código nuevo y `/start adm_<código>` desde ese usuario.
 *
 * @param {number} telegramUserId
 */
async function link(telegramUserId) {
	const c = await createAdminLinkCode(t.db, ADMIN, { now: NOW - 60_000 });
	if (!c.ok) throw new Error('sin código');
	const r = await consumeAdminLinkCode(t.db, `adm_${c.code}`, telegramUserId, {
		now: NOW - 30_000
	});
	if (!r.ok) throw new Error('no vinculó');
}

async function ticket() {
	const r = await sellAtDoor(t.db, {
		eventSlug: EVENT,
		type: { id: 'general', name: 'General', price: 8000, fondo: 0, capacity: 10, gorra: null },
		quantity: 1,
		holders: [{ name: 'Persona Inventada', pronouns: 'elle' }],
		buyer: { name: 'Persona Inventada', email: 'prueba@example.com', dni: '' },
		method: 'efectivo',
		by: 'admin-de-prueba',
		now: NOW
	});
	if (!r.ok) throw new Error('sin cupo');
	await t.db.prepare('UPDATE tickets SET checked_in_at = NULL, checked_in_by = NULL').run();
	return r.tickets[0];
}

describe('doorAdmin (en cada pedido)', () => {
	it('admin con el Telegram vinculado desde el panel: sí', async () => {
		await link(5001);
		const r = await doorAdmin({ db: t.db, initData: initData(5001), token: TOKEN, now: NOW });
		expect(r).toEqual({ ok: true, login: ADMIN_LOGIN, telegramUserId: 5001 });
	});

	it('initData inválido o viejo: no, sin mirar la base', async () => {
		const bad = await doorAdmin({ db: t.db, initData: 'auth_date=1', token: TOKEN, now: NOW });
		expect(bad).toEqual({ ok: false, reason: 'malformed' });
		const old = await doorAdmin({
			db: t.db,
			initData: initData(5001, Math.floor(NOW / 1000) - 7200),
			token: TOKEN,
			now: NOW
		});
		expect(old).toEqual({ ok: false, reason: 'stale' });
	});

	it('firma válida de un usuario de Telegram sin vincular: no', async () => {
		await link(5001);
		const r = await doorAdmin({ db: t.db, initData: initData(5002), token: TOKEN, now: NOW });
		expect(r).toEqual({ ok: false, reason: 'not_linked' });
	});

	it('vinculade pero ya no está en ADMINS: no (sacarle de la lista le corta la puerta)', async () => {
		// Una fila que quedó de alguien que era admin (id de GitHub inventado, fuera de ADMINS).
		await t.db
			.prepare(
				`INSERT INTO telegram_admin_links (telegram_user_id, github_id, github_login, linked_at)
				VALUES ('5003', 999999999, 'ex-admin-inventade', 1)`
			)
			.run();
		const r = await doorAdmin({ db: t.db, initData: initData(5003), token: TOKEN, now: NOW });
		expect(r).toEqual({ ok: false, reason: 'not_admin' });
	});

	it('después de «Desvincular»: no', async () => {
		await link(5004);
		const ask = () => doorAdmin({ db: t.db, initData: initData(5004), token: TOKEN, now: NOW });
		expect((await ask()).ok).toBe(true);
		await unlinkAdminTelegram(t.db, { user: ADMIN }, { now: NOW });
		expect(await ask()).toEqual({ ok: false, reason: 'not_linked' });
	});
});

describe('doorCheckIn', () => {
	it('marca el ingreso con el mismo checkIn del panel; la segunda vez dice que ya ingresó', async () => {
		await link(5003);
		const tk = await ticket();
		const input = {
			db: t.db,
			initData: initData(5003),
			token: TOKEN,
			eventSlug: EVENT,
			code: `https://ejemplo.test/entradas/t/${tk.token}`,
			now: NOW
		};
		const first = await doorCheckIn(input);
		expect(first).toEqual({
			status: 200,
			body: { result: 'ok', holder: 'Persona Inventada', checkedInAt: NOW }
		});
		const row = await t.db
			.prepare('SELECT checked_in_by FROM tickets WHERE id = ?1')
			.bind(tk.id)
			.first();
		expect(row?.checked_in_by).toBe(ADMIN_LOGIN);
		expect((await doorCheckIn(input)).body.result).toBe('already');
		expect((await doorCheckIn({ ...input, eventSlug: 'otro-evento' })).body).toEqual({
			result: 'wrong-event'
		});
	});

	it('sin permiso: 403 y no toca la entrada', async () => {
		const tk = await ticket();
		const r = await doorCheckIn({
			db: t.db,
			initData: initData(5999),
			token: TOKEN,
			eventSlug: EVENT,
			code: tk.token,
			now: NOW
		});
		expect(r.status).toBe(403);
		const row = await t.db
			.prepare('SELECT checked_in_at FROM tickets WHERE id = ?1')
			.bind(tk.id)
			.first();
		expect(row?.checked_in_at).toBeNull();
	});
});

describe('doorEnabled (interruptores)', () => {
	it('sale apagada; pide el bot y la puerta prendidos', async () => {
		clearFlagCache();
		expect(await doorEnabled(t.db)).toBe(false);
		await setFlag(t.db, 'telegram_puerta', true, { by: 'prueba' });
		clearFlagCache();
		expect(await doorEnabled(t.db)).toBe(false);
		await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
		clearFlagCache();
		expect(await doorEnabled(t.db)).toBe(true);
		await setFlag(t.db, 'telegram_puerta', false, { by: 'prueba' });
		clearFlagCache();
		expect(await doorEnabled(t.db)).toBe(false);
		expect(await doorEnabled(null)).toBe(false);
		clearFlagCache();
	});
});
