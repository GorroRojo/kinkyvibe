/**
 * «Lo que sigo» en números (Mensajes › Lo que sigo del panel) con D1 de miniflare: los totales,
 * los avisos que salieron por tipo, canal y período, el paso de «Avisame si se repite», Telegram
 * y «Lo más seguido». Y la privacidad: nada de lo que devuelve dice quién sigue qué. Datos
 * inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeAccount, makeProfile } from '$lib/server/amigues/testing.js';
import tagsFactory from '$lib/utils/tags';
import { followStats, groupRanking } from './stats.js';

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

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-01T12:00:00-03:00');
const tags = tagsFactory();

/**
 * Una fila de `follows` con las opciones que se pasen (todo lo demás apagado).
 *
 * @param {string} accountId
 * @param {'etiqueta' | 'perfil'} kind
 * @param {string} key
 * @param {{ cal?: 0 | 1, mailNew?: 0 | 1, mailRem?: 0 | 1, tgNew?: 0 | 1, tgRem?: 0 | 1,
 *   sub?: string | null }} [o]
 */
async function addFollow(accountId, kind, key, o = {}) {
	await t.db
		.prepare(
			`INSERT INTO follows (account_id, target_kind, target_key, in_calendar, mail_new,
				mail_reminder, tg_new, tg_reminder, series_subscription_id, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`
		)
		.bind(
			accountId,
			kind,
			key,
			o.cal ?? 0,
			o.mailNew ?? 0,
			o.mailRem ?? 0,
			o.tgNew ?? 0,
			o.tgRem ?? 0,
			o.sub ?? null,
			NOW - 60 * DAY
		)
		.run();
}

/**
 * @param {string} accountId
 * @param {string} slug
 * @param {'nuevo' | 'recordatorio'} kind
 * @param {'mail' | 'telegram'} channel
 * @param {number} sentAt
 */
async function addNotice(accountId, slug, kind, channel, sentAt) {
	await t.db
		.prepare(
			`INSERT INTO follow_notifications (account_id, event_slug, kind, channel, sent_at)
			VALUES (?1, ?2, ?3, ?4, ?5)`
		)
		.bind(accountId, slug, kind, channel, sentAt)
		.run();
}

/**
 * Una suscripción de «Avisame si se repite» (confirmada si no se dice otra cosa).
 *
 * @param {{ accountId?: string, email?: string, tag: string, confirmed?: boolean }} s
 */
