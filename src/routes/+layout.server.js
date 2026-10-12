import { siteWikiPosts } from '$lib/server/wiki/site.js';
import { isAdmin } from '$lib/server/auth';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import { siteTagSource } from '$lib/server/etiquetas/source.js';
import { getDB, logDBError } from '$lib/server/db';
import { getReadingSpeed } from '$lib/server/cuentas/accounts.js';

/**
 * La velocidad de lectura guardada en la cuenta de la sesión, o `null` (sin cuenta, sin elegir o
 * con un error: entonces vale la del navegador o la de siempre). $lib/utils/readingSpeed.js.
 * @param {App.Platform | undefined} platform
 * @param {App.Locals['member']} member
 */
async function memberReadingSpeed(platform, member) {
	const db = member && getDB(platform);
	if (!db || !member) return null;
	try {
		return await getReadingSpeed(db, member.id);
	} catch (e) {
		logDBError('cuentas: velocidad de lectura', e);
		return null;
	}
}
/** @type {import("./$types").LayoutServerLoad} */
// Don't read `url` here: SvelteKit would then re-run this load whenever the query string
// changes, e.g. on each PostList search update.
export const load = async ({ locals, platform }) => {
	// Las páginas de la wiki (el glosario): de la base, con el árbol de etiquetas (una lectura).
	const [wiki, tags, readingSpeed] = await Promise.all([
		siteWikiPosts(platform),
		siteTagSource(platform),
		memberReadingSpeed(platform, locals.member)
	]);
	return {
		wiki,
		// `admin` only decides which menu links to show; every admin route checks on its own.
		user: locals.user && { ...locals.user, admin: isAdmin(locals.user) },
		// Preview deploys: demo mode (docs/demo.md): "Entrar como admin de prueba" and the banner.
		demoMode: isPreviewDeploy(),
		// Cuentas del público (docs/cuentas.md): el link "Ingresar"/"Mi rincón" del encabezado.
		// `member` es solo sí/no: el mail no viaja en cada página.
		member: Boolean(locals.member),
		// La velocidad de lectura de la cuenta (palabras por minuto, o null): gana sobre la del
		// navegador ($lib/utils/readingSpeed.js, +layout.svelte de (content)).
		readingSpeed,
		// El árbol de etiquetas de la base (docs/etiquetas.md), para los stores de las páginas
		// (+layout.svelte). Sin etiquetas en la base: null, y todo usa el archivo de respaldo.
		siteTags: tags.fromDb ? tags.rawTags : null
	};
};
