import { dev } from '$app/environment';
import { getDB } from '$lib/server/db';
import { ANON } from '$lib/server/objects/visibility.js';
import { siteBodies, siteContentStamp, sitePosts } from '$lib/server/contenido/posts.js';
import {
	importedLegacySlugs,
	listPublicProfiles,
	profilesStamp
} from '$lib/server/amigues/profiles.js';
import { eventVenuesStamp, linkedVenues } from '$lib/server/amigues/venues.js';
import { currentSiteTags } from '$lib/utils/siteTags.js';
import { buildSearchIndex } from '$lib/server/search/siteIndex.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';
import { siteTagSource } from '$lib/server/etiquetas/source.js';
import { siteWikiBodies, siteWikiPosts } from '$lib/server/wiki/site.js';

// Not prerendered: the tags, events and material come from the database (docs/etiquetas.md,
// docs/contenido.md), and so do the amigues profiles; the database can't be read at build time.
// What goes in the index is decided in $lib/server/search/siteIndex.js (pure, with tests).
export const prerender = false;

/**
 * El índice armado (ya como JSON), por árbol de etiquetas y server instance. Sigue valiendo
 * mientras no cambie la marca de lo que lee de la base (`key`: el contenido, los perfiles, los
 * vínculos evento → lugar), como las listas de contenido (src/lib/server/contenido/posts.js): cada
 * pedido hace solo las consultas chicas de «¿cambió algo?».
 * @type {WeakMap<TagManager, { key: string, body: Promise<string> }>}
 */
const indexCache = new WeakMap();

/**
 * Un número por lista de páginas de la wiki (la lista es otra solo si cambió algo: ver
 * src/lib/server/etiquetas/source.js), para la marca del índice.
 * @type {WeakMap<object, number>}
 */
const wikiVersions = new WeakMap();
let wikiVersion = 0;
/** @param {object} list */
function wikiStamp(list) {
	let v = wikiVersions.get(list);
	if (v === undefined) wikiVersions.set(list, (v = ++wikiVersion));
	return v;
}

/**
 * Índice para la búsqueda global (ver $lib/utils/search.js y SearchPalette.svelte).
 * Sólo lo que alcanza cualquiera navegando el sitio (sin cuenta): el índice es el mismo para todes.
 * @type {import("./$types").RequestHandler}
 */
export async function GET({ platform }) {
	const tagManager = currentSiteTags();
	const db = getDB(platform);
	const contentStamp = await siteContentStamp(platform);
	const profiles = Boolean(db);
	const wiki = (await siteTagSource(platform)).wiki ?? [];
	const key = JSON.stringify([
		contentStamp,
		wikiStamp(wiki),
		profiles ? await profilesStamp(/** @type {any} */ (db)) : null,
		profiles ? await eventVenuesStamp(/** @type {any} */ (db)) : null
	]);
	let entry = dev ? undefined : indexCache.get(tagManager);
	if (!entry || entry.key !== key) {
		const body = buildIndex(tagManager, platform, { profiles }).then(JSON.stringify);
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
 * @param {{ profiles: boolean }} opts
 */
async function buildIndex(tagManager, platform, { profiles }) {
	const db = getDB(platform);
	const [posts, bodies, wikiPosts, wikiBodies, profileList, imported] = await Promise.all([
		sitePosts(platform),
		siteBodies(platform),
		siteWikiPosts(platform),
		siteWikiBodies(platform),
		profiles && db ? listPublicProfiles(db, ANON) : null,
		profiles && db ? importedLegacySlugs(db) : null
	]);
	// Los lugares no listados a los que lleva el link de un evento que está en el índice (listado
	// y publicado): se alcanzan navegando, así que se pueden encontrar buscando.
	const reachableEvents = posts
		.filter(
			({ meta }) =>
				meta.category === 'calendario' && !meta.force_unpublished && !meta.force_unlisted
		)
		.map(({ meta }) => String(meta.postID));
	const venues = profiles && db ? await linkedVenues(db, reachableEvents) : [];
	return buildSearchIndex({
		posts,
		wikiPosts,
		tags: tagManager,
		// El cuerpo de lo que sale de la base (`siteBodies`, leído una vez por cambio; la wiki, con
		// las etiquetas). Los .md de amigues y la wiki ya no se leen.
		body: ({ path }) => bodies.get(path) ?? wikiBodies.get(path),
		profiles: profileList && imported ? { list: profileList, imported, linkedVenues: venues } : null
	});
}
