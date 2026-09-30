/**
 * Data the admin editors need about the site's content: which tags posts use (for the tag
 * picker) and the amigues profiles / names used as organizers (for the organizer picker).
 * Read from the posts bundled in this deploy, like the rest of the site.
 */
import { isNumericFeatured } from '$lib/utils/eventDraft.js';

const posts = import.meta.glob('/src/lib/posts/{calendario,material,amigues,wiki}/*.md', {
	import: 'metadata'
});
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

/** @type {Promise<PostMeta[]> | undefined} */
let cache;

/** @returns {Promise<PostMeta[]>} */
function allMeta() {
	if (!cache || import.meta.env.DEV) cache = loadAll();
	return cache;
}

async function loadAll() {
	/** @type {PostMeta[]} */
	const out = [];
	for (const [path, load] of Object.entries(posts)) {
		const [category, file] = path.split('/').slice(-2);
		const slug = file.replace(/\.md$/, '');
		if (slug.startsWith('_')) continue;
		try {
			const meta = await load();
			if (meta) out.push({ category, slug, meta });
		} catch (e) {
			// A post that doesn't compile is the site's problem, not the editor's.
		}
	}
	return out;
}

/** @param {any} v @returns {string[]} */
const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

/**
 * How many posts of a category use each tag (as written).
 * @param {string} category
 * @returns {Promise<Record<string, number>>}
 */
export async function tagUsage(category) {
	/** @type {Record<string, number>} */
	const out = {};
	for (const p of await allMeta()) {
		if (p.category !== category) continue;
		for (const t of new Set(list(p.meta.tags))) out[t] = (out[t] ?? 0) + 1;
	}
	return out;
}

/**
 * How many posts of a category list each `authors:` entry.
 * @param {string} category
 * @returns {Promise<Record<string, number>>}
 */
export async function authorUsage(category) {
	/** @type {Record<string, number>} */
	const out = {};
	for (const p of await allMeta()) {
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
 * @returns {Promise<import('$lib/utils/organizers.js').Profile[]>}
 */
export async function listProfiles() {
	return (await allMeta())
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
	const [usage, profiles, authors] = await Promise.all([
		tagUsage(category),
		listProfiles(),
		authorUsage(category === 'amigues' ? 'calendario' : category)
	]);
	return { tagUsage: usage, profiles, authorUsage: authors };
}
