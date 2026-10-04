/**
 * Ficha de una persona en el panel (Comunidad › Personas › <persona> y Comunidad › Cuentas ›
 * <cuenta>, que muestran la misma ficha): todo lo que sabemos de alguien, encontrado por su mail
 * normalizado (sin espacios, en minúsculas) y, si tiene cuenta, por el id de la cuenta. Sirve
 * también para una cuenta sin compras, para quien compró sin cuenta y para una cuenta borrada
 * (que ya no tiene mail: solo se encuentra por el id).
 *
 * Solo admins (las rutas llaman a `requireAdmin`). Reglas:
 * - nunca se leen el hash de la contraseña, tokens (sesiones, calendario, entradas), el id del
 *   chat de Telegram ni el DNI: el DNI solo sale con {@link revealDni}, valor por valor, y cada
 *   vez queda en el registro de actividad (sin el DNI);
 * - propinas y códigos de ingreso no se pueden atar a una persona (no guardan mail ni cuenta):
 *   no se muestran;
 * - todo sale en una sola tanda de consultas (`runQueries`), sin una consulta por orden.
 */
import { runQueries, rowsOf } from '$lib/server/db/batch.js';
import { emailHash } from '$lib/server/cuentas/accounts.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { getEventInfo, listEventMetas } from '$lib/server/tickets/events.js';
import { parsePersonas, PERSONAS_KEY } from '$lib/utils/personas.js';
import { cleanSavedBuyer } from '$lib/utils/savedBuyer.js';
import { groupPeople, normalizeEmail, personId } from './people.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/db/batch.js').BatchQuery<any>} AnyQuery */

/**
 * A quién mira la ficha: el mail normalizado (vacío si no hay, por ejemplo una cuenta borrada) y,
 * si se entró por Cuentas, el id de la cuenta (vacío si no).
 * @typedef {{ email: string, accountId: string }} FichaKey
 */

/** Cuántas filas como mucho de las listas largas (registro, avisos). */
export const FICHA_LIST_LIMIT = 200;

/** La cuenta de la persona (por mail o por id). Usa ?1 (mail) y ?2 (id de la cuenta). */
const ACC = `(SELECT id FROM accounts WHERE (?1 != '' AND email = ?1) OR id = ?2)`;

/** Órdenes de la persona (alias `o`): con su cuenta o con su mail, sin mayúsculas ni espacios. */
const ORDER_MATCH = `(o.account_id IN ${ACC} OR (?1 != '' AND lower(trim(o.buyer_email)) = ?1))`;

/** Ids de sus órdenes. */
const ORDER_IDS = `(SELECT o.id FROM orders o WHERE ${ORDER_MATCH})`;

/** @param {unknown} v */
const num = (v) => (v == null ? null : Number(v));
/** @param {unknown} v */
const str = (v) => (v == null ? '' : String(v));

/**
 * Una consulta de la tanda con una sola sentencia.
 * @template T
 * @param {string} what
 * @param {T} fallback
 * @param {string | null} sql `null`: no hay nada que consultar (da `read([])`)
 * @param {unknown[]} params
 * @param {(rows: Record<string, unknown>[]) => T} read
 * @returns {import('$lib/server/db/batch.js').BatchQuery<T>}
 */
function query(what, fallback, sql, params, read) {
	return {
		what: `ficha: ${what}`,
		fallback,
		statements: (db) => (sql ? [db.prepare(sql).bind(...params)] : []),
		read: (results) => read(rowsOf(results))
	};
}

/**
 * El mail (normalizado) de la persona con ese id corto (`personId`), o `null`. Busca en todo lo
 * que guarda un mail: cuentas, órdenes (de cualquier estado), notas y avisos de series sin cuenta.
 *
 * @param {D1Database} db
 * @param {string} id
 * @returns {Promise<string | null>}
 */
