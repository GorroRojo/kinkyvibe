/**
 * «Para revisar»: UNA sola fuente para la tarjeta del Inicio y el botón «Para revisar» del menú
 * (decisión 0030, docs/panel.md).
 *
 * **La regla de la cuenta: el número es la cantidad de filas que muestra la tarjeta.** Cada fila
 * cuenta 1, también la que junta varias cosas («3 transferencias esperando confirmación» de un
 * evento, «4 eventos próximos sin imagen», el chequeo nocturno con sus problemas, las etiquetas):
 * es lo que se ve y lo que hay que tocar. `reviewCount(rows)` es `rows.length`, nada más.
 *
 * Las dos (`+page.server.js` del Inicio y `panelCounts.js` del menú) arman las filas con
 * {@link reviewRows}, sobre los mismos datos:
 * - {@link reviewQueries}: lo que no depende de la lista de eventos (va en la primera tanda);
 * - {@link reviewEventQueries}: lo que depende de los eventos que vienen (en la segunda);
 * - {@link reviewOutside}: lo que no sale de esas tandas (los PRs de contenido de GitHub, con su
 *   caché, y el uso de las etiquetas en las publicaciones, que el isolate recuerda mientras la
 *   base no cambie).
 * La lista para revisar del importador de contenido no se calcula acá: sale de lo que guardó la
 * última vez su página (`review_snapshots`, ver ./reviewSnapshots.js).
 */
import { dev } from '$app/environment';
import { rowsOf } from '$lib/server/db/batch.js';
import { profilesToReviewQuery } from '$lib/server/admin/cuentas.js';
import { listClaimsStatement, toAdminClaim } from '$lib/server/amigues/claims.js';
import { usesLocalRepo } from '$lib/server/eventos/index.js';
import { contentPullItems, openContentPullStatuses } from '$lib/server/admin/contentPulls.js';
import { isTestEventSlug } from '$lib/server/tickets/events.js';
import { transferReadyFromSettings } from '$lib/server/tickets/index.js';
import { parseReminders } from '$lib/server/tickets/reminders.js';
import {
	getSalesSettings,
	readSalesSettings,
	salesSettingsStatement
} from '$lib/server/tickets/settings.js';
import { tagIssuesOf, tagRecordsQuery, tagUsageAndWiki } from '$lib/server/etiquetas/review.js';
import { editEventHref, orderHref, streamHref, transfersHref } from '$lib/admin/links.js';
import { reviewSnapshotQuery } from './reviewSnapshots.js';
import {
	arDay,
	claimReviewItems,
	failedRemindersQuery,
	groupReviewItems,
	integrityReviewRow,
	integrityRunQuery,
	onlineMismatchCountQuery,
	onlineMismatchItem,
	pendingTransfersQuery,
	profileReviewItems,
	reviewItems,
	reviewOrdersQuery,
	streamLinkSlugsQuery,
	stuckSendsQuery,
	ticketTotalsQuery,
	transferMissingItem,
	unsentEmailsQuery,
	whenLabel
} from './inicio.js';

/** @typedef {import('./inicio.js').ReviewItem} ReviewItem */
/** @typedef {import('./inicio.js').ReviewRow} ReviewRow */
/** @typedef {import('$lib/server/eventos/index.js').EventSummary} EventSummary */
/** @typedef {import('$lib/server/tickets/config.js').EventTickets} EventTickets */
/** @typedef {import('./reviewSnapshots.js').ReviewSnapshot} ReviewSnapshot */
/** @typedef {import('$lib/server/etiquetas/review.js').TagIssueCounts} TagIssueCounts */

/** La lista de Eventos con los próximos sin imagen. */
export const NO_IMAGE_HREF = '/admin/eventos?filtro=sin-imagen';
/** Etiquetas (su tarjeta «Para revisar» está en la página). */
export const TAGS_REVIEW_HREF = '/admin/etiquetas';
/** Contenido → En la base (el importador, con su lista «Para revisar»). */
export const IMPORT_REVIEW_HREF = '/admin/contenido/base';

/**
 * Los eventos de prueba del repo solo existen en `vite dev`.
 * @param {string} slug
 */
export const skipReviewEvent = (slug) => !dev && isTestEventSlug(slug);

