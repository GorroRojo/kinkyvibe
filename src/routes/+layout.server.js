import { siteWikiPosts } from '$lib/server/wiki/site.js';
import { isAdmin } from '$lib/server/auth';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import { siteTagSource } from '$lib/server/etiquetas/source.js';
/** @type {import("./$types").LayoutServerLoad} */
// Don't read `url` here: SvelteKit would then re-run this load whenever the query string
// changes, e.g. on each PostList search update.
export const load = async ({ locals, platform }) => {
	// Las páginas de la wiki (el glosario): de la base, con el árbol de etiquetas (una lectura).
	const [wiki, tags] = await Promise.all([siteWikiPosts(platform), siteTagSource(platform)]);
	return {
		wiki,
		// `admin` only decides which menu links to show; every admin route checks on its own.
		user: locals.user && { ...locals.user, admin: isAdmin(locals.user) },
		// Preview deploys: demo mode (docs/demo.md): "Entrar como admin de prueba" and the banner.
		demoMode: isPreviewDeploy(),
		// Cuentas del público (docs/cuentas.md): el link "Ingresar"/"Mi rincón" del encabezado.
		// `member` es solo sí/no: el mail no viaja en cada página.
		member: Boolean(locals.member),
		// El árbol de etiquetas de la base (docs/etiquetas.md), para los stores de las páginas
		// (+layout.svelte). Sin etiquetas en la base: null, y todo usa el archivo de respaldo.
		siteTags: tags.fromDb ? tags.rawTags : null
	};
};
