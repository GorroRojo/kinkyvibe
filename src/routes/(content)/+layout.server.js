import { linkPreviewData } from '$lib/server/linkPreview.js';

/**
 * La vista previa al compartir de las páginas públicas (docs/compartir.md): los textos del panel y
 * la dirección de cada tarjeta dibujada con las portadas. Recordado unos segundos por isolate
 * (src/lib/server/linkPreview.js). No lee `url`: si lo leyera, se volvería a correr con cada
 * cambio de filtros de las listas.
 * @type {import('./$types').LayoutServerLoad}
 */
export async function load({ platform }) {
	return { linkPreview: await linkPreviewData(platform) };
}
