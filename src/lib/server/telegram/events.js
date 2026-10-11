/**
 * De dónde saca el bot los eventos (decisión 0029). Es el ÚNICO lugar que sabe cómo se leen:
 * con `sitePosts(platform)` de `$lib/server/contenido/posts.js`, la capa compartida de contenido
 * (devuelve los eventos de la base como `ProcessedPost`). El resto del bot no sabe de dónde
 * vienen.
 *
 * Solo salen eventos públicos: nada oculto ni no listado (`sitePosts` sin `unlisted` da solo lo
 * listado y, con la base, lo que ve cualquiera sin cuenta) y nada que ya empezó. No se arman
 * consultas propias.
 *
 * La tarjeta de un evento (`eventCardInfo`) suma lo que la página pública del evento le muestra a
 * cualquiera sin cuenta, con las mismas funciones que la página: la imagen destacada, el lugar
 * (`feedVenues` + `eventPlace`, según el nivel de privacidad del lugar: nunca una dirección
 * oculta), el link al mapa solo si la página lo muestra (`googleMapsLink` / `location_map`) y el
 * estado de la venta (`ticketStatesFor` + `ticketCta`, como las tarjetas del calendario).
 */
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { feedVenues } from '$lib/server/amigues/venues.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { eventPlace } from '$lib/utils/eventPlace.js';
import { googleMapsLink } from '$lib/utils/venues.js';
import { ticketCta } from '$lib/utils/ticketCta.js';

/** @typedef {import('./format.js').BotEvent} BotEvent */

/**
 * @param {ProcessedPost[]} posts
 * @param {number} now
 * @returns {BotEvent[]}
 */
export function toUpcomingEvents(posts, now) {
	return posts
		.filter((p) => p.meta?.category === 'calendario' && p.meta?.postID)
		.filter((p) => new Date(p.meta.start).getTime() > now)
		.sort((a, b) => new Date(a.meta.start).getTime() - new Date(b.meta.start).getTime())
		.map((p) => ({
			slug: String(p.meta.postID),
			title: String(p.meta.title ?? p.meta.postID),
			start: String(p.meta.start),
			...(p.meta.end ? { end: String(p.meta.end) } : {})
		}));
}

/**
 * Los próximos eventos, del más cercano al más lejano.
 *
 * @param {App.Platform | undefined} platform
 * @param {number} [now]
 */
export async function listUpcomingEvents(platform, now = Date.now()) {
	return toUpcomingEvents(await sitePosts(platform), now);
}

/**
 * Lo público de la tarjeta, con lo ya leído. Pura (para los tests).
 *
 * @param {Record<string, any>} meta la del evento (de `sitePosts`)
 * @param {{ origin: string, venue?: import('$lib/utils/venues.js').VenueView | null,
 *   venueFailed?: boolean, states?: import('$lib/utils/ticketCta.js').TicketStates | null }} ctx
 *   `venueFailed`: no se pudo leer el lugar (entonces no va ningún lugar: mejor sin lugar que con
 *   uno que debía estar oculto, como `withVenuePlaces`)
 * @returns {import('./screens.js').CardInfo}
 */
export function toCardInfo(meta, { origin, venue = null, venueFailed = false, states = null }) {
	/** @type {import('./screens.js').CardInfo} */
	const info = {};
	if (meta.featured) {
		try {
			info.image = new URL(String(meta.featured), origin).href;
		} catch {
			// una imagen que no se puede leer: sin foto
		}
	}
	if (!venueFailed) {
		const place = eventPlace(meta, venue);
		if (place.text) info.place = place.text;
		const map = venue ? googleMapsLink(venue) : place.mapUrl;
		if (map) info.mapUrl = map;
	}
	info.ticket = ticketCta(meta, states);
	return info;
}

/**
 * La tarjeta de un evento que está entre los próximos públicos. `{}` si ya no está.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} slug
 * @param {string} origin
 * @returns {Promise<import('./screens.js').CardInfo>}
 */
export async function eventCardInfo(platform, slug, origin) {
	const posts = await sitePosts(platform);
	const post = posts.find(
		(p) => p.meta?.category === 'calendario' && String(p.meta.postID) === slug
	);
	if (!post) return {};
	/** @type {import('$lib/utils/venues.js').VenueView | null} */
	let venue = null;
	let venueFailed = false;
	try {
		venue = (await feedVenues(getDB(platform), [slug])).get(slug) ?? null;
	} catch (e) {
		console.error(
			'[telegram] no se pudo leer el lugar del evento:',
			/** @type {Error} */ (e)?.name
		);
		venueFailed = true;
	}
	const states = await ticketStatesFor(platform, [post]);
	return toCardInfo(post.meta, { origin, venue, venueFailed, states });
}
