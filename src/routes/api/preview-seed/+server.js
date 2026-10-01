/**
 * POST /api/preview-seed: borra los datos de prueba del modo demo y los vuelve a cargar con
 * fechas relativas a este momento (src/lib/server/demo/seed.js; lo usa el botón «Recargar datos
 * de prueba» del aviso del modo demo). Solo en deploys de preview y para admins: en producción
 * responde 404, y como el seed solo se importa dentro de `if (PREVIEW_BUILD)`, no está en el
 * bundle.
 */
import { error, json } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { PREVIEW_BUILD, isPreviewDeploy } from '$lib/server/deploy.js';
import { isAdmin } from '$lib/server/auth.js';

/**
 * Noche 3 (#137): con `perfiles_publicos` prendido, /amigues lee los perfiles de la base. Para
 * que la demo no quede con solo los perfiles inventados, se importan las fichas .md públicas de
 * este deploy (lo mismo que Contenido → Amigues → Importar; idempotente). Sin la migración 0017,
 * no hace nada.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} actor
 */
async function importBundledAmigues(db, actor) {
	const ready = await db
		.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'profile_sources'")
		.first();
	if (!ready) return null;
	const [{ importAmigues, summarizeImport }, { bundledAmigueFiles }] = await Promise.all([
		import('$lib/server/amigues/importer.js'),
		import('$lib/server/amigues/review.js')
	]);
	return summarizeImport(await importAmigues(db, await bundledAmigueFiles(), { actor }));
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ platform, locals }) {
	if (PREVIEW_BUILD && isPreviewDeploy()) {
		if (!isAdmin(locals.user)) error(403, 'Solo admins');
		const db = getDB(platform);
		if (!db) error(503, 'Sin base de datos');
		const [{ reloadDemoData, SEED_BY }, { bundle }] = await Promise.all([
			import('$lib/server/demo/seed.js'),
			import('$lib/server/demo/bundle.js')
		]);
		// Los eventos de prueba que trae el deploy (los de otra fecha se tapan en la capa demo).
		const bundledSlugs = [...bundle.files].flatMap((path) => {
			const m = path.match(/^src\/lib\/posts\/calendario\/(demo-[^/]+)\.md$/);
			return m ? [m[1]] : [];
		});
		try {
			const result = await reloadDemoData(db, { bundledSlugs });
			return json({ ...result, amigues: await importBundledAmigues(db, SEED_BY) });
		} catch (e) {
			console.error('[demo] no se pudieron recargar los datos de prueba:', e);
			error(
				500,
				`No se pudieron recargar los datos de prueba: ${/** @type {Error} */ (e).message}`
			);
		}
	}
	error(404, 'Not found');
}
