/**
 * Data the admin editors need about the site's content: which tags posts use (for the tag
 * picker) and the amigues profiles / names used as organizers (for the organizer picker).
 * Everything comes from the database (the only source, «solo base»): events and material, the
 * amigues profiles and the wiki pages (src/lib/server/contenido/fichas.js). Without a database,
 * nothing.
 */
import { isNumericFeatured } from '$lib/utils/eventDraft.js';
/** @type {Record<string, string>} */
const amiguesMedia = import.meta.glob('/src/lib/posts/amigues/media/*/*.{jpeg,jfif,jpg,png,webp}', {
	eager: true,
	import: 'default'
});
/** @type {Record<string, string>} */
const assetFiles = import.meta.glob('/src/lib/assets/*.{jpeg,jfif,jpg,png,webp}', {
	eager: true,
	import: 'default'
});

/**
 * @typedef {object} PostMeta
 * @prop {string} category
 * @prop {string} slug
 * @prop {any} meta
 */

/** @returns {Promise<PostMeta[]>} */
async function allMeta() {
	const { activeContentDB, allDbPostObjects } = await import('../contenido/repo.js');
	const { CONTENT_CATEGORIES } = await import('../contenido/categories.js');
	const { fichaMetas } = await import('../contenido/fichas.js');
	const db = activeContentDB();
	if (!db) return [];
	/** @type {PostMeta[]} */
	const out = [];
	for (const [category, cat] of Object.entries(CONTENT_CATEGORIES)) {
		// Solo la metadata: sin armar el texto de cada post (también los ocultos, que el panel ve;
		// no los borrados).
		for (const [slug, e] of await allDbPostObjects(db, category)) {
			if (!e.deleted) out.push({ category, slug, meta: cat.toMeta(e.object) });
		}
	}
	// Los perfiles de amigues y las páginas de la wiki.
	out.push(...(await fichaMetas(db)));
	return out;
}

/** @param {any} v @returns {string[]} */
const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

/**
 * How many posts of a category use each tag (as written).
 * @param {string} category
 * @param {PostMeta[]} [metas] what {@link contentMetas} gave, if the caller already has it (each
 *   call reads every event and material post of the database)
 * @returns {Promise<Record<string, number>>}
 */
export async function tagUsage(category, metas) {
	/** @type {Record<string, number>} */
	const out = {};
	for (const p of metas ?? (await allMeta())) {
		if (p.category !== category) continue;
		for (const t of new Set(list(p.meta.tags))) out[t] = (out[t] ?? 0) + 1;
	}
	return out;
}

/**
 * How many posts of a category list each `authors:` entry.
 * @param {string} category
 * @param {PostMeta[]} [metas] as in {@link tagUsage}
 * @returns {Promise<Record<string, number>>}
 */
export async function authorUsage(category, metas) {
	/** @type {Record<string, number>} */
	const out = {};
	for (const p of metas ?? (await allMeta())) {
		if (p.category !== category) continue;
		for (const a of new Set(list(p.meta.authors).map((x) => x.trim()))) {
			if (a) out[a] = (out[a] ?? 0) + 1;
		}
	}
	return out;
}

/**
 * @param {string} slug
 * @param {any} id featured / logo / photo value
 */
function profileImage(slug, id) {
	if (id === undefined || id === null || id === '') return undefined;
	if (isNumericFeatured(id)) {
		for (const f of ['jpeg', 'jfif', 'jpg', 'png', 'webp']) {
			const url = amiguesMedia[`/src/lib/posts/amigues/media/${slug}/${id}.${f}`];
			if (url) return url;
		}
		return undefined;
	}
	return assetFiles[`/src/lib/assets/${id}`];
}

/**
 * The amigues profiles (unpublished ones left out), for the organizer picker.
 * @param {PostMeta[]} [metas] as in {@link tagUsage}
 * @returns {Promise<import('$lib/utils/organizers.js').Profile[]>}
 */
export async function listProfiles(metas) {
	return (metas ?? (await allMeta()))
		.filter((p) => p.category === 'amigues' && p.meta.force_unpublished !== true)
		.map((p) => ({
			slug: p.slug,
			title: String(p.meta.title ?? p.slug),
			thumb:
				profileImage(p.slug, p.meta.logo) ??
				profileImage(p.slug, p.meta.photo) ??
				profileImage(p.slug, p.meta.featured)
		}))
		.sort((a, b) => a.slug.localeCompare(b.slug, 'es'));
}

/**
 * Everything the tag and organizer pickers need for a category.
 * @param {string} category
 */
export async function editorData(category) {
	// One read of every post for the three (before: three, each reading the database again).
	const metas = await allMeta();
	const [usage, profiles, authors] = await Promise.all([
		tagUsage(category, metas),
		listProfiles(metas),
		authorUsage(category === 'amigues' ? 'calendario' : category, metas)
	]);
	return { tagUsage: usage, profiles, authorUsage: authors };
}

/**
 * Metadata of every post of the database (events, material, amigues profiles and wiki pages), for
 * the panel's content lists and the tag tree (./contentList.js, ./tagTree.js).
 * @returns {Promise<PostMeta[]>}
 */
export const contentMetas = () => allMeta();

/**
 * Image URL (as bundled in this deploy) of an amigues profile's `featured` / `logo` / `photo`.
 * @param {string} slug
 * @param {any} id
 */
export const amiguesImageURL = (slug, id) => profileImage(slug, id);
