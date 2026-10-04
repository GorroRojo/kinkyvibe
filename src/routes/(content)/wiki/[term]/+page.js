import tagsFactory from '$lib/utils/tags';
import { resolveTagSlug } from '$lib/utils/tagSlug.js';
export const prerender = 'auto';

// Only wiki posts, and only the one being viewed is downloaded. Metadata comes from
// +page.server.js, so this page doesn't import $lib/utils (which maps every post and
// image of the site).
/** @type {Record<string, () => Promise<import('svelte').Component>>} */
const posts = import.meta.glob('/src/lib/posts/wiki/*.md', { import: 'default' });

/** @type {import("./$types").PageLoad} */
export async function load({ params, data, parent }) {
	if ('meta' in data) {
		const content = await posts[`/src/lib/posts/wiki/${params.term}.md`]?.();
		return { ...data, content };
	}
	// no wiki entry: show the tag of the same name ("Rancheadita-Kinky" → "Rancheadita Kinky",
	// aliases → their tag; same helper as /api/series and the .ics). Tags have methods, so they
	// can't come from the server load.
	// El árbol de la base (o el archivo de respaldo; layout raíz).
	const { siteTags } = await parent();
	const tags = siteTags
		? tagsFactory(/** @type {any} */ (structuredClone(siteTags)))
		: tagsFactory();
	return { ...data, tag: resolveTagSlug(tags, params.term) ?? tags.get(params.term) };
}
