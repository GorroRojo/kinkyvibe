/**
 * «Lo que sigo» en números, para Mensajes › Lo que sigo del panel (docs/lo-que-sigo.md). Solo
 * lee: no cambia nada de lo que sigue la gente.
 *
 * **Privacidad**: todo lo que devuelve son cuentas (totales) y, en «Lo más seguido», qué se sigue
 * (una etiqueta o un perfil) con cuántas cuentas lo siguen. Nunca quién: ninguna consulta de acá
 * lee `account_id`, mails ni ids de chats para devolverlos (solo los cuenta). Lo que sigue cada
 * persona se ve en su ficha (decisión 0043), no acá.
 *
 * Cada lectura va en su propio try/catch, como Automatizaciones: si una tabla falta (una
 * migración sin aplicar), ese dato queda en `null` y la página sigue.
 */
import { normalizeProfileKind } from '$lib/server/objects/types/perfil.js';
import { profileHref } from '$lib/admin/links.js';
import { resolveTag } from './targets.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

const DAY = 24 * 60 * 60 * 1000;

/**
 * Qué es cada fila de «Lo más seguido»: una etiqueta (o serie), un perfil de persona o proyecto,
 * o un lugar.
 *
 * @typedef {'etiqueta' | 'perfil' | 'lugar'} RankGroup
 */

/**
 * Una fila de «Lo más seguido». `state`: `null` si está bien; `oculto` o `borrado` (un perfil) o
 * `no-existe` (una etiqueta que ya no está en el árbol, o un perfil que no está en la base).
 *
 * @typedef {{
 *   group: RankGroup,
 *   key: string,
 *   title: string,
 *   href: string | null,
 *   series: boolean,
 *   profileKind: string | null,
 *   state: null | 'oculto' | 'borrado' | 'no-existe',
 *   count: number
 * }} RankRow
 */

/**
 * Avisos que salieron de un tipo y un canal.
 *
 * @typedef {{ d7: number, d30: number, total: number }} NoticeCounts
 */

/**
 * @typedef {{
 *   accounts: number | null,
 *   follows: { total: number, etiqueta: number, perfil: number, lugar: number } | null,
 *   options: { inCalendar: number, mailNew: number, mailReminder: number, tgNew: number,
 *     tgReminder: number } | null,
 *   notices: { nuevo: { mail: NoticeCounts, telegram: NoticeCounts },
 *     recordatorio: { mail: NoticeCounts, telegram: NoticeCounts }, last: number | null } | null,
 *   avisame: { migrated: number | null, pendingWithAccount: number | null,
 *     withoutAccount: number | null },
 *   telegram: { linked: number, muted: number } | null,
 *   ranking: { etiqueta: RankRow[], perfil: RankRow[], lugar: RankRow[] } | null
 * }} FollowStats
 */

/** @param {unknown} v */
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Corre una consulta; si falla (tabla que falta, sin base), `null`.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T | null>}
 */
async function orNull(fn) {
	try {
		return await fn();
	} catch {
		return null;
	}
}

/** @returns {NoticeCounts} */
const zero = () => ({ d7: 0, d30: 0, total: 0 });

/**
 * Lo que sigue la gente, en números (ver arriba: nunca quién).
 *
 * @param {D1Database | null | undefined} db
 * @param {{ tags: TagManager, now?: number }} opts `tags`: el árbol del sitio, para nombrar las
 *   etiquetas de «Lo más seguido»
 * @returns {Promise<FollowStats>}
 */
