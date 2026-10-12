/**
 * Ajustes: la portada (decisión 0041). Una tarjeta por sección, en sus cuatro subgrupos (Plata,
 * Comunicación, Equipo, Sistema, de `$lib/admin/nav.js`), cada una con su línea de estado
 * ($lib/server/admin/ajustesStatus.js: una tanda a la base y lo de Automatizaciones). Solo admins.
 */
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { loadAjustesStatus } from '$lib/server/admin/ajustesStatus.js';
import { isMpMock } from '$lib/server/tickets/index.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	return {
		status: await loadAjustesStatus({
			db,
			env,
			// Como el checkout: Mercado Pago se ofrece con su token (o con el de prueba, en `vite dev`).
			mpReady: Boolean(env.MP_ACCESS_TOKEN) || isMpMock()
		})
	};
}
