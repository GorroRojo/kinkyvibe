/**
 * GET /api/series/<etiqueta>: lo de series de la página de una etiqueta (seriesTagInfo en
 * $lib/server/series/web.js): si la etiqueta es una serie, su imagen y sus ediciones (próximas
 * primero, después las pasadas); si tiene eventos, el link de su calendario .ics; y si hay una
 * cuenta con sesión, si ya está suscripta a los avisos (y si eso va por «Lo que sigo»). La página
 * /wiki/<etiqueta> ya lo trae con la carga; esto queda para quien lo pida aparte.
 *
 * Apagado: 404 (la página sigue como siempre). Sin datos de nadie: solo contenido público.
 */
import { error, json } from '@sveltejs/kit';
import { seriesTagInfo } from '$lib/server/series/web.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, locals }) {
	const info = await seriesTagInfo(platform, locals, params.tag);
	if (!info) error(404, 'Not found');
	return json(info, { headers: { 'cache-control': 'private, no-store' } });
}
