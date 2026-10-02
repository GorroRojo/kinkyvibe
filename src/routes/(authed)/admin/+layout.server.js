import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { panelCounts } from '$lib/server/admin/panelCounts.js';
import { borrarDesdePanelEnabled, isFlagOn } from '$lib/server/flags.js';
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