async function addSubscription({ accountId, email, tag, confirmed = true }) {
	await t.db
		.prepare(
			`INSERT INTO series_subscriptions (id, series_tag, account_id, email, subscriber_key,
				confirm_hash, created_at, confirmed_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
		)
		.bind(
			crypto.randomUUID(),
			tag,
			accountId ?? null,
			email ?? null,
			accountId ? `a:${accountId}` : `e:${email}`,
			confirmed ? null : crypto.randomUUID().replaceAll('-', '').repeat(2),
			NOW - 90 * DAY,
			confirmed ? NOW - 90 * DAY : null
		)
		.run();
}

/**
 * Un mundo inventado: tres cuentas, una borrada, perfiles (uno oculto, uno borrado), un lugar,
 * avisos en distintos períodos, «Avisame» y Telegram.
 */
async function seed() {
	const a = await makeAccount(t.db, 'sigue-mucho');
	const b = await makeAccount(t.db, 'sigue-poco');
	const c = await makeAccount(t.db, 'sigue-un-lugar');
	const gone = await makeAccount(t.db, 'cuenta-borrada');
	await t.db
		.prepare(
			`UPDATE accounts SET deleted_at = ?2, email = NULL, email_verified_at = NULL,
				password_hash = NULL, preferences = '{}' WHERE id = ?1`
		)
		.bind(gone.id, NOW)
		.run();
	const persona = await makeProfile(t.db, { title: 'Persona Inventada' });
	const oculto = await makeProfile(t.db, { title: 'Perfil Oculto', visibility: 'hidden' });
	const borrado = await makeProfile(t.db, { title: 'Perfil Borrado', kind: 'proyecto' });
	await t.db
		.prepare('UPDATE objects SET deleted_at = ?2, version = version + 1 WHERE id = ?1')
		.bind(borrado.id, NOW)
		.run();
	const lugar = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });

	await addFollow(a.id, 'etiqueta', 'shibari', { cal: 1, mailNew: 1, tgNew: 1 });
	await addFollow(b.id, 'etiqueta', 'shibari', { cal: 1, mailRem: 1 });
	await addFollow(a.id, 'etiqueta', 'Rancheadita Kinky', {
		cal: 1,
		mailNew: 1,
		sub: crypto.randomUUID()
	});
	await addFollow(a.id, 'etiqueta', 'etiqueta-que-ya-no-existe');
	await addFollow(a.id, 'perfil', String(persona.id), { tgRem: 1 });
	await addFollow(b.id, 'perfil', String(oculto.id));
	await addFollow(b.id, 'perfil', String(borrado.id));
	await addFollow(c.id, 'perfil', String(lugar.id), { cal: 1 });
	await addFollow(c.id, 'perfil', '999999');
	// La cuenta borrada no cuenta (aunque le hayan quedado filas).
	await addFollow(gone.id, 'etiqueta', 'shibari', { cal: 1, mailNew: 1 });

	await addNotice(a.id, 'evento-1', 'nuevo', 'mail', NOW - 2 * DAY);
	await addNotice(b.id, 'evento-1', 'nuevo', 'mail', NOW - 10 * DAY);
	await addNotice(a.id, 'evento-2', 'nuevo', 'mail', NOW - 40 * DAY);
	await addNotice(a.id, 'evento-1', 'nuevo', 'telegram', NOW - 1 * DAY);
	await addNotice(b.id, 'evento-3', 'recordatorio', 'mail', NOW - 20 * DAY);

	await addSubscription({ accountId: b.id, tag: 'Rancheadita Kinky' });
	await addSubscription({ accountId: c.id, tag: 'Rancheadita Kinky', confirmed: false });
	await addSubscription({ accountId: gone.id, tag: 'Rancheadita Kinky' });
	await addSubscription({ email: 'sin-cuenta-1@example.com', tag: 'Rancheadita Kinky' });
	await addSubscription({ email: 'sin-cuenta-2@example.com', tag: 'Rancheadita Kinky' });
	await addSubscription({
		email: 'sin-confirmar@example.com',
		tag: 'Rancheadita Kinky',
		confirmed: false
	});

	await t.db
		.prepare(
			`INSERT INTO telegram_chats (account_id, chat_id, linked_at, muted, updated_at)
			VALUES (?1, '700000001', ?3, 0, ?3), (?2, '700000002', ?3, 1, ?3)`
		)
		.bind(a.id, b.id, NOW)
		.run();

	return { a, b, c, gone, persona, oculto, borrado, lugar };
}

describe('followStats', () => {
	it('sin base: todo en null (la página dice que no se pudo contar)', async () => {
		const s = await followStats(null, { tags, now: NOW });
		expect(s.accounts).toBeNull();
		expect(s.ranking).toBeNull();
		expect(s.notices).toBeNull();
	});

	it('sin nada seguido: ceros y listas vacías', async () => {
		const s = await followStats(t.db, { tags, now: NOW });
		expect(s.accounts).toBe(0);
		expect(s.follows).toEqual({ total: 0, etiqueta: 0, perfil: 0, lugar: 0 });
		expect(s.notices?.last).toBeNull();
		expect(s.notices?.nuevo.mail).toEqual({ d7: 0, d30: 0, total: 0 });
		expect(s.avisame).toEqual({ migrated: 0, pendingWithAccount: 0, withoutAccount: 0 });
		expect(s.telegram).toEqual({ linked: 0, muted: 0 });
		expect(s.ranking).toEqual({ etiqueta: [], perfil: [], lugar: [] });
	});

	it('cuenta cuentas, cosas seguidas por tipo y opciones prendidas (sin cuentas borradas)', async () => {
		await seed();
		const s = await followStats(t.db, { tags, now: NOW });
		expect(s.accounts).toBe(3);
		expect(s.follows).toEqual({ total: 9, etiqueta: 4, perfil: 4, lugar: 1 });
		expect(s.options).toEqual({
			inCalendar: 4,
			mailNew: 2,
			mailReminder: 1,
			tgNew: 1,
			tgReminder: 1
		});
	});

	it('avisos que salieron: 7 y 30 días y desde el principio, por tipo y canal, y el último', async () => {
		await seed();
		const s = await followStats(t.db, { tags, now: NOW });
		expect(s.notices).toEqual({
			nuevo: { mail: { d7: 1, d30: 2, total: 3 }, telegram: { d7: 1, d30: 1, total: 1 } },
			recordatorio: { mail: { d7: 0, d30: 1, total: 1 }, telegram: { d7: 0, d30: 0, total: 0 } },
			last: NOW - 1 * DAY
		});
	});

	it('«Avisame si se repite»: pasadas, con cuenta por pasar (confirmadas) y sin cuenta', async () => {
		await seed();
		const s = await followStats(t.db, { tags, now: NOW });
		expect(s.avisame).toEqual({ migrated: 1, pendingWithAccount: 1, withoutAccount: 2 });
	});

	it('Telegram: chats conectados y en silencio', async () => {
		await seed();
		expect((await followStats(t.db, { tags, now: NOW })).telegram).toEqual({ linked: 2, muted: 1 });
	});

	it('lo más seguido: con el número aunque sea 1, en tres grupos, con su estado y link al panel', async () => {
		const w = await seed();
		const { ranking } = await followStats(t.db, { tags, now: NOW });
		expect(ranking?.etiqueta.map((r) => [r.key, r.count, r.state, r.series])).toEqual([
			['shibari', 2, null, false],
			// a igual número, por nombre
			['etiqueta-que-ya-no-existe', 1, 'no-existe', false],
			['Rancheadita Kinky', 1, null, true]
		]);
		expect(ranking?.etiqueta[0].href).toBe('/admin/etiquetas?etiqueta=shibari');
		expect(ranking?.perfil.map((r) => [r.title, r.count, r.state, r.profileKind])).toEqual([
			['Perfil 999999', 1, 'no-existe', null],
			['Perfil Borrado', 1, 'borrado', 'proyecto'],
			['Perfil Oculto', 1, 'oculto', 'persona'],
			['Persona Inventada', 1, null, 'persona']
		]);
		expect(ranking?.perfil.find((r) => r.state === 'no-existe')?.href).toBeNull();
		expect(ranking?.lugar).toEqual([
			{
				group: 'lugar',
				key: String(w.lugar.id),
				title: 'Lugar Inventado',
				href: `/admin/comunidad/cuentas/perfiles/${w.lugar.id}`,
				series: false,
				profileKind: 'lugar',
				state: null,
				count: 1
			}
		]);
	});

	it('privacidad: no devuelve ningún id de cuenta, mail ni chat, ni campos de más', async () => {
		const w = await seed();
		const s = await followStats(t.db, { tags, now: NOW });
		const json = JSON.stringify(s);
		for (const account of [w.a, w.b, w.c, w.gone]) {
			expect(json).not.toContain(account.id);
			expect(json).not.toContain(account.email);
			expect(json).not.toContain(account.email.split('@')[0]);
		}
		for (const secret of ['700000001', '700000002', 'sin-cuenta-1', 'sin-cuenta-2', 'example.com'])
			expect(json).not.toContain(secret);
		// Ninguna clave con quién (`accounts` de arriba es un número: cuántas cuentas).
		expect(json).not.toMatch(/"(account_?id|e_?mail|chat_?id|login|name)"/i);
		expect(typeof s.accounts).toBe('number');
		// Solo lo que la página muestra, fila por fila.
		const allowed = ['count', 'group', 'href', 'key', 'profileKind', 'series', 'state', 'title'];
		const ranking = /** @type {NonNullable<typeof s.ranking>} */ (s.ranking);
		for (const row of [...ranking.etiqueta, ...ranking.perfil, ...ranking.lugar])
			expect(Object.keys(row).sort()).toEqual(allowed);
		expect(Object.keys(s).sort()).toEqual(
			['accounts', 'avisame', 'follows', 'notices', 'options', 'ranking', 'telegram'].sort()
		);
	});

	it('una tabla que falta (migración sin aplicar) deja ese dato en null y lo demás sigue', async () => {
		await seed();
		await t.db.prepare('DROP TABLE telegram_chats').run();
		try {
			const s = await followStats(t.db, { tags, now: NOW });
			expect(s.telegram).toBeNull();
			expect(s.accounts).toBe(3);
		} finally {
			// El resto de las pruebas usa la base entera: se arma de nuevo.
			await t?.dispose();
			t = await createTestDB();
		}
	});
});

describe('groupRanking', () => {
	it('saltea filas sin clave o sin cuentas', () => {
		const r = groupRanking(
			[
				{ target_kind: 'etiqueta', target_key: '', n: 3 },
				{ target_kind: 'etiqueta', target_key: 'shibari', n: 0 },
				{ target_kind: 'otra-cosa', target_key: 'x', n: 2 }
			],
			tags
		);
		expect(r).toEqual({ etiqueta: [], perfil: [], lugar: [] });
	});
});
