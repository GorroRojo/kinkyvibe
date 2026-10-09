import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { geocodeResponse, readGeocodeInput } from '$lib/server/geocode/web.js';

/**
 * «Buscar en el mapa» del editor de lugares (src/lib/server/geocode/nominatim.js).
 * `POST /admin/geocodificar` con `{ address, area, city }` → `{ results: [{ lat, lng, label }] }`
 * o `{ error }` con un mensaje para mostrar. Solo admins; va por POST para que la dirección no
 * quede en URLs ni en registros. No guarda nada en el lugar: eso lo hace el formulario. El de las
 * cuentas es `POST /mi-rincon/geocodificar` (mismas respuestas: src/lib/server/geocode/web.js).
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, url, request, platform, fetch }) {
	requireAdmin(locals, url);
	const input = await readGeocodeInput(request);
	return geocodeResponse(input, { db: getDB(platform), fetch });
}
