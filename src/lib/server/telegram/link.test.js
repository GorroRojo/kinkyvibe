/**
 * Vincular un chat de Telegram con una cuenta (fase 2): el código se crea, vence, sirve una sola
 * vez y se guarda solo su hash; un chat es de una cuenta y una cuenta tiene un chat; desvincular,
 * silenciar y reanudar. D1 de miniflare; cuentas y chats inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeAccount } from '$lib/server/amigues/testing.js';
import { deleteAccount } from '$lib/server/cuentas/accounts.js';
import {
	LINK_ATTEMPTS_LIMIT,
	LINK_CODES_LIMIT,
	LINK_CODE_ALPHABET,
	LINK_CODE_LENGTH,
	LINK_CODE_TTL_MS,
	botAccounts,
	consumeLinkCode,
	createLinkCode,
	displayLinkCode,
	generateLinkCode,
	getTelegramLink,
	normalizeLinkCode,
	setChatMuted,
	unlinkAccount,
	unlinkChat
} from './link.js';

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

const NOW = Date.parse('2031-01-10T12:00:00-03:00');
/** Chats inventados. */
const CHAT = 111111111;
const OTRO_CHAT = 222222222;

/** @param {string} accountId @param {number} [now] */
async function newCode(accountId, now = NOW) {
	const r = await createLinkCode(t.db, accountId, { now });
	if (!r.ok) throw new Error('no se pudo crear el código');
	return r;
}

describe('el código', () => {
	it('tiene 8 caracteres del alfabeto sin 0/O ni 1/I, y cambia cada vez', () => {
		const a = generateLinkCode();
		expect(a).toHaveLength(LINK_CODE_LENGTH);
		for (const ch of a) expect(LINK_CODE_ALPHABET).toContain(ch);
		expect(LINK_CODE_ALPHABET).not.toMatch(/[01OI]/);
		expect(LINK_CODE_ALPHABET).toHaveLength(32);
		const many = new Set(Array.from({ length: 50 }, generateLinkCode));
		expect(many.size).toBe(50);
	});

	it('se lee sin importar mayúsculas, espacios ni guiones', () => {
		expect(normalizeLinkCode('abcd-2345')).toBe('ABCD2345');
		expect(normalizeLinkCode(' ABCD 2345 ')).toBe('ABCD2345');
		expect(displayLinkCode('ABCD2345')).toBe('ABCD-2345');
		expect(normalizeLinkCode('ABCD234')).toBeNull();
		expect(normalizeLinkCode('ABCD2340')).toBeNull(); // el 0 no está en el alfabeto
		expect(normalizeLinkCode(undefined)).toBeNull();
	});
});

describe('crear y usar un código', () => {
	it('se guarda solo el hash, vincula el chat y no sirve dos veces', async () => {
		const a = await makeAccount(t.db, 'tg-vincular');
		const { code, expiresAt } = await newCode(a.id);
		expect(expiresAt).toBe(NOW + LINK_CODE_TTL_MS);
		const { results } = await t.db.prepare('SELECT * FROM telegram_link_codes').all();
		expect(results).toHaveLength(1);
		expect(JSON.stringify(results)).not.toContain(code);
		expect(String(results[0].code_hash)).toMatch(/^[0-9a-f]{64}$/);

		expect(await consumeLinkCode(t.db, displayLinkCode(code), CHAT, { now: NOW + 1000 })).toEqual({
			ok: true,
			accountId: a.id
		});
		expect(await getTelegramLink(t.db, a.id)).toEqual({
			chatId: String(CHAT),
			linkedAt: NOW + 1000,
			muted: false
		});
		// Ya usado: ni desde otro chat.
		expect(await consumeLinkCode(t.db, code, OTRO_CHAT, { now: NOW + 2000 })).toEqual({
			ok: false,
			reason: 'invalid'
		});
		expect((await getTelegramLink(t.db, a.id))?.chatId).toBe(String(CHAT));
	});

	it('vencido (15 minutos) no sirve', async () => {
		const a = await makeAccount(t.db, 'tg-vencido');
		const { code } = await newCode(a.id);
		expect(
			await consumeLinkCode(t.db, code, CHAT, { now: NOW + LINK_CODE_TTL_MS + 1 })
		).toMatchObject({ ok: false, reason: 'invalid' });
		expect(await getTelegramLink(t.db, a.id)).toBeNull();
	});

	it('un código nuevo anula el anterior', async () => {
		const a = await makeAccount(t.db, 'tg-nuevo');
		const first = await newCode(a.id);
		const second = await newCode(a.id, NOW + 1000);
		expect(await consumeLinkCode(t.db, first.code, CHAT, { now: NOW + 2000 })).toMatchObject({
			ok: false
		});
		expect(await consumeLinkCode(t.db, second.code, CHAT, { now: NOW + 3000 })).toMatchObject({
			ok: true
		});
	});

	it('un código inventado no sirve, y los intentos se topean por chat', async () => {
		const a = await makeAccount(t.db, 'tg-tope');
		const { code } = await newCode(a.id);
		for (let i = 0; i < LINK_ATTEMPTS_LIMIT.limit; i++) {
			expect(await consumeLinkCode(t.db, 'ZZZZ-ZZZZ', CHAT, { now: NOW })).toMatchObject({
				reason: 'invalid'
			});
		}
		// Pasado el tope, ni el código bueno.
		expect(await consumeLinkCode(t.db, code, CHAT, { now: NOW })).toEqual({
			ok: false,
			reason: 'too_many'
		});
		// Otro chat no está topeado.
		expect(await consumeLinkCode(t.db, code, OTRO_CHAT, { now: NOW })).toMatchObject({ ok: true });
	});

	it('crear códigos también tiene tope por cuenta', async () => {
		const a = await makeAccount(t.db, 'tg-muchos');
		for (let i = 0; i < LINK_CODES_LIMIT.limit; i++) await newCode(a.id);
		expect(await createLinkCode(t.db, a.id, { now: NOW })).toEqual({
			ok: false,
			reason: 'too_many'
		});
	});

	it('el código de una cuenta borrada no sirve, y borrar la cuenta borra su chat', async () => {
		const a = await makeAccount(t.db, 'tg-borrada');
		const b = await makeAccount(t.db, 'tg-borrada-2');
		const { code } = await newCode(a.id);
		await consumeLinkCode(t.db, (await newCode(b.id)).code, OTRO_CHAT, { now: NOW });
		expect(await deleteAccount(t.db, a.id)).toBe(true);
		expect(await consumeLinkCode(t.db, code, CHAT, { now: NOW })).toMatchObject({ ok: false });
		expect(await deleteAccount(t.db, b.id)).toBe(true);
		expect(await getTelegramLink(t.db, b.id)).toBeNull();
		const { results } = await t.db.prepare('SELECT * FROM telegram_link_codes').all();
		expect(results).toEqual([]);
	});
});

