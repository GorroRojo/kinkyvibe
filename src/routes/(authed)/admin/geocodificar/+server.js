import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { geocodeVenue } from '$lib/server/geocode/nominatim.js';

const NOT_FOUND = 'No encontramos esa dirección. Probá agregando la ciudad o el barrio.';

/**
 * «Buscar en el mapa» del editor de lugares (src/lib/server/geocode/nominatim.js).
 * `POST /admin/geocodificar` con `{ address, area, city }` → `{ results: [{ lat, lng, label }] }`
 * o `{ error }` con un mensaje para mostrar. Solo admins; va por POST para que la dirección no
 * quede en URLs ni en registros. No guarda nada en el lugar: eso lo hace el formulario.
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, url, request, platform, fetch }) {
	requireAdmin(locals, url);
	const headers = { 'cache-control': 'private, no-store' };

	/** @type {Record<string, unknown>} */
	let body = {};
	try {
		const parsed = await request.json();
		if (parsed && typeof parsed === 'object') body = parsed;
	} catch {
		// cuerpo vacío o roto: se trata como dirección vacía
	}

	let outcome;
	try {
		outcome = await geocodeVenue(
			{ address: body.address, area: body.area, city: body.city },
			{ db: getDB(platform), fetch }
		);
	} catch (error) {
		logDBError('buscar en el mapa', error);
		outcome = /** @type {const} */ ({ ok: false, reason: 'unavailable' });
	}

	if (outcome.ok) {
		if (!outcome.results.length) return json({ results: [], error: NOT_FOUND }, { headers });
		return json({ results: outcome.results }, { headers });
	}
	if (outcome.reason === 'empty-query') {
		return json({ results: [], error: 'Escribí la dirección primero.' }, { status: 400, headers });
	}
	if (outcome.reason === 'rate-limited') {
		return json(
			{ results: [], error: 'Hubo otra búsqueda recién. Esperá un segundo y probá de nuevo.' },
			{ status: 429, headers: { ...headers, 'retry-after': String(outcome.retryAfter ?? 1) } }
		);
	}
	return json(
		{
			results: [],
			error: 'No pudimos buscar en el mapa ahora. Probá en un rato o cargá los números a mano.'
		},
		{ status: 503, headers }
	);
}
