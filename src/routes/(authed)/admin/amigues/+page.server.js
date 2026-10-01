import { listLoad, visibilityAction } from '$lib/server/admin/contentRoutes.js';
import { requireAdmin } from '$lib/server/auth';
import { dbMode } from '$lib/server/admin/amiguesRoutes.js';
import { PROFILE_KIND_FILTERS, listProfiles } from '$lib/server/admin/cuentas.js';
import { importedLegacySlugs } from '$lib/server/amigues/profiles.js';
import { bundledAmigueFiles } from '$lib/server/amigues/review.js';
import { isImportable } from '$lib/server/amigues/importer.js';

const mdLoad = listLoad('amigues');

/**
 * Contenido → Amigues. Con el interruptor `perfiles_publicos` prendido, los perfiles de la base
 * (personas, proyectos y lugares, con el filtro `?tipo=`; también ocultos y sin aprobar) y cuántas
 * fichas .md faltan importar. Apagado, la lista de fichas .md de siempre.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	const db = await dbMode(event.platform);
	if (!db) return { editor: /** @type {const} */ ('md'), ...(await mdLoad(event)) };
	const raw = event.url.searchParams.get('tipo') ?? '';
	const kind = raw in PROFILE_KIND_FILTERS ? raw : '';
	const q = (event.url.searchParams.get('q') ?? '').slice(0, 200);
	const [{ profiles }, imported, files] = await Promise.all([
		listProfiles(db, { kind, q }),
		importedLegacySlugs(db),
		bundledAmigueFiles()
	]);
	return {
		editor: /** @type {const} */ ('db'),
		profiles: profiles.filter((p) => !p.deletedAt),
		kinds: PROFILE_KIND_FILTERS,
		kind,
		q,
		notImported: files.filter((f) => isImportable(f.legacySlug) && !imported.has(f.legacySlug))
			.length
	};
}

/** @type {import('./$types').Actions} */
export const actions = { visibilidad: visibilityAction('amigues') };
