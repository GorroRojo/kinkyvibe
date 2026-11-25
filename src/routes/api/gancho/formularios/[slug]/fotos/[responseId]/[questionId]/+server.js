/**
 * GET /api/gancho/formularios/<dirección>/fotos/<respuesta>/<pregunta>: la foto de una respuesta
 * para gancho.kinkyvibe.ar, con el header `x-gancho-secret` (docs/gancho-api.md): los bytes, con
 * su tipo y `cache-control: private, no-store`. La lógica está en $lib/server/gancho/api.js.
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { handleGanchoPhoto } from '$lib/server/gancho/api.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request, params, platform }) {
	return handleGanchoPhoto({
		request,
		secret: env.GANCHO_SECRET,
		db: getDB(platform),
		bucket: platform?.env?.MEDIA,
		slug: params.slug,
		responseId: params.responseId,
		questionId: params.questionId
	});
}
