import { requireAdmin } from '$lib/server/auth';
import { isOrganizerRequest } from '$lib/server/admin/organizadore.js';
import { getDB } from '$lib/server/db';
import { panelCounts } from '$lib/server/admin/panelCounts.js';
import { isFlagOn } from '$lib/server/flags.js';
import { navFlagKeys } from '$lib/admin/nav.js';

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
	// `untrack` para que los contadores no se recalculen en cada cambio de página (sí después de
	// cada acción del panel, que vuelve a pedir los datos: el número de «Para revisar» se actualiza).
	// Une organizadore (organizadore.js): un marco aparte, sin menú, buscador ni contadores del
	// sitio; solo sus eventos.
	const organizer = untrack(() => (isOrganizerRequest(locals) ? locals.organizer : null));
	if (organizer) {
		return {
			panelCounts: /** @type {Record<string, number>} */ ({}),
			navFlags: /** @type {Record<string, boolean>} */ ({}),
			organizer: {
				name: organizer.name,
				events: organizer.events.map((e) => ({ slug: e.slug, title: e.title }))
			}
		};
	}
	untrack(() => requireAdmin(locals, url));
	const [counts, flags] = await Promise.all([
		panelCounts(platform, Date.now(), { locals }),
		navFlags(platform)
	]);
	return { panelCounts: counts, navFlags: flags, organizer: null };
}
