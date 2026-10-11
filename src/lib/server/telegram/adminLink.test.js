/**
 * Vincular el Telegram de une admin desde el panel (la puerta por Telegram): códigos de un solo
 * uso que vencen, solo el hash en la base, `/start adm_<código>`, desvincular y el registro.
 * Base de prueba; ids de Telegram inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { sha256Hex } from '$lib/server/hash.js';
import { listAudit } from '$lib/server/admin/audit.js';
import {
	ADMIN_LINK_ATTEMPTS_LIMIT,
	ADMIN_LINK_CODES_LIMIT,
	ADMIN_LINK_CODE_TTL_MS,
	adminStartParam,
	botAdminLink,
	consumeAdminLinkCode,
	createAdminLinkCode,
	getAdminTelegramLink,
	linkedAdmin,
	linkedAdminIds,
	unlinkAdminTelegram
} from './adminLink.js';
import { LINK_CODE_LENGTH } from './link.js';

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

const NOW = Date.parse('2031-01-08T20:00:00Z');
const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };
const OTHER = { id: ADMINS[1].id, login: ADMINS[1].login };
const TG = 7001;

/** @param {typeof ADMIN} [admin] @param {number} [now] */
async function newCode(admin = ADMIN, now = NOW) {
	const r = await createAdminLinkCode(t.db, admin, { now });
	if (!r.ok) throw new Error(r.reason);
	return r;
}

const codeRows = () =>
	t.db
		.prepare('SELECT * FROM telegram_admin_link_codes ORDER BY created_at')
		.all()
		.then((r) => r.results);

describe('createAdminLinkCode', () => {
	it('crea un código corto que vence en 15 minutos y guarda solo su hash', async () => {
		const r = await newCode();
		expect(r.code).toMatch(new RegExp(`^[2-9A-HJ-NP-Z]{${LINK_CODE_LENGTH}}$`));
		expect(r.expiresAt).toBe(NOW + 15 * 60 * 1000);
		expect(ADMIN_LINK_CODE_TTL_MS).toBe(15 * 60 * 1000);
		const rows = await codeRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			code_hash: await sha256Hex(r.code),
			github_id: ADMIN.id,
			github_login: ADMIN.login,
			created_at: NOW,
			expires_at: NOW + ADMIN_LINK_CODE_TTL_MS,
			used_at: null
		});
		// El código no aparece en ninguna columna.
		expect(JSON.stringify(rows)).not.toContain(r.code);
		expect(adminStartParam(r.code)).toBe(`adm_${r.code}`);
	});

	it('uno nuevo anula el anterior de le misme admin, no el de otres', async () => {
		const first = await newCode();
		const other = await newCode(OTHER);
		const second = await newCode(ADMIN, NOW + 1000);
		const hashes = (await codeRows()).map((r) => r.code_hash);
		expect(hashes).not.toContain(await sha256Hex(first.code));
		expect(hashes).toContain(await sha256Hex(other.code));
		expect(hashes).toContain(await sha256Hex(second.code));
		expect(await consumeAdminLinkCode(t.db, adminStartParam(first.code), TG, { now: NOW })).toEqual(
			{ ok: false, reason: 'invalid' }
		);
	});

	it('quien no es admin no crea códigos; hay tope por hora', async () => {
		expect(
			await createAdminLinkCode(t.db, { id: 999999999, login: 'nadie' }, { now: NOW })
		).toEqual({ ok: false, reason: 'not_admin' });
		for (let i = 0; i < ADMIN_LINK_CODES_LIMIT.limit; i++) await newCode(ADMIN, NOW + i);
		expect(await createAdminLinkCode(t.db, ADMIN, { now: NOW + 100 })).toEqual({
			ok: false,
			reason: 'too_many'
		});
	});
});

