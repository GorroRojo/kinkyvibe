import { dev } from '$app/environment';
import { fetchMarkdownPosts } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { ANON } from '$lib/server/objects/visibility.js';
import { siteBodies, siteContentStamp, sitePosts } from '$lib/server/contenido/posts.js';
import {
	importedLegacySlugs,
	listPublicProfiles,
	profilesStamp
} from '$lib/server/amigues/profiles.js';
import { perfilesPublicosEnabled, seriesEnabled } from '$lib/server/flags.js';
import { currentSiteTags } from '$lib/utils/siteTags.js';
import { buildSearchIndex } from '$lib/server/search/siteIndex.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';

// Not prerendered: the tags follow the `etiquetas_db` switch (the file or the database,
// docs/etiquetas.md), events and material follow `contenido_db` and the amigues profiles
// `perfiles_publicos`; the database can't be read at build time. What goes in the index is
// decided in $lib/server/search/siteIndex.js (pure, with tests).
export const prerender = false;

/**
 * El índice armado (ya como JSON), por árbol de etiquetas y server instance. Sigue valiendo
 * mientras no cambie la marca de lo que lee de la base (`key`: el contenido, los perfiles y el
 * interruptor de series), como las listas de contenido (src/lib/server/contenido/posts.js): cada
 * pedido hace solo las consultas chicas de «¿cambió algo?».
 * @type {WeakMap<TagManager, { key: string, body: Promise<string> }>}
 */
const indexCache = new WeakMap();

/** Markdown crudo de cada post, cargado sólo por este endpoint. */
// `{ as: 'raw' }` is gone in Vite 8 (it returned the module instead of the text).
const rawPosts = /** @type {Record<string, () => Promise<string>>} */ (
	import.meta.glob('/src/lib/posts/*/*.md', { query: '?raw', import: 'default' })
);

/**
 * Índice para la búsqueda global (ver $lib/utils/search.js y SearchPalette.svelte).
 * Sólo lo que ve cualquiera en las listas del sitio.
 * @type {import("./$types").RequestHandler}
 */
export async function GET({ platform }) {
	const tagManager = currentSiteTags();
	const db = getDB(platform);
	const [contentStamp, profilesOn, series] = await Promise.all([
		siteContentStamp(platform),
		perfilesPublicosEnabled(platform),
		seriesEnabled(platform)
	]);
	const profiles = Boolean(db && profilesOn);
	const key = JSON.stringify([
		contentStamp,
		profiles ? await profilesStamp(/** @type {any} */ (db)) : null,
		series
	]);
	let entry = dev ? undefined : indexCache.get(tagManager);
	if (!entry || entry.key !== key) {
		const body = buildIndex(tagManager, platform, { profiles, series }).then(JSON.stringify);
		const fresh = { key, body };
		entry = fresh;
		if (!dev) {
			indexCache.set(tagManager, fresh);
			body.catch(() => {
				if (indexCache.get(tagManager) === fresh) indexCache.delete(tagManager);
			});
		}
	}
	return new Response(await entry.body, {
		headers: { 'content-type': 'application/json', ...TAGGED_CACHE }
	});
}

/**
 * @param {TagManager} tagManager
 * @param {App.Platform | undefined} platform
 * @param {{ profiles: boolean, series: boolean }} opts
 */
async function buildIndex(tagManager, platform, { profiles, series }) {
	const db = getDB(platform);
	const [posts, bodies, wikiPosts, profileList, imported] = await Promise.all([
		sitePosts(platform),
		siteBodies(platform),
		fetchMarkdownPosts(true),
		profiles && db ? listPublicProfiles(db, ANON) : null,
		profiles && db ? importedLegacySlugs(db) : null
	]);
	return buildSearchIndex({
		posts,
		wikiPosts,
		tags: tagManager,
		// El cuerpo de lo que sale de la base (`siteBodies`, leído una vez por cambio) o del .md.
		body: ({ meta, path }) => {
			const stored = bodies.get(path);
			if (stored !== undefined) return stored;
			return rawPosts[`/src/lib/posts/${meta.category}/${meta.postID}.md`]?.();
		},
		profiles: profileList && imported ? { list: profileList, imported } : null,
		series
	});
}
