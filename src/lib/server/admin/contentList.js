/**
 * Lists of the panel's content sections (/admin/contenido/material, /admin/comunidad/perfiles), from
 * the database (through contentMetas).
 */
import { amiguesImageURL, contentMetas } from './content.js';
import { contentRow } from '$lib/utils/contentPosts.js';
import { isNumericFeatured } from '$lib/utils/eventDraft.js';
import { legacyAssetURL, legacyMediaFolders, legacyNumberedURL } from '$lib/utils/legacyMedia.js';

/**
 * @param {string} slug
 * @param {any} id featured value
 */
function materialImage(slug, id) {
	if (id === undefined || id === null || id === '') return undefined;
	// La copia en la biblioteca de la imagen vieja ($lib/utils/legacyMedia.js).
	if (isNumericFeatured(id)) return legacyNumberedURL('material', slug, id);
	return legacyAssetURL(String(id));
}

/**
 * URL of a post's current image (the library copy of its old image), or undefined.
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
 * Slugs a new post of `category` can't use: the database's (deleted ones included, through
 * contentMetas) and the old media folders (their images are still in the library under that name).
 * @param {string} category material | amigues
 */
export async function takenContentSlugs(category) {
	/** @type {Set<string>} */
	const out = new Set(legacyMediaFolders(category));
	for (const p of await contentMetas()) if (p.category === category) out.add(p.slug);
	return [...out].sort();
}
