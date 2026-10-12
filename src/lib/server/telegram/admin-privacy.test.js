/**
 * «📊 Estado» y «🔔 Mis avisos» con la base (D1 de miniflare; datos inventados, decisión 0041):
 *
 * - en ninguna pantalla aparece un dato de quien compra (nombre, mail, DNI, titulares, códigos,
 *   tokens, detalle de la revisión, id del pago), aunque estén todos en la base: solo cantidades;
 * - las cantidades son las de la base (vendidas por tipo y tramo, reservas sin pagar y por vencer,
 *   transferencias por confirmar, órdenes para revisar y la lista de espera si la tabla existe);
 * - une vinculade que ya no está en `ADMINS` no ve nada;
 * - «Mis avisos»: todos apagados al empezar, prender y apagar queda en la base, y a quién se le
 *   mandaría cada aviso (solo admins vinculades que lo prendieron).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import {
	adminBotEnabled,
	adminNotices,
	botAdmin,
	noticeRecipients,
	setAdminNotice
} from './adminData.js';
import { shortHash } from './nav.js';
import { planUpdate } from './router.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ORIGIN = 'https://ejemplo.test';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');
const SLUG = 'fiesta-inventada';
const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };
/** Une vinculade que no está (o ya no está) en ADMINS. */
const EX_ADMIN = { id: Math.max(...ADMINS.map((a) => a.id)) + 12_345, login: 'ex-admin-inventade' };
const ADMIN_TG = 5001;
const EX_TG = 6002;

/** Lo que nunca puede aparecer en el bot. */
const SECRETS = [
	'Persona Secreta',
	'secreta-uno@example.com',
	'secreta-dos@example.com',
	'secreta-tres@example.com',
	'30111222',
	'Titular Secreto',
	'detalle-secreto',
	'pago-secreto',
	'hash-secreto',
	'he/him-secreto',
	'tokensecreto',
	'QRS234',
	'espera-secreta@example.com'
];

const CONFIG = {
	title: 'Fiesta inventada',
	start: '2031-01-10T23:00:00-03:00',
	types: [
		{
			id: 'general',
			name: 'General',
			price: 1000,
			fondo: 0,
			capacity: 10,
			gorra: null,
			tiers: [
				{ id: 'p1', name: 'Preventa 1', price: 800, fondo: 0, quantity: 2, until: null },
				{ id: 'final', name: 'Final', price: 1000, fondo: 0, quantity: null, until: null }
			]
		},
		{ id: 'gorra', name: 'A la gorra', price: 0, fondo: 0, capacity: null, gorra: null }
	]
};

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

let seq = 0;
/**
 * Una orden con todos los datos personales inventados (que nunca tienen que salir).
 *
 * @param {{ type?: string, tier?: string | null, quantity?: number, status: string,
 *   expiresAt?: number, method?: string, review?: string | null, email: string }} o
 */
