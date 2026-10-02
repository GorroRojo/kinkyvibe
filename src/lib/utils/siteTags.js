/**
 * El árbol de etiquetas que usan las páginas (los stores `tagManager` y `wikiTagManager`).
 * Por defecto, el del archivo (src/lib/utils/hardcodedTags.js). Con el interruptor `etiquetas_db`
 * prendido, el layout raíz recibe el de la base (`data.siteTags`, docs/etiquetas.md) y lo pone acá.
 *
 * `tagsFactory` les agrega funciones a los objetos que recibe: cada árbol se arma sobre una copia,
 * así la lista de la base sigue siendo datos (se manda en la página tal cual).
 */
import tagsFactory from './tags.js';

/** @typedef {import('svelte/store').Writable<TagManager>} TagStore */

/** @type {readonly Record<string, unknown>[] | null} La lista de la base en uso, o null (archivo). */
let current = null;

/**
 * Un árbol nuevo (se puede modificar) con las etiquetas en uso.
 *
 * @returns {TagManager}
 */
export function freshSiteTags() {
	return current ? tagsFactory(/** @type {any} */ (structuredClone(current))) : tagsFactory();
}

/**
 * Cambia las etiquetas en uso y actualiza los stores, solo si cambiaron. Con `null` vuelve al
 * archivo (por ejemplo, si se apagó el interruptor).
 *
 * @param {readonly Record<string, unknown>[] | null | undefined} rawTags
 * @param {readonly TagStore[]} stores
 */
export function useSiteTags(rawTags, stores) {
	const next = rawTags ?? null;
	if (next === current) return;
	current = next;
	for (const s of stores) s.set(freshSiteTags());
}
