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
 * /amigues lee los perfiles de la base. Para que la demo no quede con solo los perfiles
 * inventados, se cargan los perfiles públicos de la semilla de contenido
 * (src/lib/server/semilla; idempotente: lo que ya está o se editó no se toca). Sin la migración
 * 0017, no hace nada.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} actor
 */
async function seedAmigues(db, actor) {
	const ready = await db
		.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'profile_sources'")
		.first();
	if (!ready) return null;
	const [{ loadSeed }, { default: amigues }] = await Promise.all([
		import('$lib/server/semilla/index.js'),
		import('$lib/server/semilla/amigues.json')
	]);
	return (await loadSeed(db, { amigues }, { actor })).amigues;
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ platform, locals }) {
	if (PREVIEW_BUILD && isPreviewDeploy()) {
		if (!isAdmin(locals.user)) error(403, 'Solo admins');
		const db = getDB(platform);
		if (!db) error(503, 'Sin base de datos');
		const { reloadDemoData, SEED_BY } = await import('$lib/server/demo/seed.js');
		try {
			// Segunda llave (además del `if` de arriba): el seed vuelve a mirar la rama del deploy. Con
			// `fetch`, copia eventos del sitio público (solo GET; docs/demo.md, «Copias de producción»).
			const result = await reloadDemoData(db, {
				where: 'preview',
				branch: __DEPLOY_BRANCH__,
				fetch
			});
			return json({ ...result, amigues: await seedAmigues(db, SEED_BY) });
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
