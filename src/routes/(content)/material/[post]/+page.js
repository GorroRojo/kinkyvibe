// Only this category's posts, and only the one being viewed is downloaded. Metadata,
// author profiles and related posts come from +page.server.js, so this page doesn't
// import $lib/utils (which maps every post and image of the site).
/** @type {Record<string, () => Promise<import('svelte').Component>>} */
const posts = import.meta.glob('/src/lib/posts/material/*.md', { import: 'default' });

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	// Interruptor `contenido_db`: el post viene del servidor. Si su texto es el mismo que el del .md
	// (`component`), se muestra el componente de ese .md, igual que siempre; si no, `html`.
	if (data.mode === 'db') {
		const content = data.component
			? await posts[`/src/lib/posts/material/${data.meta.postID}.md`]?.()
			: undefined;
		return content
			? { ...data, html: undefined, css: '', content }
			: { ...data, content: undefined };
	}
	const content = await posts[`/src/lib/posts/material/${params.post}.md`]?.();
	return { ...data, html: undefined, content };
}