/**
 * Los ajustes de la venta (para los recordatorios y para saber si hay datos para transferir).
 * `null` si fallan; sin la tabla, los de las variables de entorno (como `getSalesSettings`).
 * @returns {import('$lib/server/db/batch.js').BatchQuery<Awaited<ReturnType<typeof getSalesSettings>> | null>}
 */
export function salesSettingsQuery() {
	return {
		what: 'inicio: ajustes de la venta',
		fallback: null,
		statements: (db) => [salesSettingsStatement(db)],
		read: (results) => readSalesSettings(rowsOf(results)),
		alone: getSalesSettings
	};
}

/**
 * Los pedidos "Es mi perfil" pendientes; `[]` si falla (sin la migración 0017).
 * @returns {import('$lib/server/db/batch.js').BatchQuery<import('$lib/server/amigues/claims.js').AdminClaim[]>}
 */
export function claimsQuery() {
	return {
		what: 'inicio: pedidos "Es mi perfil"',
		fallback: [],
		statements: (db) => [listClaimsStatement(db)],
		read: (results) => rowsOf(results).map(toAdminClaim)
	};
}

/**
 * Lugar vacío en una tanda: no va a la base y da `value`.
 * @template T
 * @param {T} value
 * @returns {import('$lib/server/db/batch.js').BatchQuery<T>}
 */
export function noQuery(value) {
	return { what: '', fallback: value, statements: () => [], read: () => value };
}

/**
 * Lo de «Para revisar» que no depende de la lista de eventos: va en la primera tanda (del Inicio y
 * del menú). Las claves son las que espera {@link reviewRows}.
 * @param {number} now
 * @param {{ login?: string }} [viewer] quién mira (las etiquetas, como las ve en Etiquetas)
 */
export function reviewQueries(now, { login = '' } = {}) {
	return {
		transfers: pendingTransfersQuery(now),
		review: reviewOrdersQuery(),
		unsent: unsentEmailsQuery(now),
		settings: salesSettingsQuery(),
		// Lo que encontró el chequeo nocturno de integridad de los objetos (null si nada).
		integrity: integrityRunQuery(),
		// Perfiles creados por cuentas que ninguna admin revisó todavía (Perfiles).
		newProfiles: profilesToReviewQuery(),
		// Pedidos "Es mi perfil" pendientes (docs/amigues.md). [] sin la migración 0017.
		claims: claimsQuery(),
		// Eventos con la etiqueta «Online» y además un lugar (los que vienen y los del último mes).
		onlineMismatch: onlineMismatchCountQuery(now),
		// La lista para revisar del importador, como quedó la última vez que se abrió su página.
		importCheck: reviewSnapshotQuery('importacion'),
		// Las etiquetas de la base, para lo que Etiquetas tiene «Para revisar».
		tagRecords: login ? tagRecordsQuery(login) : noQuery(null)
	};
}

/**
 * Los eventos que vienen y lo que hace falta saber de ellos (para la segunda tanda).
 *
 * @param {{
 *   events: EventSummary[],
 *   ticketedList: { slug: string, config: EventTickets }[],
 *   now: number,
 *   skip?: (slug: string) => boolean
 * }} input
 */
export function reviewEventContext({ events, ticketedList, now, skip = skipReviewEvent }) {
	const ticketed = new Map(ticketedList.map((t) => [t.slug, t.config]));
	const titles = new Map(events.map((e) => [e.slug, e.title]));
	const today = arDay(now);
	const soonSlugs = events
		.filter((e) => !e.unpublished && e.start && arDay(e.start) >= today && !skip(e.slug))
		.map((e) => e.slug);
	const soonTicketed = soonSlugs.filter((s) => ticketed.has(s));
	const reminderEvents = soonTicketed.flatMap((slug) => {
		const c = ticketed.get(slug);
		const start = c?.start ? Date.parse(c.start) : NaN;
		return c && Number.isFinite(start)
			? [{ slug, start, reminders: c.reminders, cancelled: c.status === 'cancelado' }]
			: [];
	});
	return { ticketed, titles, today, soonTicketed, reminderEvents };
}

