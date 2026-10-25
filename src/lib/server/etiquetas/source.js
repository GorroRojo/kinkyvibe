/**
 * De dónde sale el árbol de etiquetas del sitio: la base (objetos `etiqueta`, docs/etiquetas.md;
 * el interruptor `etiquetas_db` quedó prendido para siempre).
 *
 * - Sin base, con la base sin etiquetas (por ejemplo una base local nueva sin la semilla:
 *   `npm run db:semilla`) o sin poder leerla: el árbol de respaldo ($lib/utils/tagFallback.js),
 *   que es vacío (el archivo de etiquetas se borró con los .md, decisión 0032).
 * - Lo leído de la base se recuerda unos segundos por isolate (como los interruptores); el editor
 *   del panel lo olvida al guardar (`clearTagSourceCache`).
 * - `rawTags` (de la base) es la lista que espera `tagsFactory`, SIN tocar: `tagsFactory` les
 *   agrega funciones a los objetos que recibe, así que el árbol se arma sobre una copia
 *   (`tagManagerOf`) y la lista se puede mandar a la página tal cual.
 */
import { fallbackTagList } from '$lib/utils/tagFallback.js';
import tagsFactory from '$lib/utils/tags.js';
import { getDB, logDBError } from '$lib/server/db';
import { FLAG_CACHE_MS } from '$lib/server/flags.js';
import { useSiteTags } from '$lib/utils/siteTags.js';
import { splitTagList } from '$lib/utils/tagDetails.js';
import { tagManager, wikiTagManager } from '$lib/utils/stores.js';
import { recordsToRawTags } from './model.js';
import { loadTagRecords } from './read.js';
import { wikiEntriesOf } from './wikiPages.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {{ rawTags: readonly Record<string, unknown>[], fromDb: boolean, wiki?: readonly import('./wikiPages.js').WikiEntry[] }} TagSource
 *   `wiki`: las páginas de la Kinkipedia (el texto de la wiki de cada etiqueta que tiene uno;
 *   ./wikiPages.js). Solo de la base: sin base no hay páginas de la wiki (como los eventos).
 */

/** Sin etiquetas de la base: el árbol de respaldo ($lib/utils/tagFallback.js). @returns {TagSource} */
const FILE = () => ({ rawTags: fallbackTagList(), fromDb: false, wiki: [] });

/** @type {{ value: TagSource, expires: number } | null} */
let cache = null;

/** Olvida lo leído de la base (al guardar desde el panel, y en los tests). */
export function clearTagSourceCache() {
	cache = null;
}

/**
 * Las etiquetas de la base como lista para `tagsFactory`, o `null` si no hay ninguna.
 *
 * @param {D1Database} db
 * @returns {Promise<Record<string, unknown>[] | null>}
 */
export async function readDbRawTags(db) {
	return (await readDbTags(db))?.rawTags ?? null;
}

/**
 * Las etiquetas de la base (para `tagsFactory`) y las páginas de la wiki, o `null` si no hay
 * ninguna etiqueta. Una sola lectura.
 *
 * @param {D1Database} db
 */
async function readDbTags(db) {
	const records = await loadTagRecords(db);
	return records.length
		? { rawTags: recordsToRawTags(records), wiki: wikiEntriesOf(records) }
		: null;
}

/**
 * @param {D1Database | null | undefined} db
 * @param {{ now?: number }} [opts]
 * @returns {Promise<TagSource>}
 */
export async function tagSourceFrom(db, { now = Date.now() } = {}) {
	if (!db) return FILE();
	if (cache && cache.expires > now) return cache.value;
	/** @type {TagSource} */
	let value = FILE();
	try {
		const read = await readDbTags(db);
		// Sin cambios: la misma lista (el mismo objeto), así los árboles y los posts ya
		// limpiados con ella se siguen usando (WeakMap por lista o por árbol). Si cambió solo el
		// texto de una página de la wiki, el árbol sigue siendo el mismo.
		const prev = cache?.value;
		const sameTree =
			read && prev?.fromDb && JSON.stringify(prev.rawTags) === JSON.stringify(read.rawTags);
		if (read && sameTree && JSON.stringify(prev?.wiki) === JSON.stringify(read.wiki))
			value = /** @type {TagSource} */ (prev);
		else if (read)
			value = {
				rawTags: sameTree ? /** @type {TagSource} */ (prev).rawTags : read.rawTags,
				fromDb: true,
				wiki: read.wiki
			};
	} catch (error) {
		logDBError('etiquetas desde la base', error);
	}
	cache = { value, expires: now + FLAG_CACHE_MS };
	return value;
}

/**
 * El árbol de etiquetas del sitio para esta plataforma.
 *
 * @param {App.Platform | undefined} platform
 */
export function siteTagSource(platform) {
	return tagSourceFrom(getDB(platform));
}

/**
 * Lo que manda el layout raíz en cada página: el árbol liviano de la base (sin descripciones,
 * relacionadas ni imágenes: $lib/utils/tagDetails.js), o `null` sin etiquetas en la base.
 *
 * @param {App.Platform | undefined} platform
 */
export async function siteTagsForPages(platform) {
	const source = await siteTagSource(platform);
	return source.fromDb ? splitTagList(source.rawTags).slim : null;
}

/**
 * Los detalles de las etiquetas (descripción, relacionadas, imagen) para las páginas que los
 * muestran (`data.siteTagDetails`: el layout raíz los junta con el árbol), o `null` sin etiquetas
 * en la base.
 *
 * @param {App.Platform | undefined} platform
 */
export async function siteTagDetails(platform) {
	const source = await siteTagSource(platform);
	return source.fromDb ? splitTagList(source.rawTags).details : null;
}

/** @type {WeakMap<object, TagManager>} */
const managers = new WeakMap();
/** @type {TagManager | undefined} */
let fileManager;

/**
 * El árbol armado (`tagsFactory`) de una fuente, uno por lista (se arma sobre una copia). El del
 * respaldo es el de siempre (`tagsFactory()` sobre ./tagFallback.js).
 *
 * @param {TagSource} source
 * @returns {TagManager}
 */
export function tagManagerOf(source) {
	if (!source.fromDb) return (fileManager ??= tagsFactory());
	let m = managers.get(source.rawTags);
	if (!m) {
		m = tagsFactory(/** @type {any} */ (structuredClone(source.rawTags)));
		managers.set(source.rawTags, m);
	}
	return m;
}

/**
 * Atajo: el árbol armado de las etiquetas del sitio.
 *
 * @param {App.Platform | undefined} platform
 */
export async function siteTagManager(platform) {
	return tagManagerOf(await siteTagSource(platform));
}

/**
 * Pone el árbol de este pedido como el árbol en uso del servidor ($lib/utils/siteTags.js, y los
 * stores `tagManager`/`wikiTagManager` del SSR). Lo llama `hooks.server.js` al empezar cada pedido:
 * así todo lo que lee el árbol (posts, editores, series, ingreso, avisos…) sigue al interruptor.
 *
 * @param {App.Platform | undefined} platform
 * @param {{ source?: TagSource }} [opts] `source` para tests
 * @returns {Promise<TagSource>}
 */
export async function applySiteTags(platform, { source } = {}) {
	const src = source ?? (await siteTagSource(platform));
	useSiteTags(src.fromDb ? src.rawTags : null, [tagManager, wikiTagManager]);
	return src;
}
