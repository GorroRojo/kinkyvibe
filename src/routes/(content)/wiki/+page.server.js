/**
 * La Kinkipedia, con la lista de series (cada una con su imagen, su descripción y la próxima
 * edición), que linkea a la página de cada serie.
 */
import { seriesSummaries } from '$lib/server/series/index.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform }) {
	return { series: await seriesSummaries({ tags: await siteTagManager(platform), platform }) };
}
