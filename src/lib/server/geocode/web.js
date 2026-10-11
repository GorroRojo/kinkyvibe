/**
 * Pegamento HTTP de «Buscar en el mapa» (src/lib/server/geocode/nominatim.js), compartido por los
 * dos endpoints que lo usan: `POST /admin/geocodificar` (editor de lugares del panel) y
 * `POST /mi-rincon/geocodificar` (editor de un lugar en Mi rincón). Cada endpoint decide quién
 * puede buscar; acá van el cuerpo del pedido, las respuestas con sus mensajes y el límite por
 * cuenta de Mi rincón.
 */
import { json } from '@sveltejs/kit';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';
import { geocodeVenue } from './nominatim.js';
import { logDBError } from '$lib/server/db';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ address?: unknown, area?: unknown, city?: unknown }} GeocodeInput */

/** Los mensajes que ve quien busca (castellano rioplatense). */
export const GEOCODE_MESSAGES = Object.freeze({
	notFound: 'No encontramos esa dirección. Probá agregando la ciudad o el barrio.',
	emptyQuery: 'Escribí la dirección primero.',
	rateLimited: 'Hubo otra búsqueda recién. Esperá un segundo y probá de nuevo.',
	unavailable: 'No pudimos buscar en el mapa ahora. Probá en un rato o cargá los números a mano.',
	accountRateLimited:
		'Hiciste muchas búsquedas seguidas. Esperá unos minutos y probá de nuevo, o cargá los números a mano.',
	noSession: 'Tu sesión se cerró. Volvé a ingresar para buscar en el mapa.',
	noVenue: 'Buscar en el mapa es para quienes gestionan un lugar.'
});

/**
 * Cuántas búsquedas puede hacer una cuenta de Mi rincón: 10 cada 10 minutos. Así una sola cuenta
 * no se queda con el pedido por segundo que comparte todo el sitio (`NOMINATIM_RATE_LIMIT`).
 */
export const ACCOUNT_GEOCODE_RATE_LIMIT = Object.freeze({ limit: 10, windowSeconds: 600 });

/** Sin caché en ningún lado: la respuesta tiene la dirección que se buscó. */
export const GEOCODE_HEADERS = Object.freeze({ 'cache-control': 'private, no-store' });

/**
 * El cuerpo del pedido (`{ address, area, city }`). Un cuerpo vacío o roto es una dirección
 * vacía.
 *
 * @param {Request} request
 * @returns {Promise<GeocodeInput>}
 */
export async function readGeocodeInput(request) {
	/** @type {Record<string, unknown>} */
	let body = {};
	try {
		const parsed = await request.json();
		if (parsed && typeof parsed === 'object') body = parsed;
	} catch {
		// cuerpo vacío o roto: se trata como dirección vacía
	}
	return { address: body.address, area: body.area, city: body.city };
}

/**
 * Un error para mostrar, como JSON (`{ results: [], error }`).
 *
 * @param {number} status
 * @param {string} message
 * @param {Record<string, string>} [extraHeaders]
 */
export function geocodeError(status, message, extraHeaders = {}) {
	return json(
		{ results: [], error: message },
		{ status, headers: { ...GEOCODE_HEADERS, ...extraHeaders } }
	);
}

/**
 * Busca con `geocodeVenue` (memoria de 24 h y un pedido por segundo para todo el sitio) y arma la
 * respuesta: `{ results: [{ lat, lng, label }] }` o `{ results: [], error }`.
 *
 * @param {GeocodeInput} input
 * @param {{ db: D1Database | null | undefined, fetch?: typeof fetch }} deps
 */
export async function geocodeResponse(input, deps) {
	let outcome;
	try {
		outcome = await geocodeVenue(input, deps);
	} catch (error) {
		logDBError('buscar en el mapa', error);
		outcome = /** @type {const} */ ({ ok: false, reason: 'unavailable' });
	}

	if (outcome.ok) {
		if (!outcome.results.length) {
			return json({ results: [], error: GEOCODE_MESSAGES.notFound }, { headers: GEOCODE_HEADERS });
		}
		return json({ results: outcome.results }, { headers: GEOCODE_HEADERS });
	}
	if (outcome.reason === 'empty-query') return geocodeError(400, GEOCODE_MESSAGES.emptyQuery);
	if (outcome.reason === 'rate-limited') {
		return geocodeError(429, GEOCODE_MESSAGES.rateLimited, {
			'retry-after': String(outcome.retryAfter ?? 1)
		});
	}
	return geocodeError(503, GEOCODE_MESSAGES.unavailable);
}

/**
 * Cuenta una búsqueda de una cuenta de Mi rincón en su límite propio. El bucket lleva un hash del
 * id (nunca datos identificables en `rate_limits`).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} [now]
 */
export async function accountGeocodeAllowed(db, accountId, now = Date.now()) {
	const key = await sha256Hex(`nominatim:account:${accountId}`);
	return hitRateLimit(db, `nominatim:a:${key}`, ACCOUNT_GEOCODE_RATE_LIMIT, now);
}
