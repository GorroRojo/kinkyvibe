/**
 * Avisos de puerta (decisión 0051, docs/tickets.md «Avisos de puerta»): personas que la
 * organización no admite en los eventos que organiza Kinky Vibe. Tabla `door_notices` (migración
 * 0066).
 *
 * Reglas:
 *
 * - **Solo admins** cargan, renuevan y quitan avisos (las rutas llaman a `requireAdmin`), y cada
 *   acción queda en el registro de actividad **sin el motivo ni el mail** (solo el id del aviso y
 *   el vencimiento).
 * - Un aviso es de una **cuenta** o de un **mail**, nunca de un nombre. Si el mail es de una cuenta,
 *   el aviso queda en la cuenta (sigue aunque cambie el mail). Del mail se guarda solo un hash
 *   ({@link noticeEmailHash}): para avisar en la puerta alcanza con comparar.
 * - **Solo en los eventos de Kinky Vibe** (la etiqueta KinkyVibe, «Lo organiza KinkyVibe» en el
 *   editor: `isKinkyVibeEvent`, la misma regla que el Fondo). En los demás, nunca avisa.
 * - **Vence siempre** (6 meses, 1 año o una fecha de hasta 2 años). El cron de los recordatorios
 *   borra los vencidos y avisa por mail a la casilla de la organización 14 días antes, una sola vez
 *   ({@link runDoorNoticesCron}). Uno vencido nunca avisa, aunque el cron todavía no lo haya borrado.
 * - En la puerta se ve solo {@link DOOR_NOTICE_TEXT}: ni el motivo ni nada del aviso. **Nunca frena
 *   el ingreso**: decide quien está en la puerta. El motivo solo lo ve une admin en el panel.
 * - Si la tabla no existe (la migración todavía no se aplicó) o la base falla, la puerta sigue
 *   andando como siempre, sin avisos.
 */
