/**
 * Página de compra de entradas de un evento: /calendario/<slug>/entradas. Está separada de la
 * página del evento para que el formulario no empuje hacia abajo el texto del evento; la página
 * del evento muestra un botón "Comprar entradas" que trae acá.
 *
 * Los precios, cupos y medios de pago salen del servidor (`getTicketsView`, frontmatter + D1) y
 * las form actions vuelven a validar todo (ver $lib/server/tickets/checkout.js).
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { buyAction, discountAction, getTicketsView } from '$lib/server/tickets/checkout.js';
import { siteEvent } from '$lib/server/contenido/posts.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, fetch, locals }) {
	if (!isValidEventSlug(params.event)) error(404, 'Ese evento no existe.');
	// Interruptor `contenido_db`: el encabezado sale del evento de la base (si la tiene). La
	// configuración de las entradas sigue saliendo del .md (getTicketsView).
	const found = await siteEvent(platform, params.event, {
		viewer: viewerFor(locals),
		shallow: true,
		html: false
	});
	if (found.mode === 'db' && !found.post) error(404, 'Ese evento no existe.');
	const tickets = await getTicketsView(getDB(platform), params.event, fetch);
	if (!tickets) error(404, 'Este evento no vende entradas por acá.');
	const db = found.mode === 'db' ? found.post : null;
	return { tickets, event: db ? { meta: db.meta, path: db.path } : null };
}

/** @type {import('./$types').Actions} */
export const actions = {
	buy: (event) => buyAction(event),
	discount: (event) => discountAction(event)
};
