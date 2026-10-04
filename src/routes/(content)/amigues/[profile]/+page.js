// Only this category's posts, and only the one being viewed is downloaded. Metadata,
// author profiles and related posts come from +page.server.js, so this page doesn't
// import $lib/utils (which maps every post and image of the site).
// Profiles stored in the database come whole from the server: there
// is no .md component to load.
/** @type {Record<string, () => Promise<import('svelte').Component>>} */
const posts = import.meta.glob('/src/lib/posts/amigues/*.md', { import: 'default' });

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	if (data.mode === 'db') return { ...data, content: undefined };
	const content = await posts[`/src/lib/posts/amigues/${params.profile}.md`]?.();
	return { ...data, content };
}