import { logAdminAction } from '$lib/server/admin/audit.js';
import { normalizeEmail } from '$lib/server/cuentas/accounts.js';
import { MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';
import { sha256Hex } from '$lib/server/hash.js';
import { escapeHtml } from '$lib/utils/escape.js';
import { argDateLong } from '$lib/utils/dates.js';
import {
	DOOR_NOTICE_REASON_MAX,
	DOOR_NOTICE_REMIND_DAYS,
	DOOR_NOTICE_TEXT,
	doorNoticeExpiry
} from '$lib/utils/doorNotices.js';

export { DOOR_NOTICE_TEXT };

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** La página del panel con los avisos. */
export const DOOR_NOTICES_PATH = '/admin/comunidad/avisos-de-puerta';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Quién figura en el registro cuando el cron borra un aviso vencido. */
const CRON_ACTOR = Object.freeze({ user: Object.freeze({ login: 'automático' }) });

/**
 * Hash de un mail para los avisos: SHA-256 en hex de `puerta:aviso:<mail normalizado>`, o `null`
 * si no parece un mail. Con un prefijo propio: no se puede cruzar con los otros hashes de mail de
 * la base (códigos de las cuentas, «No fui yo», límites).
 *
 * @param {unknown} email
 */
export async function noticeEmailHash(email) {
	const normalized = normalizeEmail(email);
	return normalized ? sha256Hex(`puerta:aviso:${normalized}`) : null;
}

/**
 * Lo que mira el matcher de cada entrada: el mail de quien compró y la cuenta de la orden.
 *
 * @typedef {{ buyer_email?: string | null, buyer_account_id?: string | null }} NoticeTarget
 * @typedef {(t: NoticeTarget) => Promise<boolean>} DoorNoticeMatcher
 */

/** @type {DoorNoticeMatcher} */
const NEVER = async () => false;

/**
 * ¿La puerta es de un evento que organiza Kinky Vibe? Es la etiqueta KinkyVibe del evento («Lo
 * organiza KinkyVibe» en el editor), resuelta con el árbol de etiquetas por `isKinkyVibeEvent`
 * (ticketsEditor.js): `parseTicketConfig` la guarda como `fondoEnabled`, porque el Fondo usa la
 * misma regla. Sin configuración, no.
 *
 * @param {{ fondoEnabled?: boolean } | null | undefined} config
 */
export function isKinkyVibeDoor(config) {
	return config?.fondoEnabled === true;
}

/**
 * El matcher de los avisos vigentes para la puerta de un evento. Con un evento que no es de Kinky
 * Vibe, sin avisos vigentes o si la base falla, nunca avisa (y no hashea nada).
 *
 * @param {D1Database} db
 * @param {{ kinkyVibe: boolean, now?: number }} input
 * @returns {Promise<DoorNoticeMatcher>}
 */
export async function doorNoticeMatcher(db, { kinkyVibe, now = Date.now() }) {
	if (!kinkyVibe) return NEVER;
	/** @type {Record<string, unknown>[]} */
	let rows;
	try {
		({ results: rows } = await db
			.prepare(
				`SELECT n.account_id, n.email_hash, a.email AS account_email
				FROM door_notices n LEFT JOIN accounts a ON a.id = n.account_id
				WHERE n.expires_at > ?1`
			)
			.bind(now)
			.all());
	} catch (error) {
		// Sin la migración 0066 (o con la base caída) la puerta sigue como siempre. En el log, sin datos.
		console.error(
			'[puerta] no se pudieron leer los avisos de puerta:',
			String(error).slice(0, 200)
		);
		return NEVER;
	}
	if (!rows.length) return NEVER;
	/** @type {Set<string>} */
	const accounts = new Set();
	/** @type {Set<string>} */
	const hashes = new Set();
	for (const r of rows) {
		if (r.account_id) accounts.add(String(r.account_id));
		if (r.email_hash) hashes.add(String(r.email_hash));
		// Un aviso de cuenta también vale para las compras sin sesión con el mail de la cuenta.
		if (r.account_email) {
			const h = await noticeEmailHash(r.account_email);
			if (h) hashes.add(h);
		}
	}
	return async (t) => {
		if (t.buyer_account_id && accounts.has(String(t.buyer_account_id))) return true;
		if (!t.buyer_email || !hashes.size) return false;
		const h = await noticeEmailHash(t.buyer_email);
		return h !== null && hashes.has(h);
	};
}

/**
 * @typedef {{
 *   id: string,
 *   accountId: string | null,
 *   accountEmail: string | null,
 *   byEmail: boolean,
 *   reason: string,
 *   createdAt: number,
 *   createdBy: string,
 *   expiresAt: number,
 *   remindedAt: number | null,
 *   updatedAt: number
 * }} DoorNotice
 */

/** @param {Record<string, unknown>} r @returns {DoorNotice} */
function toNotice(r) {
	return {
		id: String(r.id),
		accountId: r.account_id ? String(r.account_id) : null,
		accountEmail: r.account_email ? String(r.account_email) : null,
		byEmail: !r.account_id,
		reason: r.reason ? String(r.reason) : '',
		createdAt: Number(r.created_at),
		createdBy: String(r.created_by),
		expiresAt: Number(r.expires_at),
		remindedAt: r.reminded_at == null ? null : Number(r.reminded_at),
		updatedAt: Number(r.updated_at)
	};
}

/**
 * Los avisos vigentes, del que vence antes al que vence después. **Solo para la página del panel**
 * (lleva el motivo). Con `email`, solo el aviso de ese mail o de la cuenta con ese mail.
 *
 * @param {D1Database} db
 * @param {{ now?: number, email?: string }} [opts]
 * @returns {Promise<DoorNotice[]>}
 */
export async function listDoorNotices(db, { now = Date.now(), email } = {}) {
	const base = `SELECT n.*, a.email AS account_email FROM door_notices n
		LEFT JOIN accounts a ON a.id = n.account_id WHERE n.expires_at > ?1`;
	if (email !== undefined) {
		const normalized = normalizeEmail(email);
		if (!normalized) return [];
		const hash = await noticeEmailHash(normalized);
		const { results } = await db
			.prepare(`${base} AND (n.email_hash = ?2 OR a.email = ?3) ORDER BY n.expires_at`)
			.bind(now, hash, normalized)
			.all();
		return results.map(toNotice);
	}
	const { results } = await db.prepare(`${base} ORDER BY n.expires_at`).bind(now).all();
	return results.map(toNotice);
}

/**
 * Valida el motivo (opcional): texto recortado, sin caracteres de control, hasta
 * {@link DOOR_NOTICE_REASON_MAX}. `null` si está vacío.
 *
 * @param {unknown} raw
 */
function cleanReason(raw) {
	const s = String(raw ?? '')
		// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
		.trim();
	return s ? s.slice(0, DOOR_NOTICE_REASON_MAX) : null;
}

/**
 * Carga un aviso. Si el mail es de una cuenta (no borrada), el aviso queda en la cuenta; si no,
 * se guarda solo el hash del mail. Queda en el registro de actividad sin el mail ni el motivo.
 *
 * @param {D1Database} db
 * @param {Pick<App.Locals, 'user'>} locals le admin (de acá sale `created_by`)
 * @param {{ email: unknown, expiry: unknown, reason?: unknown, now?: number }} input
 * @returns {Promise<{ ok: true, id: string, byAccount: boolean, expiresAt: number }
 *   | { ok: false, error: 'email' | 'expiry' | 'exists' }>}
 */
export async function addDoorNotice(db, locals, { email, expiry, reason, now = Date.now() }) {
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'email' };
	const expiresAt = doorNoticeExpiry(expiry, now);
	if (expiresAt === null) return { ok: false, error: 'expiry' };
	const hash = /** @type {string} */ (await noticeEmailHash(normalized));
	const account = await db
		.prepare('SELECT id FROM accounts WHERE email = ?1 AND deleted_at IS NULL')
		.bind(normalized)
		.first();
	const accountId = account ? String(account.id) : null;
	// Ya hay uno vigente para ese mail o esa cuenta: se renueva, no se duplica.
	if ((await listDoorNotices(db, { now, email: normalized })).length) {
		return { ok: false, error: 'exists' };
	}
	const id = crypto.randomUUID();
	const by = String(locals.user?.login ?? 'desconocide').slice(0, 100);
	// Uno vencido que el cron todavía no borró ocupa el lugar: se borra antes de cargar el nuevo.
	await db.batch([
		db
			.prepare(
				'DELETE FROM door_notices WHERE expires_at <= ?1 AND (account_id = ?2 OR email_hash = ?3)'
			)
			.bind(now, accountId, accountId ? null : hash),
		db
			.prepare(
				`INSERT INTO door_notices
					(id, account_id, email_hash, reason, created_at, created_by, expires_at, updated_at)
				VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?5)`
			)
			.bind(id, accountId, accountId ? null : hash, cleanReason(reason), now, by, expiresAt)
	]);
	await logAdminAction(
		db,
		locals,
		{
			action: 'door_notice.add',
			targetType: 'door_notice',
			targetId: id,
			summary: `Cargó un aviso de puerta (${accountId ? 'de una cuenta' : 'de un mail'}) que vence el ${argDateLong(expiresAt)}`,
			detail: { expiresAt }
		},
		{ now }
	);
	return { ok: true, id, byAccount: Boolean(accountId), expiresAt };
}

