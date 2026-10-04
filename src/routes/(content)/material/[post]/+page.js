// Only this category's posts, and only the one being viewed is downloaded. Metadata,
// author profiles and related posts come from +page.server.js, so this page doesn't
// import $lib/utils (which maps every post and image of the site).
/**
 * Los componentes que mdsvex compiló de los .md: se usan para mostrar un texto de la base que es
 * el mismo que el de su .md (`component`), así se ve exactamente como siempre.
 * @type {Record<string, () => Promise<import('svelte').Component>>}
 */
const posts = import.meta.glob('/src/lib/posts/material/*.md', { import: 'default' });

/** @type {import("./$types").PageLoad} */
export async function load({ data }) {
	// El post viene de la base (+page.server.js). Si su texto es el mismo que el del .md
	// (`component`), se muestra el componente de ese .md; si no, `html` (o `parts`, con
	// interactivos registrados).
	const content = data.component
		? await posts[`/src/lib/posts/material/${data.meta.postID}.md`]?.()
		: undefined;
	return content
		? { ...data, html: undefined, css: '', parts: null, content }
		: { ...data, content: undefined };
}
