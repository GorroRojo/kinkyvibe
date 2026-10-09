/**
 * Contadores del menú del panel, para el layout de /admin (`+layout.server.js`).
 */
import { getDB } from '$lib/server/db';
import { rowsOf, runQueries } from '$lib/server/db/batch.js';
import { countProfilesToReviewQuery } from '$lib/server/admin/cuentas.js';
import { countPendingClaimsStatement, readPendingClaimsCount } from '$lib/server/amigues/claims.js';
import { unlistedCountQuery } from '$lib/server/contenido/posts.js';
import { onlineMismatchCountQuery } from '$lib/server/admin/inicio.js';

/**
 * Contadores del menú del panel (`data.panelCounts`, las claves que usa `counter` en
 * `$lib/admin/nav.js`). Tienen que ser baratos y nunca romper la página: sin base de datos o con
 * un error, el contador simplemente no aparece. Todos salen en una sola ida a la base (una tanda,
 * ver $lib/server/db/batch.js).
 *
 * @param {App.Platform | undefined} platform
 * @param {number} [now]
 * @returns {Promise<Record<string, number>>}
 */
export async function panelCounts(platform, now = Date.now()) {
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
	const { orders, profiles, claims, unlisted, onlineMismatch } = await runQueries(db, {
		orders: panelOrderCountsQuery(now),
		// Perfiles creados por cuentas que ninguna admin revisó (Perfiles). Sin la base o sin las
		// migraciones de perfiles, 0 (no aparece).
		profiles: countProfilesToReviewQuery(),
		// Más los pedidos "Es mi perfil" pendientes (docs/amigues.md). 0 sin la migración 0017.
		claims: {
			what: 'contador de pedidos "Es mi perfil"',
			fallback: 0,
			statements: (db) => [countPendingClaimsStatement(db)],
			read: (results) => readPendingClaimsCount(rowsOf(results)[0])
		},
		// Lo no listado que hay que revisar: los borradores de la agenda (no los eventos no listados
		// a propósito), el material y los perfiles no listados.
		unlisted: unlistedQuery,
		// Eventos con la etiqueta «Online» y además un lugar, los que vienen y los del último mes
		// (una fila de «Para revisar» en el Inicio). null si falla: no suma.
		onlineMismatch: onlineMismatchCountQuery(now)
	});
	if (orders) {
		counts.transfers = orders.transfers;
		counts.reviewOrders = orders.reviewOrders;
	}
	counts.profilesToReview = profiles + claims;
	if (unlisted !== null) counts.unlisted = unlisted;
	if (onlineMismatch !== null) counts.onlineMismatch = onlineMismatch;
	// Botón global "Para revisar": lo pendiente que se cuenta barato (transferencias, órdenes para
	// revisar, perfiles y pedidos "Es mi perfil", eventos «Online» con lugar). La tarjeta del Inicio puede listar algo más
	// (mails sin mandar, recordatorios que fallaron…) como avisos, pero el número que muestra el
	// Inicio es este mismo (`reviewCountOf` en $lib/admin/nav.js).
	counts.review =
		(counts.transfers ?? 0) +
		(counts.reviewOrders ?? 0) +
		(counts.profilesToReview ?? 0) +
		(counts.onlineMismatch ?? 0);
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
