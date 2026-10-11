/**
 * Prototipo de la puerta por Mini App: los permisos se miran en cada pedido (initData válido,
 * chat vinculado, cuenta mapeada a une admin que sigue en ADMINS) y el ingreso usa el mismo
 * `checkIn` que el panel. Base de prueba, datos inventados, token inventado.
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { makeAccount } from '$lib/server/amigues/testing.js';
import { sellAtDoor } from '$lib/server/tickets/door.js';
import { doorAdmin, doorCheckIn, parseDoorAdmins } from './puerta.js';

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
const ADMIN_LOGIN = ADMINS[0].login;

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

/** @param {string} accountId @param {number} chatId */
const link = (accountId, chatId) =>
	t.db
		.prepare(
			`INSERT INTO telegram_chats (account_id, chat_id, linked_at, muted, updated_at)
			VALUES (?1, ?2, 1, 0, 1)`
		)
		.bind(accountId, String(chatId))
		.run();

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

describe('parseDoorAdmins', () => {
	it('lee login=cuenta separados por comas e ignora lo raro', () => {
		const m = parseDoorAdmins(' alguien=abcdef12-3456 , roto, =x, otre=zzzzzzzz ');
		expect([...m]).toEqual([
			['abcdef12-3456', 'alguien'],
			['zzzzzzzz', 'otre']
		]);
	});
});

describe('doorAdmin (en cada pedido)', () => {
	it('admin con la cuenta vinculada y mapeada: sí', async () => {
		const a = await makeAccount(t.db, 'puerta-admin');
		await link(a.id, 5001);
		const r = await doorAdmin({
			db: t.db,
			initData: initData(5001),
			token: TOKEN,
			doorAdmins: `${ADMIN_LOGIN}=${a.id}`,
			now: NOW
		});
		expect(r).toEqual({ ok: true, login: ADMIN_LOGIN, telegramUserId: 5001 });
	});

	it('initData inválido o viejo: no, sin mirar la base', async () => {
		const bad = await doorAdmin({
			db: t.db,
			initData: 'auth_date=1',
			token: TOKEN,
			doorAdmins: '',
			now: NOW
		});
		expect(bad).toEqual({ ok: false, reason: 'malformed' });
		const old = await doorAdmin({
			db: t.db,
			initData: initData(5001, Math.floor(NOW / 1000) - 7200),
			token: TOKEN,
			doorAdmins: '',
			now: NOW
		});
		expect(old).toEqual({ ok: false, reason: 'stale' });
	});

	it('sin chat vinculado, cuenta que no es admin, login que ya no está en ADMINS o cuenta borrada: no', async () => {
		const a = await makeAccount(t.db, 'puerta-no-admin');
		const ask = (/** @type {string} */ doorAdmins) =>
			doorAdmin({ db: t.db, initData: initData(5002), token: TOKEN, doorAdmins, now: NOW });
		expect(await ask(`${ADMIN_LOGIN}=${a.id}`)).toEqual({ ok: false, reason: 'not_linked' });
		await link(a.id, 5002);
		expect(await ask('')).toEqual({ ok: false, reason: 'not_admin' });
		expect(await ask(`login-que-no-es-admin=${a.id}`)).toEqual({ ok: false, reason: 'not_admin' });
		expect((await ask(`${ADMIN_LOGIN}=${a.id}`)).ok).toBe(true);
		await t.db
			.prepare(
				'UPDATE accounts SET deleted_at = 1, email = NULL, password_hash = NULL, email_verified_at = NULL WHERE id = ?1'
			)
			.bind(a.id)
			.run();
		expect(await ask(`${ADMIN_LOGIN}=${a.id}`)).toEqual({ ok: false, reason: 'not_linked' });
	});
});

describe('doorCheckIn', () => {
	it('marca el ingreso con el mismo checkIn del panel; la segunda vez dice que ya ingresó', async () => {
		const a = await makeAccount(t.db, 'puerta-admin-2');
		await link(a.id, 5003);
		const tk = await ticket();
		const input = {
			db: t.db,
			initData: initData(5003),
			token: TOKEN,
			doorAdmins: `${ADMIN_LOGIN}=${a.id}`,
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
			doorAdmins: '',
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