export async function findPersonEmail(db, id) {
	if (!/^[0-9a-f]{16}$/.test(id)) return null;
	/** @param {string} what @param {string} sql */
	const emails = (what, sql) => query(what, [], sql, [], (rows) => rows.map((r) => str(r.e)));
	const found = await runQueries(db, {
		accounts: emails('mails de cuentas', 'SELECT email AS e FROM accounts WHERE email IS NOT NULL'),
		orders: emails('mails de órdenes', 'SELECT DISTINCT lower(trim(buyer_email)) AS e FROM orders'),
		notes: emails('mails de notas', 'SELECT DISTINCT lower(trim(email)) AS e FROM person_notes'),
		series: emails(
			'mails de series',
			'SELECT DISTINCT email AS e FROM series_subscriptions WHERE email IS NOT NULL'
		)
	});
	const all = new Set(
		[...found.accounts, ...found.orders, ...found.notes, ...found.series].map(normalizeEmail)
	);
	for (const email of all) {
		if (email && (await personId(email)) === id) return email;
	}
	return null;
}

/**
 * La clave de la ficha de una cuenta (por su id, también borrada), o `null` si no existe.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<FichaKey | null>}
 */
export async function accountKey(db, accountId) {
	if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) return null;
	const row = await db
		.prepare('SELECT id, email FROM accounts WHERE id = ?1')
		.bind(accountId)
		.first();
	if (!row) return null;
	return { email: normalizeEmail(str(row.email)), accountId: String(row.id) };
}

/**
 * El id de la cuenta de la persona (viva o borrada), o `null` si no tiene.
 *
 * @param {D1Database} db
 * @param {FichaKey} key
 */
export async function accountIdOf(db, key) {
	const row = await db
		.prepare(`SELECT id FROM accounts WHERE id IN ${ACC}`)
		.bind(...bind(key))
		.first();
	return row ? String(row.id) : null;
}

/** @param {FichaKey} key */
const bind = (key) => [key.email || '', key.accountId || ''];

/**
 * Las respuestas de inscripción guardadas (`[{ id, label, value }]`), limpias.
 * @param {unknown} raw
 * @returns {{ label: string, value: string }[]}
 */
function parseAnswers(raw) {
	try {
		const list = JSON.parse(String(raw));
		if (!Array.isArray(list)) return [];
		return list
			.filter((a) => a && typeof a === 'object')
			.map((a) => ({
				label: str(a.label),
				value: Array.isArray(a.value) ? a.value.map(String).join(', ') : str(a.value)
			}));
	} catch {
		return [];
	}
}

/**
 * Todas las consultas de la ficha, para una sola tanda.
 *
 * @param {FichaKey} key
 * @param {{ personId: string, emailHash: string }} extra
 */
