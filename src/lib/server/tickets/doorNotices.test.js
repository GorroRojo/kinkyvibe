/**
 * Avisos de puerta (decisión 0051): un aviso es de una cuenta o de un mail (solo su hash), avisa
 * solo en los eventos de Kinky Vibe, vence siempre (el cron lo borra y avisa una vez antes) y el
 * motivo nunca sale del panel: ni a la puerta, ni al registro, ni al mail. D1 de miniflare; datos
 * inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import {
	DOOR_NOTICE_MAX_MS,
	DOOR_NOTICE_TEXT,
	doorNoticeExpiry,
	doorNoticeMaxDate
} from '$lib/utils/doorNotices.js';
import {
	addDoorNotice,
	buildDoorNoticeReminderEmail,
	doorNoticeMatcher,
	isKinkyVibeDoor,
	listDoorNotices,
	noticeEmailHash,
	removeDoorNotice,
	renewDoorNotice,
	runDoorNoticesCron
} from './doorNotices.js';
import { offlineList, sellAtDoor, ticketCard, ticketWithBuyer } from './door.js';
import { searchRows } from './checkin.js';
import { searchTickets } from './orders.js';

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

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-01T23:00:00Z');
const EVENT = 'fiesta-de-prueba';
const GENERAL = {
	id: 'general',
	name: 'General',
	price: 8000,
	fondo: 0,
	capacity: 50,
	gorra: null
};
const names = { general: 'General' };
const REASON = 'Motivo inventado que nunca tiene que salir del panel';
const MAIL = 'Persona.Avisada@Example.com';
const locals = /** @type {App.Locals} */ (
	/** @type {unknown} */ ({ user: { id: 1, login: 'admin-de-prueba' } })
);

/** Una entrada vendida en la puerta con ese mail (y, si se pasa, con la cuenta en la orden). */
async function ticketFor(email = MAIL, accountId = /** @type {string | null} */ (null)) {
	const r = await sellAtDoor(t.db, {
		eventSlug: EVENT,
		type: GENERAL,
		quantity: 1,
		holders: [{ name: 'Persona Inventada', pronouns: 'elle' }],
		buyer: { name: 'Persona Inventada', email, dni: '30123456' },
		method: 'efectivo',
		by: 'admin-de-prueba',
		now: NOW
	});
	if (!r.ok) throw new Error('no se vendió');
	if (accountId) {
		await t.db
			.prepare('UPDATE orders SET account_id = ?1 WHERE id = ?2')
			.bind(accountId, r.order.id)
			.run();
	}
	const full = await ticketWithBuyer(t.db, { id: r.tickets[0].id });
	if (!full) throw new Error('sin entrada');
	return full;
}

/** Todo lo que guarda la tabla, como texto. */
async function tableDump() {
	const { results } = await t.db.prepare('SELECT * FROM door_notices').all();
	return JSON.stringify(results);
}

describe('doorNoticeExpiry', () => {
	it('6 meses, 1 año o una fecha de mañana a 2 años; nada más', () => {
		expect(doorNoticeExpiry('6m', NOW)).toBe(NOW + 183 * DAY);
		expect(doorNoticeExpiry('1y', NOW)).toBe(NOW + 365 * DAY);
		// Fecha: vence al final de ese día en Argentina.
		expect(doorNoticeExpiry('2027-03-01', NOW)).toBe(Date.parse('2027-03-01T23:59:59.999-03:00'));
		expect(doorNoticeExpiry('2026-09-30', NOW)).toBeNull(); // ya pasó
		expect(doorNoticeExpiry('2029-01-01', NOW)).toBeNull(); // más de 2 años
		expect(doorNoticeExpiry('2027-02-30', NOW)).toBeNull();
		expect(doorNoticeExpiry('', NOW)).toBeNull();
		expect(doorNoticeExpiry('para siempre', NOW)).toBeNull();
		expect(doorNoticeExpiry(undefined, NOW)).toBeNull();
	});

	it('la fecha máxima del campo es la última que se acepta', () => {
		const max = doorNoticeMaxDate(NOW);
		const at = doorNoticeExpiry(max, NOW);
		expect(at).not.toBeNull();
		expect(/** @type {number} */ (at) <= NOW + DOOR_NOTICE_MAX_MS).toBe(true);
		const next = new Date(Date.parse(`${max}T12:00:00Z`) + DAY).toISOString().slice(0, 10);
		expect(doorNoticeExpiry(next, NOW)).toBeNull();
	});
});

