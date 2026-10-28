/**
 * POST /api/fondo/mi-link: el mail «tu link» del Fondo KinkyVibe, pedido por fondo.kinkyvibe.ar
 * con el header `x-fondo-secret` (docs/mails.md, «Mail del Fondo (tu link)»). La lógica está en
 * $lib/server/fondo/miLink.js; esta ruta solo junta el secreto, la base y el envío.
 *
 * Es un pedido de servidor a servidor en JSON: el chequeo de origen de SvelteKit solo frena los
 * formularios (form-urlencoded, multipart, text/plain) de otro origen, así que no hace falta
 * ninguna excepción. Sin headers CORS: un navegador de otro sitio no puede mandarlo.
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { deliverEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { handleMiLink } from '$lib/server/fondo/miLink.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform, url, fetch }) {
	const db = getDB(platform);
	return handleMiLink({
		request,
		secret: env.FONDO_MAIL_SECRET,
		db,
		origin: siteOrigin(url),
		send: ({ to, message, from }) => deliverEmail({ db, fetch, to, message, from, kind: 'fondo' })
	});
}