function fichaQueries(key, extra) {
	const p = bind(key);
	const hasEmail = Boolean(key.email);
	return {
		account: query(
			'cuenta',
			null,
			`SELECT a.id, a.email, a.email_verified_at, a.password_hash IS NOT NULL AS has_password,
				a.password_updated_at, json_extract(a.preferences, '$.savedBuyer') AS saved,
				a.created_at, a.updated_at, a.deleted_at, a.can_have_profiles
			FROM accounts a WHERE a.id IN ${ACC}`,
			p,
			(rows) => {
				const r = rows[0];
				if (!r) return null;
				const saved = r.saved == null ? {} : cleanSavedBuyer(String(r.saved));
				return {
					id: String(r.id),
					email: r.email == null ? null : String(r.email),
					verified: r.email_verified_at != null,
					verifiedAt: num(r.email_verified_at),
					hasPassword: Number(r.has_password) === 1,
					passwordUpdatedAt: num(r.password_updated_at),
					createdAt: Number(r.created_at),
					updatedAt: num(r.updated_at),
					deletedAt: num(r.deleted_at),
					canHaveProfiles: Number(r.can_have_profiles) === 1,
					// «Mis datos»: el DNI guardado no viaja, solo si hay uno (se muestra con «Mostrar»).
					saved: {
						name: saved.name ?? '',
						pronouns: saved.pronouns ?? '',
						hasDni: Boolean(saved.dni)
					}
				};
			}
		),
		sessions: query(
			'sesiones',
			[],
			`SELECT method, COUNT(*) AS n, MAX(last_seen_at) AS last_seen, MIN(created_at) AS first
			FROM account_sessions WHERE account_id IN ${ACC} GROUP BY method ORDER BY method`,
			p,
			(rows) =>
				rows.map((r) => ({
					method: str(r.method),
					count: Number(r.n),
					lastSeen: num(r.last_seen),
					first: num(r.first)
				}))
		),
		orders: query(
			'órdenes',
			[],
			`SELECT o.id, o.event_slug, o.ticket_type, o.ticket_tier, o.quantity, o.unit_price,
				o.fondo_option, o.fondo_amount, o.fondo_contribution, o.subtotal, o.discount_code,
				o.discount_amount, o.surcharge_amount, o.total, o.payment_method, o.buyer_name,
				o.buyer_pronouns, o.buyer_email,
				(o.buyer_dni IS NOT NULL AND trim(o.buyer_dni) != '') AS has_dni,
				o.status, o.confirmed_by, o.refunded_at, o.refunded_by, o.email_sent_at, o.created_at,
				o.updated_at, o.needs_review, o.review_detail, o.channel, o.admin_note,
				o.account_id IS NOT NULL AND o.account_id IN ${ACC} AS by_account
			FROM orders o WHERE ${ORDER_MATCH} ORDER BY o.created_at DESC LIMIT 500`,
			p,
			(rows) => rows
		),
		tickets: query(
			'entradas',
			[],
			`SELECT t.order_id, t.ticket_type, t.holder_name, t.holder_pronouns, t.code,
				t.checked_in_at, t.checked_in_by
			FROM tickets t WHERE t.order_id IN ${ORDER_IDS} ORDER BY t.order_id, t.rowid`,
			p,
			(rows) => rows
		),
		answers: query(
			'respuestas de inscripción',
			[],
			`SELECT order_id, answers FROM order_answers WHERE order_id IN ${ORDER_IDS}`,
			p,
			(rows) => rows
		),
		reminders: query(
			'recordatorios',
			[],
			`SELECT order_id, reminder_id, sent_at, status FROM reminder_sends
			WHERE order_id IN ${ORDER_IDS} ORDER BY sent_at`,
			p,
			(rows) => rows
		),
		mails: query(
			'mails a compradores',
			[],
			hasEmail
				? `SELECT r.status, r.at, s.subject, s.event_slug, s.created_by
				FROM event_mail_recipients r JOIN event_mail_sends s ON s.id = r.send_id
				WHERE lower(trim(r.email)) = ?1 ORDER BY r.at DESC LIMIT ${FICHA_LIST_LIMIT}`
				: null,
			[key.email],
			(rows) =>
				rows.map((r) => ({
					status: str(r.status),
					at: Number(r.at),
					subject: str(r.subject),
					slug: str(r.event_slug),
					by: str(r.created_by)
				}))
		),
		profiles: query(
			'perfiles',
			[],
			`SELECT o.id, o.slug, o.title, o.data, o.visibility, o.created_at, o.deleted_at, pm.role,
				pm.created_at AS since
			FROM profile_managers pm JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id IN ${ACC} AND o.type = ?3
			ORDER BY o.deleted_at IS NOT NULL, o.created_at DESC`,
			[...p, PROFILE_TYPE],
			(rows) =>
				rows.map((r) => {
					/** @type {Record<string, unknown>} */
					let data = {};
					try {
						data = JSON.parse(str(r.data));
					} catch {
						// datos rotos: el chequeo nocturno lo reporta
					}
					return {
						id: Number(r.id),
						slug: str(r.slug),
						title: str(r.title),
						kind: profileKindOf(data),
						visibility: str(r.visibility),
						createdAt: Number(r.created_at),
						deletedAt: num(r.deleted_at),
						role: r.role === 'owner' ? 'owner' : 'manager',
						since: num(r.since)
					};
				})
		),
		claims: query(
			'pedidos «Es mi perfil»',
			[],
			`SELECT c.id, c.profile_id, o.title, c.status, c.message, c.created_at, c.decided_at,
				c.decided_by
			FROM profile_claims c LEFT JOIN objects o ON o.id = c.profile_id
			WHERE c.account_id IN ${ACC} ORDER BY c.created_at DESC`,
			p,
			(rows) =>
				rows.map((r) => ({
					id: Number(r.id),
					profileId: Number(r.profile_id),
					title: str(r.title),
					status: str(r.status),
					message: str(r.message),
					createdAt: Number(r.created_at),
					decidedAt: num(r.decided_at),
					decidedBy: str(r.decided_by)
				}))
		),
		invites: query(
			'invitaciones a gestionar',
			[],
			hasEmail
				? `SELECT i.profile_id, o.title, i.created_at, i.expires_at, a.email AS invited_by
				FROM profile_invites i LEFT JOIN objects o ON o.id = i.profile_id
				LEFT JOIN accounts a ON a.id = i.invited_by
				WHERE i.email_hash = ?1 ORDER BY i.created_at DESC`
				: null,
			[extra.emailHash],
			(rows) =>
				rows.map((r) => ({
					profileId: Number(r.profile_id),
					title: str(r.title),
					createdAt: Number(r.created_at),
					expiresAt: Number(r.expires_at),
					invitedBy: r.invited_by == null ? null : String(r.invited_by)
				}))
		),
		venues: query(
			'eventos de sus lugares',
			[],
			`SELECT event_slug, venue_id FROM event_venues
			WHERE venue_id IN (SELECT profile_id FROM profile_managers WHERE account_id IN ${ACC})`,
			p,
			(rows) => rows.map((r) => ({ slug: str(r.event_slug), profileId: Number(r.venue_id) }))
		),
		follows: query(
			'lo que sigue',
			[],
			`SELECT f.target_kind, f.target_key, f.in_calendar, f.mail_new, f.mail_reminder, f.tg_new,
				f.tg_reminder, f.series_subscription_id IS NOT NULL AS from_series, f.created_at,
				o.title AS profile_title
			FROM follows f
			LEFT JOIN objects o ON f.target_kind = 'perfil' AND o.id = CAST(f.target_key AS INTEGER)
			WHERE f.account_id IN ${ACC} ORDER BY f.created_at DESC`,
			p,
			(rows) =>
				rows.map((r) => ({
					kind: str(r.target_kind),
					key: str(r.target_key),
					title: r.profile_title == null ? str(r.target_key) : String(r.profile_title),
					inCalendar: Number(r.in_calendar) === 1,
					mailNew: Number(r.mail_new) === 1,
					mailReminder: Number(r.mail_reminder) === 1,
					tgNew: Number(r.tg_new) === 1,
					tgReminder: Number(r.tg_reminder) === 1,
					fromSeries: Number(r.from_series) === 1,
					createdAt: Number(r.created_at)
				}))
		),
		followNotifications: query(
			'avisos de lo que sigue',
			[],
			`SELECT event_slug, kind, channel, sent_at FROM follow_notifications
			WHERE account_id IN ${ACC} ORDER BY sent_at DESC LIMIT ${FICHA_LIST_LIMIT}`,
			p,
			(rows) =>
				rows.map((r) => ({
					slug: str(r.event_slug),
					kind: str(r.kind),
					channel: str(r.channel),
					sentAt: Number(r.sent_at)
				}))
		),
		series: query(
			'avisos de series',
			[],
			`SELECT s.series_tag, s.account_id IS NOT NULL AS by_account, s.created_at, s.confirmed_at,
				(SELECT COUNT(*) FROM series_notifications n WHERE n.subscription_id = s.id) AS sent
			FROM series_subscriptions s
			WHERE s.account_id IN ${ACC} OR (?1 != '' AND s.email = ?1)
			ORDER BY s.created_at DESC`,
			p,
			(rows) =>
				rows.map((r) => ({
					tag: str(r.series_tag),
					byAccount: Number(r.by_account) === 1,
					createdAt: Number(r.created_at),
					confirmedAt: num(r.confirmed_at),
					sent: Number(r.sent)
				}))
		),
		calendar: query(
			'calendario personal',
			null,
			`SELECT COUNT(*) AS n, MAX(last_used_at) AS last_used, MIN(created_at) AS created
			FROM calendar_feeds WHERE account_id IN ${ACC}`,
			p,
			(rows) => {
				const r = rows[0];
				if (!r || !Number(r.n)) return null;
				return { links: Number(r.n), lastUsed: num(r.last_used), createdAt: num(r.created) };
			}
		),
		telegram: query(
			'Telegram',
			null,
			`SELECT linked_at, muted FROM telegram_chats WHERE account_id IN ${ACC}`,
			p,
			(rows) => {
				const r = rows[0];
				return r ? { linkedAt: Number(r.linked_at), muted: Number(r.muted) === 1 } : null;
			}
		),
		notes: query(
			'notas',
			[],
			hasEmail
				? `SELECT id, body, created_at, created_by FROM person_notes
				WHERE lower(trim(email)) = ?1 ORDER BY created_at DESC, id DESC`
				: null,
			[key.email],
			(rows) =>
				rows.map((r) => ({
					id: Number(r.id),
					body: str(r.body),
					createdAt: Number(r.created_at),
					createdBy: str(r.created_by)
				}))
		),
		activity: query(
			'actividad',
			[],
			`SELECT id, at, actor_login, action, target_type, target_id, summary FROM admin_audit
			WHERE (target_type = 'account' AND target_id IN ${ACC})
				OR (target_type = 'person' AND ?3 != '' AND target_id = ?3)
				OR (target_type = 'order' AND target_id IN ${ORDER_IDS})
			ORDER BY at DESC, id DESC LIMIT ${FICHA_LIST_LIMIT}`,
			[...p, extra.personId],
			(rows) =>
				rows.map((r) => ({
					id: Number(r.id),
					at: Number(r.at),
					by: str(r.actor_login),
					action: str(r.action),
					targetType: str(r.target_type),
					summary: str(r.summary)
				}))
		)
	};
}

