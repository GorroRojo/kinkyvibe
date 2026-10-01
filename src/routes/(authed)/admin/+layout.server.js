import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { countProfilesToReview } from '$lib/server/admin/cuentas.js';
import { countPendingClaims } from '$lib/server/amigues/claims.js';
import { fetchMarkdownPosts } from '$lib/utils';
import { borrarDesdePanelEnabled, isFlagOn } from '$lib/server/flags.js';
import { navFlagKeys } from '$lib/admin/nav.js';

/**
 * Contadores del menú del panel (`data.panelCounts`, las claves que usa `counter` en
 * `$lib/admin/nav.js`). Tienen que ser consultas baratas y nunca romper la página: sin base de
 * datos o con un error, el contador simplemente no aparece.
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<Record<string, number>>}
 */
async function panelCounts(platform) {
	/** @type {Record<string, number>} */
	const counts = {};
	const db = getDB(platform);
	const tasks = [
		(async () => {
			if (!db) return;
			try {
				// Transferencias esperando comprobante y todavía vigentes.
				const row = await db
					.prepare(
						"SELECT COUNT(*) AS n FROM orders WHERE status = 'awaiting_transfer' AND expires_at > ?"
					)
					.bind(Date.now())
					.first();
				counts.transfers = Number(row?.n ?? 0);
			} catch (error) {
				logDBError('contador de transferencias del panel', error);
			}
		})(),
		(async () => {
			if (!db) return;
			try {
				// Órdenes marcadas "para revisar" (pago tarde que pasó el cupo, posible cobro doble).
				const row = await db
					.prepare('SELECT COUNT(*) AS n FROM orders WHERE needs_review IS NOT NULL')
					.first();
				counts.reviewOrders = Number(row?.n ?? 0);
			} catch (error) {
				logDBError('contador de órdenes para revisar del panel', error);
			}
		})(),
		(async () => {
			// Perfiles creados por cuentas que ninguna admin revisó (Cuentas → Perfiles). Sin la
			// base o sin las migraciones de perfiles, 0 (no aparece).
			// Más los pedidos "Es mi perfil" pendientes (docs/amigues.md).
			const [review, claims] = await Promise.all([
				countProfilesToReview(db),
				countPendingClaims(db)
			]);
			counts.profilesToReview = review + claims;
		})(),
		(async () => {
			try {
				// Publicaciones no listadas (borradores). Cacheado por instancia fuera de dev.
				counts.unlisted = (await fetchMarkdownPosts(false, true)).length;
			} catch (error) {
				console.error('[admin] contador de no listadas:', error);
			}
		})()
	];
	await Promise.all(tasks);
	// Botón global "Para revisar": lo pendiente que se cuenta barato (transferencias, órdenes para
	// revisar, perfiles y pedidos "Es mi perfil"). La tarjeta del Inicio puede listar algo más
	// (mails sin mandar, recordatorios que fallaron…).
	counts.review =
		(counts.transfers ?? 0) + (counts.reviewOrders ?? 0) + (counts.profilesToReview ?? 0);
	return counts;
}

/**
 * Estado de los interruptores que usa el menú (`flag` en `$lib/admin/nav.js`): apagado, la
 * sección se ve "en prueba" o no se ve. Con caché (ver flags.js).
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<Record<string, boolean>>}
 */
async function navFlags(platform) {
	const db = getDB(platform);
	const keys = navFlagKeys();
	const values = await Promise.all(
		keys.map((key) => isFlagOn(db, /** @type {import('$lib/server/flags.js').FlagKey} */ (key)))
	);
	return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
}

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, url, platform, untrack }) {
	// El layout de (authed) ya controla, pero los loads corren en paralelo: se controla acá también.
	// `untrack` para que los contadores no se recalculen en cada cambio de página.
	untrack(() => requireAdmin(locals, url));
	const [counts, borrar, flags] = await Promise.all([
		panelCounts(platform),
		borrarDesdePanelEnabled(platform),
		navFlags(platform)
	]);
	// `borrarDesdePanel`: interruptor del botón "Borrar" (DeleteLink.svelte lo lee de acá).
	return { panelCounts: counts, borrarDesdePanel: borrar, navFlags: flags };
}
