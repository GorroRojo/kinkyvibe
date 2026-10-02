import { sitePosts } from '$lib/server/contenido/posts.js';
import { requireAdmin } from '$lib/server/auth';
import { unlistedRows } from '$lib/admin/unlisted.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform }) {
	// Server loads run in parallel with the layout load, so guard here too.
	requireAdmin(locals, url);
	// Con `contenido_db` prendido, los eventos no listados de la base. Solo las filas de la lista
	// del panel (no las publicaciones enteras ni las tarjetas del sitio).
	const rows = unlistedRows(await sitePosts(platform, false, true));
	return { rows };
}
