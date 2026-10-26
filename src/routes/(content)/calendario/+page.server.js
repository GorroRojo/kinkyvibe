import { sitePosts } from '$lib/server/contenido/posts.js';
import { currentMonth, isCalendarMonth, isCurrent } from '$lib/utils/allPosts';
import { getDB } from '$lib/server/db';
import { askVenuePlacesEarly, withVenuePlaces } from '$lib/server/amigues/venues.js';
import { askTicketStatesEarly, ticketStatesFor } from '$lib/server/tickets/listStates.js';
import {
	askPartLabelsEarly,
	firstEventMonth,
	isPastIn,
	partLabelsOrNone,
	slimPastMeta
} from '$lib/server/eventos/pasados.js';
import { withPartLabel } from '$lib/utils/partes.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform, url, untrack }) {
	const now = Date.now();
	// De los pasados, solo los del mes que se abre (con solo lo que usa la grilla): los de otro mes
	// los pide la página a /api/calendario/pasados al ir a ese mes (docs/seo.md). `untrack`: cambiar
	// de mes no vuelve a correr esto (las pruebas llaman sin él).
	const asked = (untrack ?? ((fn) => fn()))(() => url.searchParams.get('viewdate'));
	const pastMonth = isCalendarMonth(asked) ? asked : currentMonth(now);
	// La venta, los lugares y las etiquetas «Parte N de M» de las tarjetas, a la par de la lista (con
	// lo que ya tiene el isolate).
	askTicketStatesEarly(platform);
	askVenuePlacesEarly(getDB(platform));
	askPartLabelsEarly(getDB(platform));
	const posts = (await sitePosts(platform)).filter((p) => p.meta.layout == 'calendario');
	// A la par (cada consulta a la base es una vuelta).
	const [withVenues, ticketStates, partLabels] = await Promise.all([
		// Un lugar vinculado manda sobre el «Dónde» del .md (los pasados ya van sin él).
		withVenuePlaces(
			getDB(platform),
			posts.filter((p) => isCurrent(p, now))
		),
		// «Comprar entradas» / «Agotadas» en las tarjetas: todos los eventos en una consulta.
		ticketStatesFor(platform, posts),
		// Talleres en varias partes: «Parte N de M» en cada parte (docs/talleres-partes.md).
		partLabelsOrNone(getDB(platform))
	]);
	const current = new Map(withVenues.map((p) => [p.path, p]));
	return {
		posts: posts
			.flatMap((p) => {
				const full = current.get(p.path);
				if (full) return [full];
				if (!isPastIn(p, pastMonth, now)) return [];
				return [/** @type {ProcessedPost} */ ({ ...p, meta: slimPastMeta(p.meta) })];
			})
			.map((p) => withPartLabel(p, partLabels)),
		// El mes de los pasados que vinieron (los de los demás, a pedido).
		pastMonth,
		// El mes del evento más viejo: hasta ahí llega «Mostrar el mes anterior».
		firstMonth: firstEventMonth(posts),
		ticketStates,
		// Link a la lista de series de la Kinkipedia (/wiki#series): las series ya no tienen
		// interruptor.
		seriesLink: true
	};
}
