/**
 * El árbol de etiquetas en uso: UNA sola fuente para todo el sitio (docs/etiquetas.md).
 * Por defecto, el del archivo (src/lib/utils/hardcodedTags.js). Con el interruptor `etiquetas_db`
 * prendido, la lista de la base:
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
 */
import hardcodedTags from './hardcodedTags.js';
import tagsFactory from './tags.js';

/** @typedef {import('svelte/store').Writable<TagManager>} TagStore */

/** @type {readonly Record<string, unknown>[] | null} La lista de la base en uso, o null (archivo). */
let current = null;
/** @type {TagManager | null} El árbol (de solo lectura) de `current`, armado la primera vez que se pide. */
let currentTree = null;
/** @type {TagManager | undefined} */
let fileTree;

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
	return current ? (currentTree ??= freshSiteTags()) : fileSiteTags();
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
	return /** @type {any} */ (current) ?? hardcodedTags;
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
	currentTree = null;
	return true;
}

/**
 * Cambia las etiquetas en uso y actualiza los stores, solo si cambiaron.
 *
 * @param {readonly Record<string, unknown>[] | null | undefined} rawTags
 * @param {readonly TagStore[]} stores
 */
export function useSiteTags(rawTags, stores) {
	if (!setSiteTagList(rawTags)) return;
	for (const s of stores) s.set(freshSiteTags());
}
