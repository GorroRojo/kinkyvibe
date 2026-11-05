import { dev } from '$app/environment';
import { currentSitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { askVenuePlacesEarly, withVenuePlaces } from '$lib/server/amigues/venues.js';
import { askTicketStatesEarly, ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { carruselPortadaEnabled } from '$lib/server/flags.js';
import { carruselSlides } from '$lib/server/carrusel.js';
import { conFichas } from '$lib/server/carruselFicha.js';
import { carruselModo } from '$lib/utils/carruselEstilos.js';
import { siteWikiPosts } from '$lib/server/wiki/site.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform, url }) {
	// La venta y los lugares de las tarjetas, a la par de la lista (con lo que ya tiene el isolate).
	askTicketStatesEarly(platform);
	askVenuePlacesEarly(getDB(platform));
	// El carrusel de arriba (interruptor `carrusel_portada`, apagado si no hay fila; docs/estilo.md).
	// Solo en desarrollo (`npm run dev`): `?carrousel` lo muestra aunque esté apagado y
	// `?carrousel=a…e|rotar` prueba un modo sin guardarlo. En producción y en los previews, nada.
	const probar = dev ? url.searchParams.get('carrousel') : null;
	const carrusel = carruselPortadaEnabled(platform);
	const current = await currentSitePosts(platform);
	// A la par (cada consulta a la base es una vuelta): el lugar no cambia la venta de entradas.
	const [posts, ticketStates] = await Promise.all([
		// Un lugar vinculado manda sobre el «Dónde» del .md (el carrusel muestra el lugar).
		withVenuePlaces(getDB(platform), current),
		// «Comprar entradas» / «Agotadas» en las tarjetas: todos los eventos en una consulta.
		ticketStatesFor(platform, current)
	]);
	const show = (await carrusel) || probar !== null;
	return {
		posts,
		ticketStates,
		// Las diapositivas, con su estilo y los colores de su flyer (src/lib/server/carrusel.js).
		// Con lo nuevo de la Kinkipedia: sus páginas vienen con el árbol de etiquetas, que el layout
		// ya leyó (recordado 30 s por isolate): sin consultas de más.
		carrusel: show
			? await conFichas(
					platform,
					await carruselSlides(platform, [...posts, ...(await siteWikiPosts(platform))], {
						modo: probar ? carruselModo(probar) : null
					})
				)
			: []
	};
}
