import { fetchPost } from '$lib/utils';
import { redirect } from '@sveltejs/kit';

/** Los componentes de los .md (solo se baja el del evento que se mira). */
/** @type {Record<string, () => Promise<import('svelte').Component>>} */
const components = import.meta.glob('/src/lib/posts/calendario/*.md', { import: 'default' });

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	// Interruptor `contenido_db`: el evento viene del servidor. Si su texto es el mismo que el del
	// .md (`component`), se muestra el componente de ese .md, igual que siempre; si no, `html`.
	let post = data?.mode === 'db' ? data.post : await fetchPost('calendario', params.event);
	const content =
		data?.mode === 'db'
			? data.post.component
				? await components[`/src/lib/posts/calendario/${data.post.meta.postID}.md`]?.()
				: undefined
			: post.content;
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	// `data` viene de +page.server.js (posts relacionados y el resumen de la venta de entradas
	// para el botón, `null` si el evento no vende entradas).
	// `venue`: el lugar según su privacidad (o `null`); si hay, manda sobre `location` del .md.
	return {
		...data,
		...post,
		content,
		// el texto del evento de la base ya armado (cuando no es el del .md) y su CSS propio
		html: data?.mode === 'db' && !content ? data.post.html : undefined,
		css: data?.mode === 'db' && !content ? data.post.css : '',
		tickets: data?.tickets ?? null,
		venue: data?.venue ?? null,
		propinas: data?.propinas ?? false
	};
}