async function order({
	type = 'general',
	tier = null,
	quantity = 1,
	status,
	expiresAt = NOW - 1,
	method = 'mercadopago',
	review = null,
	email
}) {
	const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, ticket_tier, quantity, unit_price, subtotal,
				total, buyer_name, buyer_pronouns, buyer_email, buyer_dni, holders, status,
				payment_method, mp_payment_id, needs_review, review_detail, client_hash, created_at,
				updated_at, expires_at)
			VALUES (?1, ?2, ?3, ?4, ?5, 1000, ?6, ?6, 'Persona Secreta', 'he/him-secreto', ?7,
				'30111222', '[{"name":"Titular Secreto","pronouns":""}]', ?8, ?9, 'pago-secreto', ?10,
				?11, 'hash-secreto', ?12, ?12, ?13)`
		)
		.bind(
			id,
			SLUG,
			type,
			tier,
			quantity,
			1000 * quantity,
			email,
			status,
			method,
			review,
			review ? 'detalle-secreto' : null,
			NOW - 1000 * seq,
			expiresAt
		)
		.run();
	if (status === 'approved') {
		await t.db
			.prepare(
				`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, token, code)
				VALUES (?1, ?2, ?3, ?4, 'Titular Secreto', ?5, ?6)`
			)
			.bind(`ticket-${seq}`, id, SLUG, type, `tokensecreto${seq}`.padEnd(43, 'x'), `QRS23${seq}`)
			.run();
	}
	return id;
}

/** @param {number} telegramUserId @param {{ id: number, login: string }} who */
async function link(telegramUserId, who) {
	await t.db
		.prepare(
			'INSERT INTO telegram_admin_links (telegram_user_id, github_id, github_login, linked_at) VALUES (?1, ?2, ?3, ?4)'
		)
		.bind(String(telegramUserId), who.id, who.login, NOW)
		.run();
}

beforeEach(async () => {
	await resetDB(t.db);
	clearFlagCache();
	seq = 0;
	await link(ADMIN_TG, ADMIN);
	await link(EX_TG, EX_ADMIN);
	// Vendidas: 2 en Preventa 1 (que así se agota) y 1 en Final; 1 a la gorra.
	await order({ tier: 'p1', quantity: 2, status: 'approved', email: 'secreta-uno@example.com' });
	await order({
		tier: 'final',
		status: 'approved',
		review: 'late_payment',
		email: 'secreta-dos@example.com'
	});
	await order({ type: 'gorra', status: 'approved', email: 'secreta-tres@example.com' });
	// Reservas: una de Mercado Pago que vence en 10 minutos y una transferencia de 2 en 2 días.
	await order({
		tier: 'final',
		status: 'pending',
		expiresAt: NOW + 10 * 60_000,
		email: 'secreta-uno@example.com'
	});
	await order({
		tier: 'final',
		quantity: 2,
		status: 'awaiting_transfer',
		method: 'transferencia',
		expiresAt: NOW + 2 * 86_400_000,
		email: 'secreta-dos@example.com'
	});
	// Lo que ya no cuenta: vencida, cancelada.
	await order({ tier: 'final', status: 'expired', email: 'secreta-tres@example.com' });
	await order({ tier: 'final', status: 'cancelled', email: 'secreta-tres@example.com' });
});

const admin = () =>
	botAdmin(t.db, {
		list: async () => [{ slug: SLUG, config: /** @type {any} */ (CONFIG) }],
		config: async (slug) => (slug === SLUG ? /** @type {any} */ (CONFIG) : null)
	});

/** @param {object} [over] */
const deps = (over = {}) => ({
	listUpcoming: async () => [],
	origin: ORIGIN,
	now: () => NOW,
	botUsername: 'BotDePrueba',
	admin: admin(),
	...over
});

/** @param {string} text @param {number} [from] */
const msg = (text, from = ADMIN_TG) => ({
	update_id: 1,
	message: { chat: { id: from, type: 'private' }, from: { id: from }, text }
});

/** @param {string} data @param {number} [from] */
const tap = (data, from = ADMIN_TG) => ({
	update_id: 1,
	callback_query: {
		id: 'cb',
		from: { id: from },
		data,
		message: { message_id: 9, chat: { id: from, type: 'private' } }
	}
});

/** Todo lo que el bot mandaría, como texto. @param {unknown[]} plans */
const asText = (plans) => JSON.stringify(plans);

describe('el estado con la base: solo cantidades', () => {
	it('ningún dato de quien compra en ninguna pantalla', async () => {
		const d = deps();
		const plans = [
			await planUpdate(msg('/start'), d),
			await planUpdate(msg('/estado'), d),
			await planUpdate(tap('ax:0'), d),
			await planUpdate(tap(`ae:${shortHash(SLUG)}`), d),
			await planUpdate(msg('/avisos'), d),
			await planUpdate(tap('an:v'), d)
		];
		const all = asText(plans);
		expect(all).toContain('Fiesta inventada');
		for (const secret of SECRETS) expect(all, secret).not.toContain(secret);
		expect(all).not.toMatch(/@example\.com/);
	});

	it('las cantidades salen de la base', async () => {
		const r = /** @type {any} */ (await planUpdate(tap(`ae:${shortHash(SLUG)}`), deps()));
		const text = r.steps[0].text;
		expect(text).toContain('🎟 <b>General</b>: 3 de 10 vendidas');
		expect(text).toContain('↳ Preventa 1: 2 de 2');
		expect(text).toContain('↳ Final: 1 ← a la venta');
		expect(text).toContain('🎟 <b>A la gorra</b>: 1 vendidas (sin cupo)');
		expect(text).toContain('<b>Total</b>: 4 vendidas');
		expect(text).toContain('⏳ Reservas sin pagar: 3 · vencen en la próxima hora: 1');
		expect(text).toContain('💸 Transferencias por confirmar: 1');
		expect(text).toContain('⚠️ Órdenes para revisar: 1');
		// Sin la tabla de la lista de espera (PR #310 todavía no está), sin esa línea.
		expect(text).not.toContain('lista de espera');
	});

	it('con la lista de espera (si la tabla existe): cuántas personas, nunca sus mails', async () => {
		await t.db
			.prepare(
				'CREATE TABLE IF NOT EXISTS waitlist_entries (id TEXT PRIMARY KEY, event_slug TEXT, email TEXT, status TEXT)'
			)
			.run();
		try {
			for (const [i, status] of ['waiting', 'waiting', 'offered', 'cancelled'].entries()) {
				await t.db
					.prepare('INSERT INTO waitlist_entries VALUES (?1, ?2, ?3, ?4)')
					.bind(`w${i}`, SLUG, 'espera-secreta@example.com', status)
					.run();
			}
			const r = /** @type {any} */ (await planUpdate(tap(`ae:${shortHash(SLUG)}`), deps()));
			expect(r.steps[0].text).toContain('📝 En la lista de espera: 3');
			expect(asText([r])).not.toContain('espera-secreta');
		} finally {
			await t.db.prepare('DROP TABLE IF EXISTS waitlist_entries').run();
		}
	});

	it('vinculade pero fuera de ADMINS: nada (lo mismo que un comando o botón que no existe)', async () => {
		const d = deps();
		expect(await planUpdate(msg('/estado', EX_TG), d)).toEqual(
			await planUpdate(msg('/inventado', EX_TG), d)
		);
		expect(await planUpdate(tap(`ae:${shortHash(SLUG)}`, EX_TG), d)).toEqual(
			await planUpdate(tap('zzz', EX_TG), d)
		);
		const home = asText([await planUpdate(msg('/start', EX_TG), d)]);
		expect(home).not.toContain('ax:0');
		// Sin vincular, tampoco.
		expect(await planUpdate(tap('an:d', 7777), d)).toEqual(await planUpdate(tap('zzz', 7777), d));
		expect(await adminNotices(t.db, EX_ADMIN.id)).toEqual(new Set());
	});

	it('al desvincular (o sacar el vínculo), el próximo botón ya no anda', async () => {
		const d = deps();
		const ok = /** @type {any} */ (await planUpdate(tap('ax:0'), d));
		expect(ok.steps[0].text).toContain('Estado de la venta');
		await t.db
			.prepare('DELETE FROM telegram_admin_links WHERE github_id = ?1')
			.bind(ADMIN.id)
			.run();
		expect(await planUpdate(tap('ax:0'), d)).toEqual(await planUpdate(tap('zzz'), d));
	});
});

describe('Mis avisos con la base', () => {
	it('todos apagados al empezar; prender y apagar queda guardado', async () => {
		const d = deps();
		const first = /** @type {any} */ (await planUpdate(msg('/avisos'), d));
		expect(
			first.steps[0].reply_markup.inline_keyboard
				.slice(0, 5)
				.every((/** @type {any} */ row) => row[0].text.startsWith('⬜'))
		).toBe(true);
		await planUpdate(tap('an:d'), d);
		await planUpdate(tap('an:v'), d);
		expect(await adminNotices(t.db, ADMIN.id)).toEqual(new Set(['resumen_diario', 'cada_venta']));
		const off = /** @type {any} */ (await planUpdate(tap('an:d'), d));
		expect(off.callback.text).toBe('Apagado: Resumen diario');
		expect(await adminNotices(t.db, ADMIN.id)).toEqual(new Set(['cada_venta']));
		// Por id de GitHub: volver a vincular (otro Telegram) no borra lo elegido.
		await t.db
			.prepare('DELETE FROM telegram_admin_links WHERE github_id = ?1')
			.bind(ADMIN.id)
			.run();
		await link(8008, ADMIN);
		const again = /** @type {any} */ (await planUpdate(msg('/avisos', 8008), d));
		expect(again.steps[0].reply_markup.inline_keyboard[1][0].text).toBe('✅ Cada venta');
	});

	it('idempotente, y un tipo que no existe no se guarda', async () => {
		await setAdminNotice(t.db, ADMIN.id, 'cada_venta', true, { now: NOW });
		await setAdminNotice(t.db, ADMIN.id, 'cada_venta', true, { now: NOW });
		await setAdminNotice(t.db, ADMIN.id, 'transferencia', false, { now: NOW });
		expect(await adminNotices(t.db, ADMIN.id)).toEqual(new Set(['cada_venta']));
		await expect(
			setAdminNotice(t.db, ADMIN.id, /** @type {any} */ ('inventado'), true)
		).rejects.toThrow();
		// Una fila vieja con un tipo que el código ya no conoce no se muestra.
		await t.db
			.prepare(
				'INSERT INTO telegram_admin_notices (github_id, kind, created_at) VALUES (?1, ?2, ?3)'
			)
			.bind(ADMIN.id, 'viejo', NOW)
			.run();
		expect(await adminNotices(t.db, ADMIN.id)).toEqual(new Set(['cada_venta']));
	});

	it('a quién se le mandaría: solo admins vinculades que lo prendieron', async () => {
		await setAdminNotice(t.db, ADMIN.id, 'resumen_diario', true);
		// Une ex admin con el aviso prendido y vinculade: no.
		await setAdminNotice(t.db, EX_ADMIN.id, 'resumen_diario', true);
		// Une admin con el aviso prendido pero sin Telegram vinculado: no.
		if (ADMINS[1]) await setAdminNotice(t.db, ADMINS[1].id, 'resumen_diario', true);
		expect(await noticeRecipients(t.db, 'resumen_diario')).toEqual([
			{ telegramUserId: String(ADMIN_TG), githubId: ADMIN.id, login: ADMIN.login }
		]);
		expect(await noticeRecipients(t.db, 'cada_venta')).toEqual([]);
		expect(await noticeRecipients(t.db, /** @type {any} */ ('inventado'))).toEqual([]);
	});
});

describe('el interruptor', () => {
	it('apagado por defecto; pide el bot y «Telegram para admins»', async () => {
		expect(await adminBotEnabled(t.db)).toBe(false);
		expect(await adminBotEnabled(null)).toBe(false);
		await setFlag(t.db, 'telegram_admin', true, { by: 'prueba' });
		clearFlagCache();
		expect(await adminBotEnabled(t.db)).toBe(false);
		await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
		clearFlagCache();
		expect(await adminBotEnabled(t.db)).toBe(true);
	});
});
