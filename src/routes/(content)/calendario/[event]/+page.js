import { redirect } from '@sveltejs/kit';
import { stripMdPlace } from '$lib/utils/eventPlace.js';

/**
 * Los componentes que mdsvex compiló de los .md (solo se baja el del evento que se mira): se usan
 * para mostrar un texto de la base que es el mismo que el de su .md (`component`), así se ve
 * exactamente como siempre. La base decide qué evento existe y qué dice.
 * @type {Record<string, () => Promise<import('svelte').Component>>}
 */
const components = import.meta.glob('/src/lib/posts/calendario/*.md', { import: 'default' });

/** @type {import("./$types").PageLoad} */
export async function load({ data }) {
	// El evento viene de la base (+page.server.js). Si su texto es el mismo que el del .md
	// (`component`), se muestra el componente de ese .md; si no, `html` (o `parts`, con
	// interactivos registrados).
	const post = data.post;
	const content = post.component
		? await components[`/src/lib/posts/calendario/${post.meta.postID}.md`]?.()
		: undefined;
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	// `data` viene de +page.server.js (posts relacionados y el resumen de la venta de entradas
	// para el botón, `null` si el evento no vende entradas).
	// `venue`: el lugar según su privacidad (o `null`); si hay, manda sobre el «Dónde» del evento
	// (`location`, `location_name`, `location_map`), que entonces la página no recibe.
	const venue = data.venue ?? null;
	return {
		...data,
		...post,
		content,
		// el texto del evento ya armado (cuando no es el del .md) y su CSS propio
		html: content ? undefined : post.html,
		css: content ? '' : post.css,
		parts: content ? null : (post.parts ?? null),
		meta: venue ? stripMdPlace(post.meta) : post.meta,
		tickets: data.tickets ?? null,
		venue,
		propinas: data.propinas ?? false
	};
}
