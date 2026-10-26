/**
 * El árbol de etiquetas en uso: UNA sola fuente para todo el sitio (docs/etiquetas.md).
 * La lista de la base (el interruptor `etiquetas_db` quedó fijo); si no hay base o no tiene
 * etiquetas, el árbol de respaldo (./tagFallback.js: vacío; el archivo de etiquetas se borró con
 * los .md, decisión 0032):
 *
 * - en el servidor, `hooks.server.js` la pone al empezar cada pedido (`setSiteTagList`, desde
 *   `siteTagSource`, que la recuerda 30 s por isolate: todos los pedidos de un isolate ven la misma);
 * - en el navegador, el layout raíz la recibe (`data.siteTags`) y la pone con `useSiteTags`, que
 *   además actualiza los stores `tagManager` y `wikiTagManager`.
 *
 * Todo lo que necesita el árbol lo pide acá (`currentSiteTags()`, `currentSiteTagList()`): la
 * limpieza de etiquetas de cada post (`canonicalTags`), los editores del panel (`adminTags.js`),
 * las series, el ingreso, los avisos…, así siguen al interruptor sin excepciones.
 *
 * `tagsFactory` les agrega funciones a los objetos que recibe: cada árbol se arma sobre una copia,
 * así la lista de la base sigue siendo datos (se manda en la página tal cual).
 *
 * Un solo árbol por lista (`siteTagTree`): `currentSiteTags()`, los stores y `tagManagerOf`
 * ($lib/server/etiquetas/source.js) comparten el mismo, de solo lectura. Antes, un isolate nuevo lo
 * armaba 3 o 4 veces en su primer pedido. Para modificar uno, `freshSiteTags()`.
 */
import { fallbackTagList } from './tagFallback.js';
import tagsFactory from './tags.js';

/** @typedef {import('svelte/store').Writable<TagManager>} TagStore */

/** @type {readonly Record<string, unknown>[] | null} La lista de la base en uso, o null (archivo). */
let current = null;
/** @type {WeakMap<object, TagManager>} El árbol (de solo lectura) de cada lista, armado la primera vez que se pide. */
const trees = new WeakMap();
/** @type {TagManager | undefined} */
let fileTree;

/**
 * El árbol compartido de una lista de la base: el mismo objeto para la misma lista (se arma una
 * vez, sobre una copia). NO se modifica (para eso, `freshSiteTags`).
 *
 * @param {readonly Record<string, unknown>[]} rawTags
 * @returns {TagManager}
 */
export function siteTagTree(rawTags) {
	let tree = trees.get(rawTags);
	if (!tree) {
		tree = tagsFactory(/** @type {any} */ (structuredClone(rawTags)));
		trees.set(rawTags, tree);
	}
	return tree;
}

/**
 * Un árbol nuevo (se puede modificar) con las etiquetas en uso.
 *
 * @returns {TagManager}
 */
export function freshSiteTags() {
	return current ? tagsFactory(/** @type {any} */ (structuredClone(current))) : tagsFactory();
}

/**
 * El árbol en uso, compartido: NO se modifica (para eso, `freshSiteTags`). Es el mismo objeto
 * mientras no cambie la lista, así quien guarda cosas por árbol (WeakMap) no las recalcula.
 *
 * @returns {TagManager}
 */
export function currentSiteTags() {
	return current ? siteTagTree(current) : fileSiteTags();
}

/** El árbol del archivo, compartido (no se modifica), aunque la base esté en uso. */
export function fileSiteTags() {
	return (fileTree ??= tagsFactory());
}

/**
 * La lista en uso, como la del archivo (para lo que lee la lista y no el árbol).
 *
 * @returns {ReadonlyArray<{ id: string } & Record<string, any>>}
 */
export function currentSiteTagList() {
	return /** @type {any} */ (current) ?? fallbackTagList();
}

/** ¿Se está usando la lista de la base? */
export function siteTagsFromDb() {
	return current !== null;
}

/**
 * Cambia la lista en uso. Con `null` vuelve al archivo (por ejemplo, si se apagó el interruptor).
 *
 * @param {readonly Record<string, unknown>[] | null | undefined} rawTags
 * @returns {boolean} si cambió
 */
export function setSiteTagList(rawTags) {
	const next = rawTags ?? null;
	if (next === current) return false;
	current = next;
	return true;
}

/**
 * Cambia las etiquetas en uso y actualiza los stores, solo si cambiaron. Todos los stores reciben
 * el árbol compartido (`currentSiteTags()`): nadie modifica el valor de `tagManager` ni de
 * `wikiTagManager` (la Kinkipedia filtra sobre un `freshSiteTags()` y lo pone con `update`).
 *
 * @param {readonly Record<string, unknown>[] | null | undefined} rawTags
 * @param {readonly TagStore[]} stores
 */
export function useSiteTags(rawTags, stores) {
	if (!setSiteTagList(rawTags)) return;
	const tree = currentSiteTags();
	for (const s of stores) s.set(tree);
}