describe('cargar, renovar y quitar', () => {
	it('por mail sin cuenta: guarda solo el hash (ni el mail ni parte de él)', async () => {
		const r = await addDoorNotice(t.db, locals, {
			email: MAIL,
			expiry: '6m',
			reason: REASON,
			now: NOW
		});
		expect(r).toMatchObject({ ok: true, byAccount: false });
		const row = await t.db.prepare('SELECT * FROM door_notices').first();
		expect(row?.account_id).toBeNull();
		expect(row?.email_hash).toBe(await noticeEmailHash(MAIL));
		expect(row?.created_by).toBe('admin-de-prueba');
		const dump = (await tableDump()).toLowerCase();
		expect(dump).not.toContain('persona.avisada');
		expect(dump).not.toContain('example.com');
		// El hash no es el de las cuentas ni el de «No fui yo» (no se cruza con otras tablas).
		const { emailHash } = await import('$lib/server/cuentas/accounts.js');
		expect(row?.email_hash).not.toBe(await emailHash(MAIL.toLowerCase()));
	});

	it('por el mail de una cuenta: queda en la cuenta', async () => {
		const account = await upsertVerifiedAccount(t.db, MAIL.toLowerCase(), { now: NOW });
		const r = await addDoorNotice(t.db, locals, { email: ` ${MAIL} `, expiry: '1y', now: NOW });
		expect(r).toMatchObject({ ok: true, byAccount: true });
		const row = await t.db.prepare('SELECT * FROM door_notices').first();
		expect(row?.account_id).toBe(account.id);
		expect(row?.email_hash).toBeNull();
	});

	it('valida el mail y el vencimiento; no duplica', async () => {
		expect(await addDoorNotice(t.db, locals, { email: 'Nombre Apellido', expiry: '6m' })).toEqual({
			ok: false,
			error: 'email'
		});
		expect(await addDoorNotice(t.db, locals, { email: MAIL, expiry: '' })).toEqual({
			ok: false,
			error: 'expiry'
		});
		expect(
			await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', now: NOW })
		).toMatchObject({ ok: true });
		expect(
			await addDoorNotice(t.db, locals, { email: MAIL.toUpperCase(), expiry: '1y', now: NOW })
		).toEqual({ ok: false, error: 'exists' });
	});

	it('registro de actividad: quién y cuándo, nunca el motivo ni el mail', async () => {
		const added = await addDoorNotice(t.db, locals, {
			email: MAIL,
			expiry: '6m',
			reason: REASON,
			now: NOW
		});
		if (!added.ok) throw new Error('no se cargó');
		expect(
			await renewDoorNotice(t.db, locals, { id: added.id, expiry: '1y', now: NOW + DAY })
		).toEqual({ ok: true, expiresAt: NOW + DAY + 365 * DAY });
		expect(await removeDoorNotice(t.db, locals, { id: added.id, now: NOW + 2 * DAY })).toBe(true);
		expect(await removeDoorNotice(t.db, locals, { id: added.id })).toBe(false);
		const audit = await listAudit(t.db, { targetType: 'door_notice' });
		expect(audit.map((a) => a.action).sort()).toEqual([
			'door_notice.add',
			'door_notice.remove',
			'door_notice.renew'
		]);
		for (const a of audit) expect(a.actorLogin).toBe('admin-de-prueba');
		const text = JSON.stringify(audit).toLowerCase();
		expect(text).not.toContain('motivo inventado');
		expect(text).not.toContain('example.com');
		expect(text).not.toContain(String(await noticeEmailHash(MAIL)));
	});

	it('el panel lista el motivo y busca por mail', async () => {
		await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', reason: REASON, now: NOW });
		const [n] = await listDoorNotices(t.db, { now: NOW });
		expect(n).toMatchObject({ byEmail: true, reason: REASON, createdBy: 'admin-de-prueba' });
		expect(await listDoorNotices(t.db, { now: NOW, email: MAIL.toLowerCase() })).toHaveLength(1);
		expect(await listDoorNotices(t.db, { now: NOW, email: 'otra@example.com' })).toHaveLength(0);
	});
});

