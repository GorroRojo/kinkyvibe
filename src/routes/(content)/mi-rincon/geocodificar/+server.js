/**
 * «Buscar en el mapa» del editor de un lugar en Mi rincón (/mi-rincon/perfiles/[slug]): lo mismo
 * que `POST /admin/geocodificar`, para las cuentas. `{ address, area, city }` →
 * `{ results: [{ lat, lng, label }] }` o `{ results: [], error }` (src/lib/server/geocode/web.js).
 * Va por POST para que la dirección no quede en URLs. No guarda nada: eso lo hace el formulario.
 *
 * Quién: una cuenta con sesión que gestiona al menos un lugar (así no sirve de buscador gratis
 * para cualquier cuenta). Sin sesión, 401; sin lugar, 403. Las respuestas son JSON (el botón las
 * muestra), no redirects.
 *
 * Límites: el de la cuenta (`ACCOUNT_GEOCODE_RATE_LIMIT`, 10 cada 10 minutos, se cuenta antes de
 * buscar) y el de todo el sitio (un pedido por segundo a Nominatim, `NOMINATIM_RATE_LIMIT`).
 */
import { getDB } from '$lib/server/db';
import { listMyProfiles } from '$lib/server/cuentas/perfiles.js';
import { buildGeocodeQuery } from '$lib/server/geocode/nominatim.js';
import {
	GEOCODE_MESSAGES,
	accountGeocodeAllowed,
	geocodeError,
	geocodeResponse,
	readGeocodeInput
} from '$lib/server/geocode/web.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request, platform, fetch }) {
	const member = locals.member;
	if (!member) return geocodeError(401, GEOCODE_MESSAGES.noSession);
	const db = getDB(platform);
	if (!db) return geocodeError(503, GEOCODE_MESSAGES.unavailable);

	// Gestiona al menos un lugar (con el permiso de perfiles: listMyProfiles ya lo exige).
	const profiles = await listMyProfiles(db, member.id);
	if (!profiles.some((p) => p.kind === 'lugar')) return geocodeError(403, GEOCODE_MESSAGES.noVenue);

	const input = await readGeocodeInput(request);
	// Sin dirección no se busca ni se gasta una búsqueda de la cuenta.
	if (!buildGeocodeQuery(input)) return geocodeError(400, GEOCODE_MESSAGES.emptyQuery);

	const limit = await accountGeocodeAllowed(db, member.id);
	if (!limit.allowed) {
		return geocodeError(429, GEOCODE_MESSAGES.accountRateLimited, {
			'retry-after': String(limit.retryAfter)
		});
	}
	return geocodeResponse(input, { db, fetch });
}
