/**
 * De dónde sale el árbol de etiquetas del sitio: el archivo (src/lib/utils/hardcodedTags.js) o,
 * con el interruptor `etiquetas_db` prendido, la base (objetos `etiqueta`, docs/etiquetas.md).
 *
 * - Con el interruptor apagado, o prendido pero con la base sin etiquetas (todavía no se importó)
 *   o sin poder leerla: el archivo, como siempre.
 * - Lo leído de la base se recuerda unos segundos por isolate (como los interruptores); el editor
 *   del panel lo olvida al guardar (`clearTagSourceCache`).
 * - `rawTags` (de la base) es la lista que espera `tagsFactory`, SIN tocar: `tagsFactory` les
 *   agrega funciones a los objetos que recibe, así que el árbol se arma sobre una copia
 *   (`tagManagerOf`) y la lista se puede mandar a la página tal cual.
 */
import hardcodedTags from '$lib/utils/hardcodedTags.js';
import tagsFactory from '$lib/utils/tags.js';
import { getDB, logDBError } from '$lib/server/db';
import { FLAG_CACHE_MS, isFlagOn } from '$lib/server/flags.js';
import { useSiteTags } from '$lib/utils/siteTags.js';
import { tagManager, wikiTagManager } from '$lib/utils/stores.js';
import { recordsToRawTags } from './model.js';
import { loadTagRecords } from './read.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ rawTags: readonly Record<string, unknown>[], fromDb: boolean }} TagSource */

/** @type {TagSource} */
const FILE = Object.freeze({ rawTags: hardcodedTags, fromDb: false });

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
	const records = await loadTagRecords(db);
	return records.length ? recordsToRawTags(records) : null;
}

/**
 * @param {D1Database | null | undefined} db
 * @param {{ now?: number, flagOn?: boolean }} [opts] `flagOn` para tests
 * @returns {Promise<TagSource>}
 */
export async function tagSourceFrom(db, { now = Date.now(), flagOn } = {}) {
	const on = flagOn ?? (await isFlagOn(db, 'etiquetas_db', { now }));
	if (!on || !db) return FILE;
	if (cache && cache.expires > now) return cache.value;
	/** @type {TagSource} */
	let value = FILE;
	try {
		const rawTags = await readDbRawTags(db);
		// Sin cambios: la misma lista (el mismo objeto), así los árboles y los posts ya
		// limpiados con ella se siguen usando (WeakMap por lista o por árbol).
		const prev = cache?.value;
		if (rawTags && prev?.fromDb && JSON.stringify(prev.rawTags) === JSON.stringify(rawTags))
			value = prev;
		else if (rawTags) value = { rawTags, fromDb: true };
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

/** @type {WeakMap<object, TagManager>} */
const managers = new WeakMap();
/** @type {TagManager | undefined} */
let fileManager;

/**
 * El árbol armado (`tagsFactory`) de una fuente, uno por lista (se arma sobre una copia). El del
 * archivo es el de siempre (`tagsFactory()`, que ya le agregó funciones a hardcodedTags).
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