describe('en la puerta', () => {
	it('evento de Kinky Vibe: coincide por mail (sin importar mayúsculas)', async () => {
		await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', reason: REASON, now: NOW });
		const flagged = await ticketFor('persona.avisada@example.com');
		const other = await ticketFor('otra.persona@example.com');
		const matches = await doorNoticeMatcher(t.db, { kinkyVibe: true, now: NOW });
		expect(await matches(flagged)).toBe(true);
		expect(await matches(other)).toBe(false);
	});

	it('un evento que no es de Kinky Vibe nunca avisa', async () => {
		await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', now: NOW });
		const flagged = await ticketFor();
		const matches = await doorNoticeMatcher(t.db, { kinkyVibe: false, now: NOW });
		expect(await matches(flagged)).toBe(false);
		expect(isKinkyVibeDoor({ fondoEnabled: false })).toBe(false);
		expect(isKinkyVibeDoor(null)).toBe(false);
		expect(isKinkyVibeDoor({ fondoEnabled: true })).toBe(true);
	});

	it('uno vencido nunca avisa, aunque el cron no lo haya borrado todavía', async () => {
		await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', now: NOW });
		const flagged = await ticketFor();
		const later = await doorNoticeMatcher(t.db, { kinkyVibe: true, now: NOW + 183 * DAY });
		expect(await later(flagged)).toBe(false);
	});

	it('aviso de cuenta: coincide con la cuenta de la orden y con su mail en compras sin sesión', async () => {
		const account = await upsertVerifiedAccount(t.db, 'cuenta.avisada@example.com', { now: NOW });
		await addDoorNotice(t.db, locals, {
			email: 'cuenta.avisada@example.com',
			expiry: '1y',
			now: NOW
		});
		const byAccount = await ticketFor('otro.mail@example.com', account.id);
		const byMail = await ticketFor('Cuenta.Avisada@example.com');
		const matches = await doorNoticeMatcher(t.db, { kinkyVibe: true, now: NOW });
		expect(await matches(byAccount)).toBe(true);
		expect(await matches(byMail)).toBe(true);
	});

	it('sin la tabla (migración sin aplicar) la puerta sigue andando, sin avisos', async () => {
		/** @type {any} */
		const broken = {
			prepare: () => {
				throw new Error('no such table: door_notices');
			}
		};
		const matches = await doorNoticeMatcher(broken, { kinkyVibe: true, now: NOW });
		expect(await matches({ buyer_email: MAIL })).toBe(false);
	});

	it('escaneo, lista sin conexión y búsqueda: solo `notice: true`, nunca el motivo', async () => {
		await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', reason: REASON, now: NOW });
		const flagged = await ticketFor();
		await ticketFor('otra.persona@example.com');
		const notices = await doorNoticeMatcher(t.db, { kinkyVibe: true, now: NOW });

		const card = ticketCard(flagged, {
			typeNames: names,
			prior: null,
			notice: await notices(flagged)
		});
		expect(card.notice).toBe(true);
		expect(ticketCard(flagged, { typeNames: names, prior: null }).notice).toBe(false);

		const list = await offlineList(t.db, { slug: EVENT, typeNames: names, prior: null, notices });
		expect(list.map((x) => x.notice)).toEqual([true, false]);
		// Sin matcher (o evento que no es de Kinky Vibe), ninguna.
		const plain = await offlineList(t.db, { slug: EVENT, typeNames: names, prior: null });
		expect(plain.map((x) => x.notice)).toEqual([false, false]);

		const raw = await searchTickets(t.db, EVENT, 'persona');
		const ids = new Set();
		for (const r of raw) if (await notices(r)) ids.add(r.id);
		const rows = searchRows(raw, names, ids);
		expect(rows.filter((r) => r.notice)).toHaveLength(1);

		const everything = JSON.stringify({ card, list, rows }).toLowerCase();
		expect(everything).not.toContain('motivo inventado');
		expect(everything).not.toContain('admin-de-prueba cargó');
		// La cuenta de la orden no viaja a la pantalla.
		expect(everything).not.toContain('buyer_account_id');
	});
});