/**
 * Todo lo de la ficha. `null` si no hay nada de esa persona (ni cuenta, ni órdenes, ni notas, ni
 * avisos de series).
 *
 * @param {D1Database} db
 * @param {FichaKey} key
 * @param {{ now?: number, eventInfo?: (slug: string) => Promise<{ title: string, start: string | null } | null>, eventMetas?: () => Promise<{ slug: string, meta: Record<string, any> }[]> }} [opts]
 *   `eventInfo` y `eventMetas`: de dónde salen los eventos (los tests los reemplazan)
 */
export async function loadFicha(db, key, opts = {}) {
	const { now = Date.now(), eventInfo = getEventInfo, eventMetas = listEventMetas } = opts;
	const pid = key.email ? await personId(key.email) : '';
	const hash = key.email ? await emailHash(key.email) : '';
	const r = await runQueries(db, fichaQueries(key, { personId: pid, emailHash: hash }));
	if (!r.account && !r.orders.length && !r.notes.length && !r.series.length) return null;

	// Títulos y fechas de los eventos (órdenes, mails, avisos, perfiles), una vez por evento.
	/** @type {Map<string, { title: string, start: string | null }>} */
	const events = new Map();
	/** @type {{ profileId: number, slug: string, rol: string }[]} */
	const roles = [];
	if (r.profiles.length) {
		const bySlug = new Map(r.profiles.map((/** @type {any} */ p) => [p.slug, p.id]));
		for (const { slug, meta } of await eventMetas()) {
			const start = meta?.start instanceof Date ? meta.start.toISOString() : meta?.start;
			let mentioned = false;
			for (const e of parsePersonas(meta?.[PERSONAS_KEY])) {
				const id = e.perfil ? bySlug.get(e.perfil) : undefined;
				if (id === undefined) continue;
				roles.push({ profileId: id, slug, rol: e.rol });
				mentioned = true;
			}
			if (mentioned || r.venues.some((/** @type {any} */ v) => v.slug === slug)) {
				events.set(slug, {
					title: typeof meta?.title === 'string' && meta.title ? meta.title : slug,
					start: start ? String(start) : null
				});
			}
		}
	}
	for (const v of r.venues) roles.push({ profileId: v.profileId, slug: v.slug, rol: 'Lugar' });
	const slugs = new Set([
		...r.orders.map((/** @type {any} */ o) => str(o.event_slug)),
		...r.mails.map((/** @type {any} */ m) => m.slug),
		...r.followNotifications.map((/** @type {any} */ n) => n.slug),
		...roles.map((x) => x.slug)
	]);
	const missing = [...slugs].filter((s) => s && !events.has(s));
	const infos = await Promise.all(missing.map((s) => eventInfo(s).catch(() => null)));
	missing.forEach((s, i) => events.set(s, infos[i] ?? { title: s, start: null }));
	/** @param {string} slug */
	const ev = (slug) => events.get(slug) ?? { title: slug, start: null };

	// Entradas, respuestas y recordatorios por orden.
	/** @type {Map<string, any[]>} */
	const ticketsBy = new Map();
	for (const t of r.tickets) {
		const list = ticketsBy.get(str(t.order_id)) ?? [];
		list.push({
			type: str(t.ticket_type),
			name: str(t.holder_name),
			pronouns: str(t.holder_pronouns),
			code: str(t.code),
			checkedInAt: num(t.checked_in_at),
			checkedInBy: str(t.checked_in_by)
		});
		ticketsBy.set(str(t.order_id), list);
	}
	const answersBy = new Map(
		r.answers.map((/** @type {any} */ a) => [str(a.order_id), parseAnswers(a.answers)])
	);
	/** @type {Map<string, any[]>} */
	const remindersBy = new Map();
	for (const m of r.reminders) {
		const list = remindersBy.get(str(m.order_id)) ?? [];
		list.push({ id: str(m.reminder_id), sentAt: Number(m.sent_at), status: str(m.status) });
		remindersBy.set(str(m.order_id), list);
	}

	const orders = r.orders.map((/** @type {any} */ o) => {
		const tickets = ticketsBy.get(o.id) ?? [];
		return {
			id: str(o.id),
			slug: str(o.event_slug),
			event: ev(str(o.event_slug)).title,
			start: ev(str(o.event_slug)).start,
			type: str(o.ticket_type),
			tier: str(o.ticket_tier),
			quantity: Number(o.quantity),
			unitPrice: Number(o.unit_price),
			subtotal: Number(o.subtotal),
			total: Number(o.total),
			fondoOption: str(o.fondo_option),
			fondoAmount: Number(o.fondo_amount),
			fondoContribution: Number(o.fondo_contribution),
			discountCode: str(o.discount_code),
			discountAmount: Number(o.discount_amount),
			surcharge: Number(o.surcharge_amount ?? 0),
			method: str(o.payment_method),
			channel: str(o.channel),
			status: str(o.status),
			name: str(o.buyer_name),
			pronouns: str(o.buyer_pronouns),
			email: str(o.buyer_email),
			hasDni: Number(o.has_dni) === 1,
			byAccount: Number(o.by_account) === 1,
			confirmedBy: str(o.confirmed_by),
			refundedAt: num(o.refunded_at),
			refundedBy: str(o.refunded_by),
			emailSentAt: num(o.email_sent_at),
			createdAt: Number(o.created_at),
			needsReview: str(o.needs_review),
			reviewDetail: str(o.review_detail),
			adminNote: str(o.admin_note),
			tickets,
			answers: answersBy.get(o.id) ?? [],
			reminders: remindersBy.get(o.id) ?? []
		};
	});

	// Resumen como en Personas (solo órdenes aprobadas o reembolsadas, por mail o por cuenta).
	const kept = orders
		.filter((o) => o.status === 'approved' || o.status === 'refunded')
		.map((o) => ({
			id: o.id,
			event_slug: o.slug,
			ticket_type: o.type,
			quantity: o.quantity,
			total: o.total,
			payment_method: o.method,
			fondo_option: o.fondoOption,
			fondo_amount: o.fondoAmount,
			fondo_contribution: o.fondoContribution,
			buyer_name: o.name,
			buyer_pronouns: o.pronouns || null,
			// Todo junto: una orden con la cuenta pero con otro mail es de la misma persona.
			buyer_email: key.email || r.account?.id || 'cuenta',
			status: o.status,
			created_at: o.createdAt,
			checked: o.tickets.filter((/** @type {any} */ t) => t.checkedInAt != null).length
		}))
		.reverse();
	const [summary] = groupPeople(kept, events, { now });

	const profileTitle = new Map(r.profiles.map((/** @type {any} */ p) => [p.id, p.title]));
	const sessions = r.sessions;
	return {
		key: { email: key.email, accountId: r.account?.id ?? key.accountId ?? '', personId: pid },
		now,
		account: r.account,
		sessions: {
			total: sessions.reduce((n, s) => n + s.count, 0),
			lastSeen: sessions.reduce(
				(m, s) => (s.lastSeen != null && (m == null || s.lastSeen > m) ? s.lastSeen : m),
				/** @type {number | null} */ (null)
			),
			methods: sessions
		},
		summary: summary
			? {
					names: summary.names,
					pronouns: summary.pronouns,
					orders: summary.orders,
					spent: summary.spent,
					refunded: summary.refunded,
					bought: summary.bought.length,
					attended: summary.attended.length,
					noShows: summary.noShows.length,
					firstVisit: summary.firstVisit,
					lastVisit: summary.lastVisit
				}
			: null,
		orders,
		mails: r.mails.map((/** @type {any} */ m) => ({ ...m, event: ev(m.slug).title })),
		profiles: r.profiles,
		liveProfiles: r.profiles.filter((/** @type {any} */ p) => p.deletedAt == null).length,
		claims: r.claims,
		invites: r.invites.map((/** @type {any} */ i) => ({ ...i, expired: i.expiresAt <= now })),
		profileEvents: roles
			.map((x) => ({
				...x,
				profile: profileTitle.get(x.profileId) ?? '',
				title: ev(x.slug).title,
				start: ev(x.slug).start
			}))
			.sort((a, b) => String(b.start ?? '').localeCompare(String(a.start ?? ''))),
		follows: r.follows,
		followNotifications: r.followNotifications.map((/** @type {any} */ n) => ({
			...n,
			event: ev(n.slug).title
		})),
		series: r.series,
		calendar: r.calendar,
		telegram: r.telegram,
		notes: r.notes,
		activity: r.activity
	};
}

/**
 * El DNI de una orden de la persona, o el guardado en «Mis datos» de su cuenta. `null` si no hay
 * (o la orden no es suya). Quien llama lo anota en el registro de actividad, sin el DNI.
 *
 * @param {D1Database} db
 * @param {FichaKey} key
 * @param {{ orderId: string } | { saved: true }} what
 * @returns {Promise<string | null>}
 */
export async function revealDni(db, key, what) {
	if ('orderId' in what) {
		if (typeof what.orderId !== 'string' || !what.orderId || what.orderId.length > 64) return null;
		const row = await db
			.prepare(`SELECT o.buyer_dni FROM orders o WHERE o.id = ?3 AND ${ORDER_MATCH}`)
			.bind(...bind(key), what.orderId)
			.first();
		const dni = str(row?.buyer_dni).trim();
		return dni || null;
	}
	const row = await db
		.prepare(
			`SELECT json_extract(preferences, '$.savedBuyer') AS v FROM accounts
			WHERE id IN ${ACC} AND deleted_at IS NULL`
		)
		.bind(...bind(key))
		.first();
	return row?.v == null ? null : (cleanSavedBuyer(String(row.v)).dni ?? null);
}