describe('consumeAdminLinkCode (/start adm_<código>)', () => {
	it('vincula id de GitHub ↔ usuario de Telegram, gasta el código y deja registro', async () => {
		const c = await newCode();
		const r = await consumeAdminLinkCode(t.db, adminStartParam(c.code), TG, { now: NOW + 1000 });
		expect(r).toEqual({ ok: true, login: ADMIN.login, replaced: false });
		expect(await linkedAdmin(t.db, TG)).toEqual(ADMIN);
		expect(await getAdminTelegramLink(t.db, ADMIN.id)).toEqual({ linkedAt: NOW + 1000 });
		expect([...(await linkedAdminIds(t.db))]).toEqual([ADMIN.id]);
		expect((await codeRows())[0].used_at).toBe(NOW + 1000);
		const audit = await listAudit(t.db);
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({
			at: NOW + 1000,
			actorId: ADMIN.id,
			actorLogin: ADMIN.login,
			action: 'telegram.admin_link',
			targetType: 'admin',
			targetId: ADMIN.login,
			detail: { replaced: false }
		});
		// Del usuario de Telegram, nada en el registro.
		expect(JSON.stringify(audit)).not.toContain(String(TG));
	});

	it('un código se usa una sola vez (ni el mismo usuario ni otro)', async () => {
		const c = await newCode();
		const param = adminStartParam(c.code);
		expect((await consumeAdminLinkCode(t.db, param, TG, { now: NOW + 1 })).ok).toBe(true);
		expect(await consumeAdminLinkCode(t.db, param, TG, { now: NOW + 2 })).toEqual({
			ok: false,
			reason: 'invalid'
		});
		expect(await consumeAdminLinkCode(t.db, param, 7002, { now: NOW + 3 })).toEqual({
			ok: false,
			reason: 'invalid'
		});
		expect(await linkedAdmin(t.db, 7002)).toBeNull();
		expect((await listAudit(t.db)).length).toBe(1);
	});

	it('vencido: no vincula', async () => {
		const c = await newCode();
		const late = NOW + ADMIN_LINK_CODE_TTL_MS;
		expect(await consumeAdminLinkCode(t.db, adminStartParam(c.code), TG, { now: late })).toEqual({
			ok: false,
			reason: 'invalid'
		});
		expect(await linkedAdmin(t.db, TG)).toBeNull();
		expect(await listAudit(t.db)).toEqual([]);
	});

	it('inventado, mal formado, sin prefijo o con id de Telegram raro: no vincula', async () => {
		const c = await newCode();
		for (const param of [
			'adm_ZZZZZZZZ',
			'adm_',
			'adm_abc',
			`adm_${c.code}X`,
			c.code,
			`seguir-${c.code}`
		]) {
			expect(await consumeAdminLinkCode(t.db, param, TG, { now: NOW }), param).toEqual({
				ok: false,
				reason: 'invalid'
			});
		}
		for (const id of [0, -5, 1.5, Number.NaN]) {
			expect(await consumeAdminLinkCode(t.db, adminStartParam(c.code), id, { now: NOW })).toEqual({
				ok: false,
				reason: 'invalid'
			});
		}
		// El código bueno sigue sirviendo: los intentos fallidos no lo gastaron.
		expect((await consumeAdminLinkCode(t.db, adminStartParam(c.code), TG, { now: NOW })).ok).toBe(
			true
		);
	});

	it('acepta el código en minúsculas o con guion (como lo normaliza Mi rincón)', async () => {
		const c = await newCode();
		const messy = `adm_${c.code.slice(0, 4).toLowerCase()}-${c.code.slice(4)}`;
		expect((await consumeAdminLinkCode(t.db, messy, TG, { now: NOW })).ok).toBe(true);
	});

	it('si le sacaron de ADMINS entre crear el código y usarlo: no vincula y el código se gasta', async () => {
		const c = await newCode();
		// Le misme código, pero a nombre de un id que ya no está en ADMINS.
		await t.db.prepare('UPDATE telegram_admin_link_codes SET github_id = 999999999').run();
		const param = adminStartParam(c.code);
		expect(await consumeAdminLinkCode(t.db, param, TG, { now: NOW })).toEqual({
			ok: false,
			reason: 'invalid'
		});
		expect(await linkedAdmin(t.db, TG)).toBeNull();
		expect((await codeRows())[0].used_at).toBe(NOW);
	});

	it('tope de intentos por usuario de Telegram', async () => {
		for (let i = 0; i < ADMIN_LINK_ATTEMPTS_LIMIT.limit; i++) {
			await consumeAdminLinkCode(t.db, 'adm_ZZZZZZZZ', TG, { now: NOW + i });
		}
		const c = await newCode();
		expect(await consumeAdminLinkCode(t.db, adminStartParam(c.code), TG, { now: NOW })).toEqual({
			ok: false,
			reason: 'too_many'
		});
		// Otro usuario de Telegram no está topeado.
		expect((await consumeAdminLinkCode(t.db, adminStartParam(c.code), 7002, { now: NOW })).ok).toBe(
			true
		);
	});

	it('vincular de nuevo reemplaza: une admin, un Telegram; un Telegram, une admin', async () => {
		const a = await newCode();
		await consumeAdminLinkCode(t.db, adminStartParam(a.code), TG, { now: NOW });
		// Le misme admin desde otro Telegram.
		const b = await newCode(ADMIN, NOW + 10);
		expect(
			await consumeAdminLinkCode(t.db, adminStartParam(b.code), 7002, { now: NOW + 20 })
		).toEqual({ ok: true, login: ADMIN.login, replaced: true });
		expect(await linkedAdmin(t.db, TG)).toBeNull();
		expect(await linkedAdmin(t.db, 7002)).toEqual(ADMIN);
		// Otre admin desde ese mismo Telegram.
		const o = await newCode(OTHER, NOW + 30);
		await consumeAdminLinkCode(t.db, adminStartParam(o.code), 7002, { now: NOW + 40 });
		expect(await linkedAdmin(t.db, 7002)).toEqual(OTHER);
		expect(await getAdminTelegramLink(t.db, ADMIN.id)).toBeNull();
		const audit = await listAudit(t.db);
		expect(audit.map((e) => [e.action, e.actorLogin, e.detail])).toEqual([
			['telegram.admin_link', OTHER.login, { replaced: true }],
			['telegram.admin_link', ADMIN.login, { replaced: true }],
			['telegram.admin_link', ADMIN.login, { replaced: false }]
		]);
	});

	it('botAdminLink: lo que usa el bot', async () => {
		const c = await newCode();
		const link = botAdminLink(t.db);
		expect(await link(adminStartParam(c.code), TG)).toEqual({ linked: ADMIN.login });
		expect(await link(adminStartParam(c.code), TG)).toBe('invalid');
	});
});