describe('runDoorNoticesCron', () => {
	/** @returns {{ calls: any[], send: any }} */
	function fakeSend(result = /** @type {'sent' | 'simulated' | 'failed'} */ ('sent')) {
		/** @type {any[]} */
		const calls = [];
		return {
			calls,
			send: async (/** @type {any} */ input) => {
				calls.push(input);
				return result;
			}
		};
	}
	const to = async () => 'casilla@example.com';
	const ORIGIN = 'https://kinkyvibe.example';

	it('borra los vencidos (queda en el registro, sin datos) y no avisa por ellos', async () => {
		await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', reason: REASON, now: NOW });
		const { calls, send } = fakeSend();
		const r = await runDoorNoticesCron({
			db: t.db,
			origin: ORIGIN,
			to,
			send,
			now: NOW + 184 * DAY
		});
		expect(r).toEqual({ expired: 1, reminded: 0 });
		expect(calls).toHaveLength(0);
		expect(await tableDump()).toBe('[]');
		const [log] = await listAudit(t.db, { targetType: 'door_notice' }).then((a) =>
			a.filter((x) => x.action === 'door_notice.expire')
		);
		expect(log.actorLogin).toBe('automático');
		expect(JSON.stringify(log).toLowerCase()).not.toContain('motivo inventado');
	});

	it('avisa 14 días antes, una sola vez, sin el motivo ni el mail', async () => {
		await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', reason: REASON, now: NOW });
		const expires = NOW + 183 * DAY;
		const { calls, send } = fakeSend();
		// Todavía falta: no avisa.
		expect(
			await runDoorNoticesCron({ db: t.db, origin: ORIGIN, to, send, now: expires - 20 * DAY })
		).toEqual({ expired: 0, reminded: 0 });
		expect(calls).toHaveLength(0);
		// 14 días antes: un mail.
		expect(
			await runDoorNoticesCron({ db: t.db, origin: ORIGIN, to, send, now: expires - 14 * DAY })
		).toEqual({ expired: 0, reminded: 1 });
		// Las corridas siguientes no lo repiten.
		await runDoorNoticesCron({ db: t.db, origin: ORIGIN, to, send, now: expires - 13 * DAY });
		await runDoorNoticesCron({ db: t.db, origin: ORIGIN, to, send, now: expires - DAY });
		expect(calls).toHaveLength(1);
		expect(calls[0].to).toBe('casilla@example.com');
		const mail = JSON.stringify(calls[0].message).toLowerCase();
		expect(mail).not.toContain('motivo inventado');
		expect(mail).not.toContain('persona.avisada');
		expect(mail).toContain('/admin/comunidad/avisos-de-puerta');
	});

	it('si el mail falla, lo vuelve a intentar en la próxima corrida', async () => {
		await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', now: NOW });
		const at = NOW + 183 * DAY - 10 * DAY;
		const failing = fakeSend('failed');
		expect(
			await runDoorNoticesCron({ db: t.db, origin: ORIGIN, to, send: failing.send, now: at })
		).toEqual({ expired: 0, reminded: 0 });
		const ok = fakeSend();
		expect(
			await runDoorNoticesCron({ db: t.db, origin: ORIGIN, to, send: ok.send, now: at + 1000 })
		).toEqual({ expired: 0, reminded: 1 });
		expect(ok.calls).toHaveLength(1);
	});

	it('renovar vuelve a avisar antes del nuevo vencimiento', async () => {
		const added = await addDoorNotice(t.db, locals, { email: MAIL, expiry: '6m', now: NOW });
		if (!added.ok) throw new Error('no se cargó');
		const { calls, send } = fakeSend();
		const near = NOW + 175 * DAY;
		await runDoorNoticesCron({ db: t.db, origin: ORIGIN, to, send, now: near });
		expect(calls).toHaveLength(1);
		await renewDoorNotice(t.db, locals, { id: added.id, expiry: '6m', now: near });
		await runDoorNoticesCron({ db: t.db, origin: ORIGIN, to, send, now: near + 170 * DAY });
		expect(calls).toHaveLength(2);
	});

	it('el mail lleva solo las fechas y el link al panel', () => {
		const one = buildDoorNoticeReminderEmail({
			expiries: [NOW],
			origin: 'https://kinkyvibe.example'
		});
		expect(one.subject).toBe('Un aviso de puerta vence el 1 de octubre de 2026');
		expect(one.text).toContain('renovalo');
		expect(one.html).toContain('https://kinkyvibe.example/admin/comunidad/avisos-de-puerta');
		const two = buildDoorNoticeReminderEmail({
			expiries: [NOW + DAY, NOW],
			origin: 'https://kinkyvibe.example'
		});
		expect(two.subject).toBe('2 avisos de puerta vencen pronto');
		expect(two.text.indexOf('1 de octubre')).toBeLessThan(two.text.indexOf('2 de octubre'));
	});
});

describe('el texto de la puerta', () => {
	it('es genérico, sin motivo', () => {
		expect(DOOR_NOTICE_TEXT).toBe('Avisá a la organización antes de dejar pasar');
	});
});
