/**
 * GET /api/gancho/formularios/<dirección>/respuestas: las respuestas de un formulario con «Foto»
 * para gancho.kinkyvibe.ar, con el header `x-gancho-secret` (docs/gancho-api.md). La lógica está
 * en $lib/server/gancho/api.js; esta ruta solo junta el secreto y la base.
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { handleGanchoResponses } from '$lib/server/gancho/api.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request, params, platform }) {
	return handleGanchoResponses({
		request,
		secret: env.GANCHO_SECRET,
		db: getDB(platform),
		slug: params.slug
	});
}