/**
 * Renueva un aviso vigente: vence de nuevo desde hoy (6 meses, 1 año o una fecha de hasta 2 años)
 * y vuelve a avisar 14 días antes. Queda en el registro.
 *
 * @param {D1Database} db
 * @param {Pick<App.Locals, 'user'>} locals
 * @param {{ id: unknown, expiry: unknown, now?: number }} input
 * @returns {Promise<{ ok: true, expiresAt: number } | { ok: false, error: 'expiry' | 'missing' }>}
 */
export async function renewDoorNotice(db, locals, { id, expiry, now = Date.now() }) {
	const expiresAt = doorNoticeExpiry(expiry, now);
	if (expiresAt === null) return { ok: false, error: 'expiry' };
	const res = await db
		.prepare(
			`UPDATE door_notices SET expires_at = ?2, reminded_at = NULL, updated_at = ?3
			WHERE id = ?1 AND expires_at > ?3`
		)
		.bind(String(id ?? ''), expiresAt, now)
		.run();
	if (!res.meta.changes) return { ok: false, error: 'missing' };
	await logAdminAction(
		db,
		locals,
		{
			action: 'door_notice.renew',
			targetType: 'door_notice',
			targetId: String(id),
			summary: `Renovó un aviso de puerta: ahora vence el ${argDateLong(expiresAt)}`,
			detail: { expiresAt }
		},
		{ now }
	);
	return { ok: true, expiresAt };
}

/**
 * Quita un aviso (se borra de la base). Queda en el registro, sin el motivo ni el mail.
 *
 * @param {D1Database} db
 * @param {Pick<App.Locals, 'user'>} locals
 * @param {{ id: unknown, now?: number }} input
 * @returns {Promise<boolean>} `false` si no existía
 */
export async function removeDoorNotice(db, locals, { id, now = Date.now() }) {
	const res = await db
		.prepare('DELETE FROM door_notices WHERE id = ?1')
		.bind(String(id ?? ''))
		.run();
	if (!res.meta.changes) return false;
	await logAdminAction(
		db,
		locals,
		{
			action: 'door_notice.remove',
			targetType: 'door_notice',
			targetId: String(id),
			summary: 'Quitó un aviso de puerta'
		},
		{ now }
	);
	return true;
}

