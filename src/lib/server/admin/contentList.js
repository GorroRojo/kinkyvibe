/**
 * Lists of the panel's content sections (/admin/contenido/material, /admin/comunidad/perfiles), from the posts bundled
 * in this deploy (plus the demo layer on previews, through contentMetas).
 */
import { amiguesImageURL, contentMetas } from './content.js';
import { contentRow } from '$lib/utils/contentPosts.js';
import { isNumericFeatured } from '$lib/utils/eventDraft.js';

const postFiles = import.meta.glob('/src/lib/posts/{material,amigues}/*.md');
/** @type {Record<string, string>} */
const materialMedia = import.meta.glob(
	'/src/lib/posts/material/media/*/*.{jpeg,jfif,jpg,png,webp}',
	{ eager: true, import: 'default' }
);
const amiguesFolders = import.meta.glob('/src/lib/posts/amigues/media/*/*');
const materialFolders = import.meta.glob('/src/lib/posts/material/media/*/*');
/** @type {Record<string, string>} */
const assetFiles = import.meta.glob('/src/lib/assets/*.{jpeg,jfif,jpg,png,webp}', {
	eager: true,
	import: 'default'
});

/**
 * @param {string} slug
 * @param {any} id featured value
 */
function materialImage(slug, id) {
	if (id === undefined || id === null || id === '') return undefined;
	if (isNumericFeatured(id)) {
		for (const f of ['jpeg', 'jfif', 'jpg', 'png', 'webp']) {
			const url = materialMedia[`/src/lib/posts/material/media/${slug}/${id}.${f}`];
			if (url) return url;
		}
		return undefined;
	}
	return assetFiles[`/src/lib/assets/${id}`];
}

/**
 * URL of a post's current image as bundled in this deploy, or undefined.
 * @param {string} category
 * @param {string} slug
 * @param {any} featured
 */
export function contentImageURL(category, slug, featured) {
	return category === 'amigues' ? amiguesImageURL(slug, featured) : materialImage(slug, featured);
}

/**
 * Rows for the list of a content section, newest first (unpublished ones included, marked).
 * @param {string} category material | amigues
 * @returns {Promise<import('$lib/utils/contentPosts.js').ContentRow[]>}
 */
export async function listContent(category) {
	const rows = (await contentMetas())
		.filter((p) => p.category === category)
		.map((p) =>
			contentRow(
				p.slug,
				p.meta,
				category === 'amigues'
					? (amiguesImageURL(p.slug, p.meta.featured) ??
							amiguesImageURL(p.slug, p.meta.logo) ??
							amiguesImageURL(p.slug, p.meta.photo))
					: materialImage(p.slug, p.meta.featured)
			)
		);
	return rows.sort(
		(a, b) =>
			(b.published || '').localeCompare(a.published || '') || a.title.localeCompare(b.title, 'es')
	);
}

/**
 * Slugs a new post of `category` can't use in this deploy: its files (templates included) and
 * media folders. The save checks GitHub too.
 * @param {string} category material | amigues
 */
export async function takenContentSlugs(category) {
	/** @type {Set<string>} */
	const out = new Set();
	for (const path of Object.keys(postFiles)) {
		const [c, file] = path.split('/').slice(-2);
		if (c === category) out.add(file.replace(/\.md$/, ''));
	}
	const folders = category === 'amigues' ? amiguesFolders : materialFolders;
	for (const path of Object.keys(folders)) out.add(path.split('/').slice(-2)[0]);
	for (const p of await contentMetas()) if (p.category === category) out.add(p.slug);
	return [...out].sort();
}
