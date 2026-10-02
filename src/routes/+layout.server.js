import { fetchMarkdownPosts } from '$lib/utils';
import { isAdmin } from '$lib/server/auth';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import { cuentasEnabled, propinasEnabled } from '$lib/server/flags.js';
import { siteTagSource } from '$lib/server/etiquetas/source.js';
/** @type {import("./$types").LayoutServerLoad} */
// Don't read `url` here: SvelteKit would then re-run this load whenever the query string
// changes, e.g. on each PostList search update.
export const load = async ({ locals, platform }) => {
	let wiki = await fetchMarkdownPosts(true);
	const tags = await siteTagSource(platform);
	return {
		wiki,
		// `admin` only decides which menu links to show; every admin route checks on its own.
		user: locals.user && { ...locals.user, admin: isAdmin(locals.user) },
		// Preview deploys: demo mode (docs/demo.md): "Entrar como admin de prueba" and the banner.
		demoMode: isPreviewDeploy(),
		// Cuentas del público (docs/cuentas.md): el link "Ingresar"/"Mi rincón" del encabezado, solo
		// con el interruptor prendido. `member` es solo sí/no: el mail no viaja en cada página.
		cuentas: await cuentasEnabled(platform),
		member: Boolean(locals.member),
		// Interruptor `propinas` (docs/propinas.md): el pie de página muestra "Dejá una propina" en
		// lugar de Cafecito.
		propinas: await propinasEnabled(platform),
		// Interruptor `etiquetas_db` (docs/etiquetas.md): el árbol de etiquetas de la base, para los
		// stores de las páginas (+layout.svelte). Apagado: null, y todo usa el archivo.
		siteTags: tags.fromDb ? tags.rawTags : null
	};
};
