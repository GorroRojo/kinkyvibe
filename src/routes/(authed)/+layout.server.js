import { requireAdmin } from '$lib/server/auth';
import { siteTagDetails } from '$lib/server/etiquetas/source.js';
/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, url, platform }) {
	requireAdmin(locals, url);
	return {
		currentRoute: url.pathname,
		// El panel ve el árbol de etiquetas completo, como antes: el layout raíz manda el liviano y
		// esto le suma las descripciones, relacionadas e imágenes ($lib/utils/tagDetails.js).
		siteTagDetails: await siteTagDetails(platform)
	};
}
