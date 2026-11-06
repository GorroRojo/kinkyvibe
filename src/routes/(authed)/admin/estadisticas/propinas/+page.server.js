/**
 * Propinas (docs/propinas.md): total (y por destino), por mes, por publicación y la lista, con
 * CSV. Solo admins. `?destino=kinkyvibe|fondo` filtra la lista (cualquier otro valor, todas).
 *
 * Con el interruptor `paypal` prendido, además el reparto por mes del Fondo (decisión 0054):
 * Mercado Pago en pesos, PayPal en dólares netos y en pesos estimados. La cotización, el ajuste y
 * los retiros se cambian en Ajustes › PayPal (`/admin/ajustes/paypal`).
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { paypalEnabled } from '$lib/server/flags.js';
import { listTips, tipSummary } from '$lib/server/propinas/index.js';
import { loadPaypalPanel } from '$lib/server/paypal/index.js';
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
	const paypal = db && (await paypalEnabled(platform)) ? await loadPaypalPanel(db) : null;
	return {
		dbAvailable: Boolean(db),
		summary,
		tips,
		destination,
		paypal
	};
}
