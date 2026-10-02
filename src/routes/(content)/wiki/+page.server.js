/**
 * La Kinkipedia: con el interruptor `series` prendido, también la lista de series (cada una con
 * su imagen, su descripción y la próxima edición), que linkea a la página de cada serie. Apagado,
 * `series` viene vacía y la página queda como siempre.
 */
import { seriesEnabled } from '$lib/server/flags.js';
import { seriesSummaries } from '$lib/server/series/index.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform }) {
	if (!(await seriesEnabled(platform))) return { series: [] };
	return { series: await seriesSummaries({ tags: await siteTagManager(platform), platform }) };
}
