import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { fetchMarkdownPosts } from '$lib/utils';
import { contentDb, siteBodies, sitePosts } from '$lib/server/contenido/posts.js';
import { currentSiteTags } from '$lib/utils/siteTags.js';
import { fold, stripMarkdown, truncate } from '$lib/utils/search';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';

// Not prerendered: the tags follow the `etiquetas_db` switch (the file or the database,
// docs/etiquetas.md) and the events follow `contenido_db`; the database can't be read at build
// time. With the events from the files it's built once per tag tree and server instance
// (indexCache); with `contenido_db` on, events can change without a deploy, so it's built each time.
export const prerender = false;

/** @type {WeakMap<TagManager, Promise<unknown>>} */
const indexCache = new WeakMap();

/**
 * Máximo de caracteres de cuerpo (texto plano) por post en el índice. Los eventos se
 * repiten mucho entre ediciones (y ya tienen título/resumen/tags), así que se recortan más.
 * @type {Record<string, number>}
 */
const BODY_MAX = { calendario: 400, material: 2500, amigues: 2500, wiki: 2500 };

/** Markdown crudo de cada post, cargado sólo por este endpoint. */
// `{ as: 'raw' }` is gone in Vite 8 (it returned the module instead of the text).
const rawPosts = /** @type {Record<string, () => Promise<string>>} */ (
	import.meta.glob('/src/lib/posts/*/*.md', { query: '?raw', import: 'default' })
);

/**
 * @param {string} category
 * @param {string} postID
 * @param {string} [stored] el cuerpo guardado en la base (interruptor `contenido_db`)
 */
async function plainBody(category, postID, stored) {
	const loader = rawPosts[`/src/lib/posts/${category}/${postID}.md`];
	if (stored === undefined && !loader) return '';
	const text = stripMarkdown(stored ?? (await loader()));
	return /^contenido secreto$/i.test(text) ? '' : truncate(text, BODY_MAX[category] ?? 1000);
}

/** @param {any} d */
function isoDate(d) {
	if (!d) return undefined;
	const t = new Date(d);
	return isNaN(t.getTime()) ? undefined : t.toISOString();
}

/** @param {any} v */
const str = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * Índice para la búsqueda global (ver $lib/utils/search.js y SearchPalette.svelte).
 * Sólo incluye posts listados y publicados, igual que fetchMarkdownPosts.
 * @type {import("./$types").RequestHandler}
 */
export async function GET({ platform }) {
	const tagManager = currentSiteTags();
	if (await contentDb(platform)) {
		return json(await buildIndex(tagManager, platform), { headers: TAGGED_CACHE });
	}
	let index = dev ? undefined : indexCache.get(tagManager);
	if (!index) {
		index = buildIndex(tagManager, platform);
		if (!dev) {
			indexCache.set(tagManager, index);
			index.catch(() => indexCache.delete(tagManager));
		}
	}
	return json(await index, { headers: TAGGED_CACHE });
}

/**
 * @param {TagManager} tagManager
 * @param {App.Platform | undefined} platform
 */
async function buildIndex(tagManager, platform) {
	/** @type {import('$lib/utils/search').SearchDoc[]} */
	const docs = [];
	/** @type {Set<string>} */
	const usedTags = new Set();

	const [all, bodies] = await Promise.all([sitePosts(platform), siteBodies(platform)]);
	const posts = all.filter((p) => !p.meta.force_unpublished);
	for (const { meta, path } of posts) {
		const tags = [...new Set(meta.tags ?? [])];
		tags.forEach((t) => usedTags.add(t));
		const event = meta.category === 'calendario';
		docs.push({
			c: meta.category,
			h: path,
			t: str(meta.title) || meta.postID,
			s: stripMarkdown(str(meta.summary)),
			g: tags,
			a: (meta.authors ?? []).map(str),
			d: event ? isoDate(meta.start) : undefined,
			e: event ? isoDate(meta.end) : undefined,
			b: await plainBody(meta.category, meta.postID, bodies.get(path))
		});
	}

	// Kinkipedia: entradas de la wiki + tags con descripción u otros nombres.
	const wikiPosts = (await fetchMarkdownPosts(true)).filter((p) => !p.meta.force_unpublished);
	/** @type {Map<string, import('$lib/utils/search').SearchDoc>} */
	const wikiByTerm = new Map();
	for (const { meta, path } of wikiPosts) {
		const term = str(meta.wiki || meta.postID).replaceAll('-', ' ');
		const tag = tagManager.get(term);
		/** @type {import('$lib/utils/search').SearchDoc} */
		const doc = {
			c: 'wiki',
			h: path,
			t: str(meta.title) || term,
			s: stripMarkdown(str(meta.summary || tag.description)),
			g: [...new Set([...(tag.orphan ? [] : [tag.id]), ...(meta.tags ?? [])])],
			k: tag.aka ?? [],
			a: (meta.authors ?? []).map(str),
			b: await plainBody('wiki', meta.postID)
		};
		doc.g?.forEach((t) => usedTags.add(t));
		wikiByTerm.set(fold(tag.orphan ? term : tag.id), doc);
		docs.push(doc);
	}
	for (const tag of tagManager.tagsData()) {
		if (tag.aliasOf || tag.id === 'root') continue;
		const description = tag.description ? stripMarkdown(tag.description) : '';
		const aka = tag.aka ?? [];
		const existing = wikiByTerm.get(fold(tag.id));
		if (existing) {
			if (description && existing.s !== description) {
				existing.b = (description + ' ' + (existing.b ?? '')).trim();
			}
			continue;
		}
		if (!description && aka.length === 0) continue;
		const name = tag.visible_name ?? tag.id;
		docs.push({
			c: 'wiki',
			h: '/wiki/' + encodeURIComponent(tag.id),
			t: name,
			s: description,
			g: [tag.id],
			k: aka
		});
		usedTags.add(tag.id);
	}

	/** @type {Record<string, string[]>} tag id -> [nombre visible (si difiere), ...alias] */
	const tags = {};
	for (const id of usedTags) {
		const tag = tagManager.get(id);
		const names = [...new Set([tag.visible_name ?? id, ...(tag.aka ?? [])])].filter(
			(n) => n !== id
		);
		if (names.length > 0) tags[id] = names;
	}

	// Sacar campos vacíos para achicar el JSON.
	for (const doc of docs) {
		for (const k of /** @type {(keyof typeof doc)[]} */ (Object.keys(doc))) {
			const v = doc[k];
			if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete doc[k];
		}
	}
	return { v: 1, docs, tags };
}