describe('un chat, una cuenta', () => {
	it('vincular el mismo chat a otra cuenta se lo saca a la primera', async () => {
		const a = await makeAccount(t.db, 'tg-a');
		const b = await makeAccount(t.db, 'tg-b');
		await consumeLinkCode(t.db, (await newCode(a.id)).code, CHAT, { now: NOW });
		await consumeLinkCode(t.db, (await newCode(b.id)).code, CHAT, { now: NOW + 1 });
		expect(await getTelegramLink(t.db, a.id)).toBeNull();
		expect((await getTelegramLink(t.db, b.id))?.chatId).toBe(String(CHAT));
	});

	it('vincular la cuenta desde otro chat reemplaza el anterior', async () => {
		const a = await makeAccount(t.db, 'tg-dos-chats');
		await consumeLinkCode(t.db, (await newCode(a.id)).code, CHAT, { now: NOW });
		await consumeLinkCode(t.db, (await newCode(a.id)).code, OTRO_CHAT, { now: NOW + 1 });
		expect((await getTelegramLink(t.db, a.id))?.chatId).toBe(String(OTRO_CHAT));
		const { results } = await t.db.prepare('SELECT * FROM telegram_chats').all();
		expect(results).toHaveLength(1);
	});
});

describe('desvincular, silenciar y reanudar', () => {
	it('desde el bot y desde Mi rincón', async () => {
		const a = await makeAccount(t.db, 'tg-silenciar');
		await consumeLinkCode(t.db, (await newCode(a.id)).code, CHAT, { now: NOW });
		expect(await setChatMuted(t.db, CHAT, true)).toBe(true);
		expect((await getTelegramLink(t.db, a.id))?.muted).toBe(true);
		expect(await setChatMuted(t.db, CHAT, false)).toBe(true);
		expect((await getTelegramLink(t.db, a.id))?.muted).toBe(false);
		expect(await unlinkChat(t.db, CHAT)).toBe(true);
		expect(await unlinkChat(t.db, CHAT)).toBe(false);
		expect(await setChatMuted(t.db, CHAT, true)).toBe(false);

		await consumeLinkCode(t.db, (await newCode(a.id)).code, CHAT, { now: NOW });
		expect(await unlinkAccount(t.db, a.id)).toBe(true);
		expect(await getTelegramLink(t.db, a.id)).toBeNull();
	});

	it('botAccounts: lo que usa el router', async () => {
		const a = await makeAccount(t.db, 'tg-bot');
		const accounts = botAccounts(t.db);
		expect(await accounts.link('ZZZZZZZZ', CHAT)).toBe('invalid');
		const { code } = await createLinkCode(t.db, a.id).then((r) => /** @type {any} */ (r));
		expect(await accounts.link(code, CHAT)).toBe('linked');
		expect(await accounts.setMuted(CHAT, true)).toBe(true);
		expect(await accounts.unlink(CHAT)).toBe(true);
		expect(await accounts.unlink(CHAT)).toBe(false);
	});
});
