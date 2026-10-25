/**
 * La Kinkipedia, con la lista de series (cada una con su imagen, su descripción y la próxima
 * edición), que linkea a la página de cada serie.
 */
import { seriesSummaries } from '$lib/server/series/index.js';
import { siteTagDetails, siteTagManager } from '$lib/server/etiquetas/source.js';
import { siteWikiPosts } from '$lib/server/wiki/site.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform }) {
	const [series, wiki, siteTagDetailsData] = await Promise.all([
		siteTagManager(platform).then((tags) => seriesSummaries({ tags, platform })),
		// El glosario: las páginas de la wiki y las descripciones de las etiquetas (el layout raíz
		// manda el árbol liviano: $lib/utils/tagDetails.js).
		siteWikiPosts(platform),
		siteTagDetails(platform)
	]);
	return { series, wiki, siteTagDetails: siteTagDetailsData };
}