/**
 * El mail a la casilla de la organización con los avisos que vencen pronto: solo las fechas y el
 * link al panel. Sin el motivo, sin el mail ni la cuenta de la persona.
 *
 * @param {{ expiries: number[], origin: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildDoorNoticeReminderEmail({ expiries, origin }) {
	const sorted = [...expiries].sort((a, b) => a - b);
	const several = sorted.length > 1;
	const subject = several
		? `${sorted.length} avisos de puerta vencen pronto`
		: `Un aviso de puerta vence el ${argDateLong(sorted[0])}`;
	const dates = sorted.map((at) => `Vence el ${argDateLong(at)}`);
	const what = several
		? 'Estos avisos de puerta del panel vencen en los próximos días:'
		: 'Un aviso de puerta del panel vence en los próximos días:';
	const help =
		'Si sigue haciendo falta, renovalo desde el panel. Si no, dejalo vencer: ese día se borra solo.';
	const url = `${origin}${DOOR_NOTICES_PATH}`;
	const why = 'Te llega porque es la casilla de la organización de Kinky Vibe.';
	const text = [what, '', ...dates, '', help, '', url, '', why].join('\n');
	const html = mailLayout({
		origin,
		label: 'Panel',
		titleHtml: escapeHtml(
			several ? 'Avisos de puerta por vencer' : 'Un aviso de puerta por vencer'
		),
		contentHtml: `<p style="${MAIL_STYLES.p}">${escapeHtml(what)}</p>
<p style="${MAIL_STYLES.box}">${dates.map(escapeHtml).join('<br>')}</p>`,
		button: { href: url, label: 'Ver los avisos de puerta' },
		helpHtml: escapeHtml(help),
		whyHtml: escapeHtml(why)
	});
	return { subject, html, text };
}

/**
 * La parte de los avisos del cron de los recordatorios (cada 15 minutos):
 *
 * 1. borra los vencidos (cada uno queda en el registro, como «automático»);
 * 2. toma los que vencen en {@link DOOR_NOTICE_REMIND_DAYS} días y todavía no avisó, y manda **un**
 *    mail a la casilla de la organización (`to`). Si el envío falla, los suelta para la próxima
 *    corrida; si salió (o no salió a propósito, como en un preview), no se vuelve a avisar.
 *
 * Nunca tira: si la tabla no existe o algo falla, lo escribe en el log (sin datos) y devuelve
 * `null`.
 *
 * @param {{
 *   db: D1Database,
 *   origin: string,
 *   to: () => Promise<string>,
 *   send: (input: { to: string, message: { subject: string, html: string, text: string },
 *     idempotencyKey: string }) => Promise<'sent' | 'simulated' | 'failed'>,
 *   now?: number
 * }} input
 * @returns {Promise<{ expired: number, reminded: number } | null>}
 */
export async function runDoorNoticesCron({ db, origin, to, send, now = Date.now() }) {
	try {
		const { results: gone } = await db
			.prepare('DELETE FROM door_notices WHERE expires_at <= ?1 RETURNING id')
			.bind(now)
			.all();
		for (const r of gone) {
			await logAdminAction(
				db,
				CRON_ACTOR,
				{
					action: 'door_notice.expire',
					targetType: 'door_notice',
					targetId: String(r.id),
					summary: 'Venció un aviso de puerta y se borró solo'
				},
				{ now }
			);
		}
		const { results: due } = await db
			.prepare(
				`UPDATE door_notices SET reminded_at = ?1
				WHERE reminded_at IS NULL AND expires_at > ?1 AND expires_at <= ?2
				RETURNING id, expires_at`
			)
			.bind(now, now + DOOR_NOTICE_REMIND_DAYS * DAY_MS)
			.all();
		let reminded = 0;
		if (due.length) {
			const ids = due.map((r) => String(r.id)).sort();
			const message = buildDoorNoticeReminderEmail({
				expiries: due.map((r) => Number(r.expires_at)),
				origin
			});
			let result = /** @type {'sent' | 'simulated' | 'failed'} */ ('failed');
			try {
				result = await send({
					to: await to(),
					message,
					idempotencyKey: `door-notices-reminder:${await sha256Hex(ids.join(','))}`
				});
			} catch (error) {
				console.error('[avisos de puerta] no salió el recordatorio:', String(error).slice(0, 200));
			}
			if (result === 'failed') {
				// Se sueltan para la próxima corrida.
				await db.batch(
					ids.map((id) =>
						db
							.prepare(
								'UPDATE door_notices SET reminded_at = NULL WHERE id = ?1 AND reminded_at = ?2'
							)
							.bind(id, now)
					)
				);
			} else {
				reminded = ids.length;
			}
		}
		return { expired: gone.length, reminded };
	} catch (error) {
		console.error('[avisos de puerta] el cron falló:', String(error).slice(0, 200));
		return null;
	}
}
