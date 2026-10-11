/**
 * Contadores del menú del panel, para el layout de /admin (`+layout.server.js`).
 */
import { getDB } from '$lib/server/db';
import { rowsOf, runQueries } from '$lib/server/db/batch.js';
import { countProfilesToReviewQuery } from '$lib/server/admin/cuentas.js';
import { countPendingClaimsStatement, readPendingClaimsCount } from '$lib/server/amigues/claims.js';
import { unlistedCountQuery } from '$lib/server/contenido/posts.js';
import { listEvents } from '$lib/server/eventos/index.js';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { upcomingEvents } from '$lib/server/admin/inicio.js';
import {
	reviewCount,
	reviewEventContext,
	reviewEventQueries,
	reviewTagUsage,
	reviewQueries,
	reviewRows,
	skipReviewEvent
} from '$lib/server/admin/review.js';

/**
 * Contadores del menú del panel (`data.panelCounts`, las claves que usa `counter` en
 * `$lib/admin/nav.js`). Nunca rompen la página: sin base de datos o con un error, el contador
 * simplemente no aparece (o cuenta lo que se pudo leer).
 *
 * Idas a la base (tandas, ver $lib/server/db/batch.js): una con los contadores y lo de «Para
 * revisar» que no depende de los eventos, a la par de la lista de eventos (que el isolate recuerda
 * mientras la base no cambie); y, solo si hay eventos que vienen con entradas, otra con lo que
 * depende de ellos (totales, links, envíos y recordatorios). Las mismas consultas que el Inicio.
 *
 * `review` (el botón «Para revisar») es la cantidad de filas de la tarjeta del Inicio: las arma
 * `reviewRows` (review.js), la misma función que usa la tarjeta (decisión 0030).
 *
 * @param {App.Platform | undefined} platform
 * @param {number} [now]
 * @param {{ locals?: App.Locals }} [opts] quién mira (las etiquetas, como las ve en Etiquetas)
 * @returns {Promise<Record<string, number>>}
 */
export async function panelCounts(platform, now = Date.now(), { locals } = {}) {
	/** @type {Record<string, number>} */
	const counts = {};
	const db = getDB(platform);
	/** @type {import('$lib/server/db/batch.js').BatchQuery<number | null>} */
	let unlistedQuery;
	try {
		unlistedQuery = await unlistedCountQuery(platform);
	} catch (error) {
		console.error('[admin] contador de no listadas:', error);
		unlistedQuery = { what: '', fallback: null, statements: () => [], read: () => null };
	}
	// El uso de las etiquetas y la lista de eventos, a la par de la tanda.
	const outside = reviewTagUsage();
	const eventLists = Promise.all([listEvents(), listTicketedEvents()]).catch((error) => {
		console.error('[admin] «Para revisar»: no se pudo leer la lista de eventos', error);
		return /** @type {[import('$lib/server/eventos/index.js').EventSummary[], { slug: string, config: import('$lib/server/tickets/config.js').EventTickets }[]]} */ ([
			[],
			[]
		]);
	});
	const s1 = await runQueries(db, {
		orders: panelOrderCountsQuery(now),
		// Perfiles creados por cuentas que ninguna admin revisó (Perfiles). Sin la base o sin las
		// migraciones de perfiles, 0 (no aparece).
		profiles: countProfilesToReviewQuery(),
		// Más los pedidos "Es mi perfil" pendientes (docs/amigues.md). 0 sin la migración 0017.
		claimCount: {
			what: 'contador de pedidos "Es mi perfil"',
			fallback: 0,
			statements: (db) => [countPendingClaimsStatement(db)],
			read: (results) => readPendingClaimsCount(rowsOf(results)[0])
		},
		// Lo no listado que hay que revisar: los borradores de la agenda (no los eventos no listados
		// a propósito), el material y los perfiles no listados.
		unlisted: unlistedQuery,
		// «Para revisar» (las mismas consultas que la primera tanda del Inicio). Ahí va también la de
		// los eventos «Online» con lugar, que además es su contador.
		...reviewQueries(now, { login: locals?.user?.login })
	});
	const { orders, profiles, claimCount, unlisted, onlineMismatch } = s1;
	if (orders) {
		counts.transfers = orders.transfers;
		counts.reviewOrders = orders.reviewOrders;
	}
	counts.profilesToReview = profiles + claimCount;
	if (unlisted !== null) counts.unlisted = unlisted;
	if (onlineMismatch !== null) counts.onlineMismatch = onlineMismatch;

	const [events, ticketedList] = await eventLists;
	const { ticketed, titles, soonTicketed, reminderEvents } = reviewEventContext({
		events,
		ticketedList,
		now
	});
	// Segunda tanda (sin sentencias si no hay eventos que vienen con entradas: no va a la base).
	const { totals, streamLinks, stuck, reminders } = await runQueries(
		db,
		reviewEventQueries({ soonTicketed, reminderEvents, settings: s1.settings, now })
	);
	const upcoming = upcomingEvents({
		events,
		ticketed,
		totals,
		checkins: new Map(),
		transfers: s1.transfers,
		review: s1.review,
		streamLinks,
		reminders,
		stuck,
		now,
		skip: skipReviewEvent
	});
	// Botón global «Para revisar»: las filas de la tarjeta del Inicio, armadas igual.
	counts.review = reviewCount(
		reviewRows({ ...s1, ...(await outside), upcoming, ticketed, titles, now })
	);
	return counts;
}

/**
 * Transferencias esperando comprobante y todavía vigentes, y órdenes marcadas "para revisar"
 * (pago tarde que pasó el cupo, posible cobro doble): una sola consulta, cada cuenta por su índice
 * (`orders_status_created` y `orders_needs_review`). Con `SUM(CASE …)` y un `OR`, SQLite recorría
 * toda la tabla.
 *
 * @param {number} now
 * @returns {import('$lib/server/db/batch.js').BatchQuery<{ transfers: number, reviewOrders: number } | null>}
 */
function panelOrderCountsQuery(now) {
	return {
		what: 'contadores de órdenes del panel',
		fallback: null,
		statements: (db) => [
			db
				.prepare(
					`SELECT
						(SELECT COUNT(*) FROM orders WHERE status = 'awaiting_transfer' AND expires_at > ?1) AS transfers,
						(SELECT COUNT(*) FROM orders WHERE needs_review IS NOT NULL) AS review`
				)
				.bind(now)
		],
		read: (results) => {
			const row = rowsOf(results)[0];
			return { transfers: Number(row?.transfers ?? 0), reviewOrders: Number(row?.review ?? 0) };
		}
	};
}
