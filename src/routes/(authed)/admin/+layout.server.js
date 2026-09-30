import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { fetchMarkdownPosts } from '$lib/utils';

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
			try {
				// Publicaciones no listadas (borradores). Cacheado por instancia fuera de dev.
				counts.unlisted = (await fetchMarkdownPosts(false, true)).length;
			} catch (error) {
				console.error('[admin] contador de no listadas:', error);
			}
		})()
	];
	await Promise.all(tasks);
	return counts;
}

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, url, platform, untrack }) {
	// El layout de (authed) ya controla, pero los loads corren en paralelo: se controla acá también.
	// `untrack` para que los contadores no se recalculen en cada cambio de página.
	untrack(() => requireAdmin(locals, url));
	return {
		panelCounts: await panelCounts(platform)
	};
}
