/**
 * El índice público de la búsqueda, armado y recordado: lo sirve /api/search-index.json y lo usa
 * el modo inline del bot de Telegram (docs/telegram.md, «Modo inline»). Es uno solo para todes:
 * lo que alcanza une visitante sin cuenta (qué entra lo decide `buildSearchIndex`, en
 * siteIndex.js, con pruebas).
 *
 * Se recuerda por árbol de etiquetas y server instance mientras no cambie la marca de lo que lee
 * de la base (el contenido, la wiki, los perfiles, los vínculos evento → lugar), como las listas de
 * contenido (src/lib/server/contenido/posts.js): cada pedido hace solo las consultas chicas de
 * «¿cambió algo?».
 */
import { dev } from '$app/environment';
import { getDB } from '$lib/server/db';
import { readAndKeep } from '$lib/server/db/perRequest.js';
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
import { siteTagSource } from '$lib/server/etiquetas/source.js';
import { siteWikiBodies, siteWikiPosts } from '$lib/server/wiki/site.js';

/**
 * Lo armado: el índice (y su JSON, lo que sirve el endpoint) más lo que se leyó para armarlo, para
 * quien necesite algo más de lo mismo (la imagen y la fecha de cada cosa, en el bot). Nada de acá
 * puede salir si no está en `raw`: lo leído trae también lo que el índice deja afuera.
 *
 * @typedef {{
 *   raw: import('$lib/utils/search').RawSearchIndex,
 *   json: string,
 *   posts: readonly ProcessedPost[],
 *   wikiPosts: readonly ProcessedPost[],
 *   profiles: readonly import('./siteIndex.js').IndexProfile[] | null,
 *   tags: TagManager
 * }} BuiltIndex
 */

/**
 * Solo índices ya armados: lo que está en camino se comparte solo dentro del pedido
 * (`readAndKeep`, src/lib/server/db/perRequest.js).
 * @type {WeakMap<TagManager, { key: string, built: BuiltIndex }>}
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
 * El índice público (armado una vez por cambio de la base).
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<BuiltIndex>}
 */
export async function publicSearchIndex(platform) {
	const tagManager = currentSiteTags();
	const db = getDB(platform);
	const profiles = Boolean(db);
	// Las marcas, a la par: cada una es una ida y vuelta a la base y ninguna depende de otra.
	const [contentStamp, source, profileStamp, venueStamp] = await Promise.all([
		siteContentStamp(platform),
		siteTagSource(platform),
		profiles ? profilesStamp(/** @type {any} */ (db)) : null,
		profiles ? eventVenuesStamp(/** @type {any} */ (db)) : null
	]);
	const wiki = source.wiki ?? [];
	const key = JSON.stringify([contentStamp, wikiStamp(wiki), profileStamp, venueStamp]);
	const entry = dev ? undefined : indexCache.get(tagManager);
	if (entry && entry.key === key) return entry.built;
	return readAndKeep(
		tagManager,
		`public-index\n${key}`,
		() => buildIndex(tagManager, platform, { profiles }),
		(built) => {
			if (!dev) indexCache.set(tagManager, { key, built });
		}
	);
}

/**
 * @param {TagManager} tagManager
 * @param {App.Platform | undefined} platform
 * @param {{ profiles: boolean }} opts
 * @returns {Promise<BuiltIndex>}
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
	const raw = await buildSearchIndex({
		posts,
		wikiPosts,
		tags: tagManager,
		// El cuerpo de lo que sale de la base (`siteBodies`, leído una vez por cambio; la wiki, con
		// las etiquetas). Los .md de amigues y la wiki ya no se leen.
		body: ({ path }) => bodies.get(path) ?? wikiBodies.get(path),
		profiles: profileList && imported ? { list: profileList, imported, linkedVenues: venues } : null
	});
	return {
		raw,
		json: JSON.stringify(raw),
		posts,
		wikiPosts,
		profiles: profileList ? [...profileList, ...venues] : null,
		// El árbol con el que se armó (el bot recorre la Kinkipedia por ramas).
		tags: tagManager
	};
}
