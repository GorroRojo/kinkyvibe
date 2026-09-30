// Only this category's posts, and only the one being viewed is downloaded. Metadata,
// author profiles and related posts come from +page.server.js, so this page doesn't
// import $lib/utils (which maps every post and image of the site).
const posts = import.meta.glob('/src/lib/posts/amigues/*.md', { import: 'default' });

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	const content = await posts[`/src/lib/posts/amigues/${params.profile}.md`]?.();
	return { ...data, content };
}
