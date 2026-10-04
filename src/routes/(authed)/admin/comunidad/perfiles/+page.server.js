/**
 * Comunidad › Perfiles: la única lista de perfiles del panel (decisión de gorrite del 1/10; antes
 * eran "Amigues" y "Cuentas › Perfiles"). Todos los perfiles de la base (personas, proyectos y
 * lugares; también ocultos y borrados), con filtros en la URL (`?q=`, `?tipo=`, `?origen=`,
 * `?estado=`; ver src/lib/admin/perfiles.js), cuántas fichas .md faltan importar y los pedidos
 * "Es mi perfil" (`?vista=pedidos`). Solo la base («solo base»: las fichas .md ya no se muestran ni
 * se editan; las que faltan se importan en «Importar y clasificar»). Sin base, la lista vacía con
 * el aviso. Solo admins: el `load` y cada action llaman a `requireAdmin`.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { claimDecisionAction } from '$lib/server/admin/amiguesRoutes.js';
import { listProfiles } from '$lib/server/admin/cuentas.js';
import { listClaims } from '$lib/server/amigues/claims.js';
import { importedLegacySlugs } from '$lib/server/amigues/profiles.js';
import { bundledAmigueFiles } from '$lib/server/amigues/review.js';
import { isImportable } from '$lib/server/amigues/importer.js';
import { parseProfileFilters } from '$lib/admin/perfiles.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	// Lleva los mails de quienes gestionan cada perfil.
	event.setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const db = getDB(event.platform);
	const filters = parseProfileFilters(event.url.searchParams);
	const view = filters.view === 'fichas' ? '' : filters.view;
	const empty = {
		editor: /** @type {const} */ ('db'),
		dbAvailable: false,
		filters: { ...filters, view },
		profiles: /** @type {Awaited<ReturnType<typeof listProfiles>>['profiles']} */ ([]),
		counts: { total: 0, toReview: 0, toApprove: 0, hidden: 0, deleted: 0 },
		claims: /** @type {Awaited<ReturnType<typeof listClaims>>} */ ([]),
		notImported: 0
	};
	if (!db) return empty;
	try {
		const [{ profiles, counts }, claims, imported, files] = await Promise.all([
			listProfiles(db, filters),
			listClaims(db).catch((error) => {
				logDBError('panel: pedidos de perfiles', error);
				return [];
			}),
			importedLegacySlugs(db),
			bundledAmigueFiles()
		]);
		return {
			...empty,
			dbAvailable: true,
			profiles,
			counts,
			claims,
			notImported: files.filter((f) => isImportable(f.legacySlug) && !imported.has(f.legacySlug))
				.length
		};
	} catch (error) {
		logDBError('panel: perfiles', error);
		return empty;
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Aprobar o rechazar un pedido "Es mi perfil".
	pedido: claimDecisionAction
};