export async function followStats(db, { tags, now = Date.now() }) {
	if (!db) {
		return {
			accounts: null,
			follows: null,
			options: null,
			notices: null,
			avisame: { migrated: null, pendingWithAccount: null, withoutAccount: null },
			telegram: null,
			ranking: null
		};
	}
	// Solo las cuentas que existen (como el paso de «Avisame»): borrar una cuenta ya borra lo
	// que seguía, esto es por las dudas.
	const LIVE = 'JOIN accounts a ON a.id = f.account_id AND a.deleted_at IS NULL';
	const [totals, rankRows, notices, migrated, pending, withoutAccount, telegram] =
		await Promise.all([
			orNull(() =>
				db
					.prepare(
						`SELECT COUNT(DISTINCT f.account_id) AS accounts,
							SUM(f.in_calendar) AS in_calendar, SUM(f.mail_new) AS mail_new,
							SUM(f.mail_reminder) AS mail_reminder, SUM(f.tg_new) AS tg_new,
							SUM(f.tg_reminder) AS tg_reminder
						FROM follows f ${LIVE}`
					)
					.first()
			),
			orNull(async () => {
				const { results } = await db
					.prepare(
						`SELECT f.target_kind, f.target_key, COUNT(*) AS n,
							o.id AS object_id, o.title, o.visibility, o.deleted_at,
							json_extract(o.data, '$.kind') AS profile_kind
						FROM follows f ${LIVE}
						LEFT JOIN objects o ON f.target_kind = 'perfil'
							AND o.id = CAST(f.target_key AS INTEGER) AND o.type = 'perfil'
						GROUP BY f.target_kind, f.target_key
						ORDER BY n DESC, f.target_key`
					)
					.all();
				return results;
			}),
			orNull(async () => {
				const { results } = await db
					.prepare(
						`SELECT kind, channel, COUNT(*) AS total,
							SUM(CASE WHEN sent_at >= ?1 THEN 1 ELSE 0 END) AS d30,
							SUM(CASE WHEN sent_at >= ?2 THEN 1 ELSE 0 END) AS d7,
							MAX(sent_at) AS last
						FROM follow_notifications GROUP BY kind, channel`
					)
					.bind(now - 30 * DAY, now - 7 * DAY)
					.all();
				return results;
			}),
			orNull(() =>
				db
					.prepare('SELECT COUNT(*) AS n FROM follows WHERE series_subscription_id IS NOT NULL')
					.first()
			),
			// Las mismas que pasa `migrateAccountSubscriptions` (avisame.js).
			orNull(() =>
				db
					.prepare(
						`SELECT COUNT(*) AS n FROM series_subscriptions s
						JOIN accounts a ON a.id = s.account_id AND a.deleted_at IS NULL
						WHERE s.account_id IS NOT NULL AND s.confirmed_at IS NOT NULL`
					)
					.first()
			),
			orNull(() =>
				db
					.prepare(
						`SELECT COUNT(*) AS n FROM series_subscriptions
						WHERE account_id IS NULL AND confirmed_at IS NOT NULL`
					)
					.first()
			),
			orNull(() =>
				db.prepare('SELECT COUNT(*) AS linked, SUM(muted) AS muted FROM telegram_chats').first()
			)
		]);

	/** @type {FollowStats['notices']} */
	let noticeStats = null;
	if (notices) {
		noticeStats = {
			nuevo: { mail: zero(), telegram: zero() },
			recordatorio: { mail: zero(), telegram: zero() },
			last: null
		};
		for (const r of notices) {
			const kind = r.kind === 'recordatorio' ? 'recordatorio' : r.kind === 'nuevo' ? 'nuevo' : null;
			const channel = r.channel === 'telegram' ? 'telegram' : r.channel === 'mail' ? 'mail' : null;
			if (!kind || !channel) continue;
			noticeStats[kind][channel] = { d7: n(r.d7), d30: n(r.d30), total: n(r.total) };
			const last = r.last == null ? null : Number(r.last);
			if (last !== null && Number.isFinite(last))
				noticeStats.last = Math.max(noticeStats.last ?? 0, last);
		}
	}

	const ranking = rankRows ? groupRanking(rankRows, tags) : null;

	return {
		accounts: totals ? n(totals.accounts) : null,
		follows: ranking
			? {
					total: [...ranking.etiqueta, ...ranking.perfil, ...ranking.lugar].reduce(
						(s, r) => s + r.count,
						0
					),
					etiqueta: ranking.etiqueta.reduce((s, r) => s + r.count, 0),
					perfil: ranking.perfil.reduce((s, r) => s + r.count, 0),
					lugar: ranking.lugar.reduce((s, r) => s + r.count, 0)
				}
			: null,
		options: totals
			? {
					inCalendar: n(totals.in_calendar),
					mailNew: n(totals.mail_new),
					mailReminder: n(totals.mail_reminder),
					tgNew: n(totals.tg_new),
					tgReminder: n(totals.tg_reminder)
				}
			: null,
		notices: noticeStats,
		avisame: {
			migrated: migrated ? n(migrated.n) : null,
			pendingWithAccount: pending ? n(pending.n) : null,
			withoutAccount: withoutAccount ? n(withoutAccount.n) : null
		},
		telegram: telegram ? { linked: n(telegram.linked), muted: n(telegram.muted) } : null,
		ranking
	};
}

/**
 * Las filas agrupadas de `follows` (qué se sigue y cuántas cuentas) → «Lo más seguido» en tres
 * grupos, ya ordenados (más seguido primero; a igual número, por nombre). Solo arma lo que se
 * muestra: el nombre, el link al panel y el estado.
 *
 * @param {Record<string, unknown>[]} rows
 * @param {TagManager} tags
 * @returns {{ etiqueta: RankRow[], perfil: RankRow[], lugar: RankRow[] }}
 */
export function groupRanking(rows, tags) {
	/** @type {{ etiqueta: RankRow[], perfil: RankRow[], lugar: RankRow[] }} */
	const out = { etiqueta: [], perfil: [], lugar: [] };
	for (const r of rows) {
		const key = String(r.target_key ?? '');
		const count = n(r.n);
		if (!key || count <= 0) continue;
		if (r.target_kind === 'etiqueta') {
			const tag = resolveTag(tags, key);
			out.etiqueta.push({
				group: 'etiqueta',
				key,
				title: tag?.title ?? `#${key}`,
				href: `/admin/etiquetas?etiqueta=${encodeURIComponent(tag?.target.key ?? key)}`,
				series: Boolean(tag?.series),
				profileKind: null,
				state: tag ? null : 'no-existe',
				count
			});
		} else if (r.target_kind === 'perfil') {
			const exists = r.object_id != null;
			const profileKind = exists ? (normalizeProfileKind(r.profile_kind) ?? 'persona') : null;
			const group = profileKind === 'lugar' ? 'lugar' : 'perfil';
			out[group].push({
				group,
				key,
				title: exists ? String(r.title) : `Perfil ${key}`,
				href: exists ? profileHref(key) : null,
				series: false,
				profileKind,
				state: !exists
					? 'no-existe'
					: r.deleted_at != null
						? 'borrado'
						: r.visibility === 'hidden'
							? 'oculto'
							: null,
				count
			});
		}
	}
	for (const list of Object.values(out))
		list.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'es'));
	return out;
}
