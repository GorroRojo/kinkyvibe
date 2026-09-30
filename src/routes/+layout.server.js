import { fetchMarkdownPosts } from '$lib/utils';
import { isAdmin } from '$lib/server/auth';
import { isPreviewDeploy } from '$lib/server/deploy.js';
/** @type {import("./$types").LayoutServerLoad} */
// Don't read `url` here: SvelteKit would then re-run this load whenever the query string
// changes, e.g. on each PostList search update.
export const load = async ({ locals }) => {
	let wiki = await fetchMarkdownPosts(true);
	return {
		wiki,
		// `admin` only decides which menu links to show; every admin route checks on its own.
		user: locals.user && { ...locals.user, admin: isAdmin(locals.user) },
		// Preview deploys: demo mode (docs/demo.md): "Entrar como admin de prueba" and the banner.
		demoMode: isPreviewDeploy()
	};
};