/**
 * Lo de «Para revisar» que depende de los eventos que vienen y de los ajustes (segunda tanda).
 *
 * @param {{
 *   soonTicketed: string[],
 *   reminderEvents: ReturnType<typeof reviewEventContext>['reminderEvents'],
 *   settings: Awaited<ReturnType<typeof getSalesSettings>> | null,
 *   now: number
 * }} input
 */
export function reviewEventQueries({ soonTicketed, reminderEvents, settings, now }) {
	return {
		totals: ticketTotalsQuery(soonTicketed, now),
		streamLinks: streamLinkSlugsQuery(soonTicketed),
		stuck: stuckSendsQuery(soonTicketed),
		reminders: settings
			? failedRemindersQuery({
					events: reminderEvents,
					reminders: parseReminders(settings.reminders),
					now
				})
			: noQuery(/** @type {Map<string, number>} */ (new Map()))
	};
}

/**
 * Lo que no sale de las tandas: los PRs de contenido (GitHub, recordados un minuto; ninguno en dev
 * y en los previews) y cuánto se usa cada etiqueta en las publicaciones (lo que lee Etiquetas; las
 * publicaciones las recuerda el isolate mientras la base no cambie). Nunca falla.
 *
 * @param {{ locals: App.Locals | undefined }} input
 * @returns {Promise<{ contentPulls: import('./contentPulls.js').ContentPullInfo[], tagUsage: Awaited<ReturnType<typeof tagUsageAndWiki>> | null }>}
 */
export async function reviewOutside({ locals }) {
	const token = locals?.user_token;
	const [contentPulls, tagUsage] = await Promise.all([
		usesLocalRepo() || !token
			? Promise.resolve([])
			: openContentPullStatuses(token).catch((e) => {
					console.log('Para revisar: no se pudieron leer los PRs de contenido', e);
					return [];
				}),
		tagUsageAndWiki().catch((e) => {
			console.error('[admin] «Para revisar»: no se pudo leer el uso de las etiquetas', e);
			return null;
		})
	]);
	return { contentPulls, tagUsage };
}

/**
 * La fila de Etiquetas: lo que su «Para revisar» tiene en las pestañas que son problemas (sin
 * declarar, fuera del árbol, referencias rotas). Nada si no hay nada.
 *
 * @param {TagIssueCounts | null} tags
 * @returns {ReviewItem | null}
 */
export function tagReviewItem(tags) {
	if (!tags) return null;
	const total = tags.undeclared + tags.orphans + tags.broken;
	if (total <= 0) return null;
	/** @param {number} n @param {string} one @param {string} many */
	const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
	const parts = [
		tags.undeclared ? `${tags.undeclared} sin declarar` : '',
		tags.orphans ? `${tags.orphans} fuera del árbol` : '',
		tags.broken ? plural(tags.broken, 'referencia rota', 'referencias rotas') : ''
	].filter(Boolean);
	return {
		id: 'tags-review',
		tone: 'warn',
		icon: 'tag',
		title: `${plural(total, 'cosa', 'cosas')} para revisar en Etiquetas`,
		text: parts.join(' · '),
		action: 'Ver',
		href: TAGS_REVIEW_HREF
	};
}

/** Cómo se llama cada categoría del importador en el texto de su fila. */
const IMPORT_LABELS = /** @type {Record<string, [string, string]>} */ ({
	calendario: ['evento', 'eventos'],
	material: ['publicación de material', 'publicaciones de material']
});

/**
 * La fila del importador de contenido: su lista «Para revisar» como quedó la última vez que se
 * abrió Contenido → En la base. Nada si estaba vacía (o nunca se abrió).
 *
 * @param {ReviewSnapshot | null} snapshot
 * @param {{ formatWhen?: (ms: number) => string }} [opts]
 * @returns {ReviewItem | null}
 */
export function importReviewItem(snapshot, { formatWhen } = {}) {
	if (!snapshot || snapshot.count <= 0) return null;
	const n = snapshot.count;
	const parts = Object.entries(snapshot.detail)
		.filter(([, v]) => v > 0)
		.map(([k, v]) => {
			const [one, many] = IMPORT_LABELS[k] ?? [k, k];
			return `${v} ${v === 1 ? one : many}`;
		});
	const when =
		formatWhen && snapshot.computedAt ? `revisado ${formatWhen(snapshot.computedAt)}` : '';
	return {
		id: 'import-review',
		tone: 'info',
		icon: 'import',
		title: `${n} ${n === 1 ? 'archivo .md para revisar' : 'archivos .md para revisar'} en Contenido → En la base`,
		text: [...parts, when].filter(Boolean).join(' · '),
		action: 'Ver',
		href: IMPORT_REVIEW_HREF
	};
}

