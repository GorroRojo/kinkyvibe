/**
 * Propinas (docs/propinas.md): total (y por destino), por mes, por publicación y la lista, con
 * CSV. Solo admins. `?destino=kinkyvibe|fondo` filtra la lista (cualquier otro valor, todas).
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { propinasEnabled } from '$lib/server/flags.js';
import { listTips, tipSummary } from '$lib/server/propinas/index.js';
import { TIP_DESTINATIONS } from '$lib/utils/propinas.js';

/**
 * El filtro de destino de la URL, solo si es uno conocido.
 * @param {URL} url
 * @returns {import('$lib/utils/propinas.js').TipDestination | null}
 */
function destinationFilter(url) {
	const d = url.searchParams.get('destino');
	return /** @type {readonly (string | null)[]} */ (TIP_DESTINATIONS).includes(d)
		? /** @type {import('$lib/utils/propinas.js').TipDestination} */ (d)
		: null;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const destination = destinationFilter(url);
	/** @type {Awaited<ReturnType<typeof tipSummary>> | null} */
	let summary = null;
	/** @type {Awaited<ReturnType<typeof listTips>>} */
	let tips = [];
	if (db) {
		try {
			[summary, tips] = await Promise.all([tipSummary(db), listTips(db, { destination })]);
		} catch (error) {
			// Sin las migraciones 0019/0022 todavía: la página se ve vacía, no rota.
			logDBError('list tips', error);
		}
	}
	return {
		dbAvailable: Boolean(db),
		enabled: await propinasEnabled(platform),
		summary,
		tips,
		destination
	};
}