describe('unlinkAdminTelegram («Desvincular»)', () => {
	it('borra el vínculo y los códigos, y deja registro', async () => {
		const c = await newCode();
		await consumeAdminLinkCode(t.db, adminStartParam(c.code), TG, { now: NOW });
		await newCode(ADMIN, NOW + 10);
		const other = await newCode(OTHER, NOW + 10);
		expect(await unlinkAdminTelegram(t.db, { user: ADMIN }, { now: NOW + 100 })).toBe(true);
		expect(await linkedAdmin(t.db, TG)).toBeNull();
		expect(await getAdminTelegramLink(t.db, ADMIN.id)).toBeNull();
		expect((await codeRows()).map((r) => r.code_hash)).toEqual([await sha256Hex(other.code)]);
		const [last] = await listAudit(t.db);
		expect(last).toMatchObject({
			at: NOW + 100,
			actorId: ADMIN.id,
			actorLogin: ADMIN.login,
			action: 'telegram.admin_unlink',
			targetType: 'admin',
			targetId: ADMIN.login
		});
	});

	it('sin vínculo: no hace nada ni deja registro; no toca el de otres', async () => {
		const o = await newCode(OTHER);
		await consumeAdminLinkCode(t.db, adminStartParam(o.code), TG, { now: NOW });
		const before = (await listAudit(t.db)).length;
		expect(await unlinkAdminTelegram(t.db, { user: ADMIN }, { now: NOW })).toBe(false);
		expect(await linkedAdmin(t.db, TG)).toEqual(OTHER);
		expect((await listAudit(t.db)).length).toBe(before);
		expect(await unlinkAdminTelegram(t.db, { user: null }, { now: NOW })).toBe(false);
	});
});