/**
 * Las filas de «Para revisar», en el orden de la tarjeta. Pura: la usan la tarjeta del Inicio y
 * el contador del menú (que es `rows.length`, ver {@link reviewCount}).
 *
 * @param {{
 *   upcoming: import('./inicio.js').UpcomingEvent[],
 *   ticketed: Map<string, Pick<EventTickets, 'paymentMethods'>>,
 *   settings: Awaited<ReturnType<typeof getSalesSettings>> | null,
 *   transfers: { slug: string, count: number, oldestExpiry: number }[],
 *   unsent: { id: string, ref: string, slug: string, buyerName: string }[],
 *   review: { id: string, ref: string, slug: string, reason: string, buyerName: string }[],
 *   titles: Map<string, string>,
 *   onlineMismatch: number | null,
 *   newProfiles: Parameters<typeof profileReviewItems>[0],
 *   claims: Parameters<typeof claimReviewItems>[0],
 *   integrity: import('$lib/server/objects/integrity.js').IntegrityRun | null,
 *   contentPulls: import('./contentPulls.js').ContentPullInfo[],
 *   tagRecords: import('$lib/server/etiquetas/editor.js').StoredTag[] | null,
 *   tagUsage: Awaited<ReturnType<typeof tagUsageAndWiki>> | null,
 *   importCheck: ReviewSnapshot | null,
 *   now: number
 * }} facts
 * @returns {ReviewRow[]}
 */
export function reviewRows(facts) {
	const { upcoming, ticketed, settings, transfers, unsent, review, titles, now } = facts;
	/** @param {number} ms */
	const formatWhen = (ms) => whenLabel(ms, now);
	const pullItems = contentPullItems(facts.contentPulls);
	const todoItems = reviewItems({
		upcoming,
		transfers,
		unsent,
		review,
		titles,
		links: { transfers: transfersHref, order: orderHref, stream: streamHref, edit: editEventHref },
		formatWhen
	});
	// Un evento ofrece transferencia y no hay datos para transferir: la compra no la muestra.
	const transferMissing = transferMissingItem({
		upcoming,
		ticketed,
		transferReady: transferReadyFromSettings(settings)
	});
	// Eventos con lugar y etiqueta «Online»: una fila que lleva a esa lista de Eventos.
	const onlineItem = onlineMismatchItem(facts.onlineMismatch);
	const tagItem = tagReviewItem(tagIssuesOf(facts.tagRecords, facts.tagUsage));
	const importItem = importReviewItem(facts.importCheck, { formatWhen });
	// Los PRs de contenido que no se publicaron van primero; los que se están publicando, al final.
	// Lo repetitivo (sin imagen, borradores, perfiles nuevos) va en una fila por tipo con la cuenta.
	const rows = groupReviewItems(
		[
			...pullItems.filter((i) => i.tone !== 'info'),
			...(transferMissing ? [transferMissing] : []),
			...todoItems,
			...(onlineItem ? [onlineItem] : []),
			...profileReviewItems(facts.newProfiles, { formatWhen }),
			...claimReviewItems(facts.claims, { formatWhen }),
			...(tagItem ? [tagItem] : []),
			...(importItem ? [importItem] : []),
			...pullItems.filter((i) => i.tone === 'info')
		],
		{ links: { noImage: NO_IMAGE_HREF } }
	);
	// El chequeo nocturno de los datos, en una sola fila que se despliega (solo si encontró algo).
	const integrityRow = integrityReviewRow(facts.integrity, { formatWhen });
	if (integrityRow) rows.push(integrityRow);
	return rows;
}

/**
 * Cuántas cosas hay «Para revisar»: las filas de la tarjeta (cada una cuenta 1).
 * @param {readonly unknown[]} rows lo que dio {@link reviewRows}
 */
export function reviewCount(rows) {
	return rows.length;
}
