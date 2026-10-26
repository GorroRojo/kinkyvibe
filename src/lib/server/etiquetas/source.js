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
 *   (`tagManagerOf`, el mismo árbol compartido que `currentSiteTags()`: $lib/utils/siteTags.js) y
 *   la lista se puede mandar a la página tal cual.
 */
import { fallbackTagList } from '$lib/utils/tagFallback.js';
import { getDB, logDBError } from '$lib/server/db';
import { FLAG_CACHE_MS } from '$lib/server/flags.js';
import { fileSiteTags, siteTagTree, useSiteTags } from '$lib/utils/siteTags.js';
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

/** Cuándo empezó la renovación en camino, o `null` ({@link refreshTagSourceAhead}). */
/** @type {number | null} */
let refreshingSince = null;

/** Sube con cada `clearTagSourceCache`: una lectura que empezó antes no se guarda. */
let generation = 0;

/** Olvida lo leído de la base (al guardar desde el panel, y en los tests). */
export function clearTagSourceCache() {
	cache = null;
	refreshingSince = null;
	generation++;
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
	return readAndCache(db, now);
}

/**
 * Lo que se renueva antes de vencer (ms): lo leído hace más de `FLAG_CACHE_MS - TAG_REFRESH_AHEAD_MS`
 * se vuelve a leer sin esperar ({@link refreshTagSourceAhead}).
 */
export const TAG_REFRESH_AHEAD_MS = 10_000;

/**
 * Cómo está lo recordado: `fresh` (sirve y no hay que hacer nada), `aging` (sirve, pero le quedan
 * menos de {@link TAG_REFRESH_AHEAD_MS}) o `stale` (venció o no hay: el próximo pedido espera a la
 * base para leerlo).
 * @param {number} [now]
 * @returns {'fresh' | 'aging' | 'stale'}
 */
export function tagSourceFreshness(now = Date.now()) {
	if (!cache || cache.expires <= now) return 'stale';
	return cache.expires - now <= TAG_REFRESH_AHEAD_MS ? 'aging' : 'fresh';
}

/**
 * Renueva lo recordado antes de que venza, sin esperar: el pedido de ahora usa lo que ya hay (que
 * todavía vale) y la lectura nueva sale con las primeras consultas del pedido (con las tandas
 * automáticas, en la misma ida). Así, mientras haya visitas, ningún pedido espera a la base por el
 * árbol; y nunca se usa uno leído hace más de `FLAG_CACHE_MS`, como antes. Solo si le queda poco
 * (`aging`), una renovación a la vez por isolate; si la lectura falla, queda lo que había (vence
 * como siempre).
 *
 * @param {D1Database | null | undefined} db
 * @param {{ now?: number, waitUntil?: (task: Promise<unknown>) => void }} [opts] `waitUntil`: el
 *   del pedido, para que la lectura termine aunque la respuesta ya haya salido
 */
export function refreshTagSourceAhead(db, { now = Date.now(), waitUntil } = {}) {
	if (!db || tagSourceFreshness(now) !== 'aging') return;
	// Una renovación que nunca terminó (un pedido cortado) no frena las siguientes para siempre.
	if (refreshingSince !== null && now - refreshingSince < TAG_REFRESH_AHEAD_MS) return;
	refreshingSince = now;
	const task = readAndCache(db, now, { keepOnError: true }).finally(() => {
		refreshingSince = null;
	});
	waitUntil?.(task);
}

/**
 * Lee el árbol de la base y lo recuerda {@link FLAG_CACHE_MS} desde `now`. Nunca tira: sin poder
 * leer, el árbol de respaldo (o, con `keepOnError`, lo que ya estaba recordado, sin tocarlo).
 * @param {D1Database} db
 * @param {number} now
 * @param {{ keepOnError?: boolean }} [opts]
 * @returns {Promise<TagSource>}
 */
async function readAndCache(db, now, { keepOnError = false } = {}) {
	const gen = generation;
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
		if (keepOnError && cache) return cache.value;
	}
	// Si el panel guardó mientras se leía, lo leído puede ser de antes: se usa, pero no se recuerda.
	if (gen === generation) cache = { value, expires: now + FLAG_CACHE_MS };
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

/**
 * El árbol armado (`tagsFactory`) de una fuente, uno por lista y compartido (de solo lectura) con
 * `currentSiteTags()` y los stores: `siteTagTree` en $lib/utils/siteTags.js. El del respaldo es el
 * de siempre (`fileSiteTags()`, sobre ./tagFallback.js).
 *
 * @param {TagSource} source
 * @returns {TagManager}
 */
export function tagManagerOf(source) {
	return source.fromDb ? siteTagTree(source.rawTags) : fileSiteTags();
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
