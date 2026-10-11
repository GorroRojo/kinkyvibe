/**
 * El árbol de etiquetas cuando no hay otro (sin base, o con la base sin etiquetas): vacío. Antes
 * era el archivo src/lib/utils/hardcodedTags.js, que se borró con los .md (decisión 0032): las
 * etiquetas viven solo en la base. Las pruebas ponen acá el árbol de la semilla de contenido
 * (src/tests/setup.js), que es el que tenía ese archivo.
 *
 * Sin dependencias: lo usan ./tags.js y ./siteTags.js.
 */

/**
 * Dónde se guarda: en `globalThis` (con un símbolo propio), así lo que ponen las pruebas sigue
 * valiendo después de `vi.resetModules()`, que vuelve a cargar este módulo.
 */
const KEY = Symbol.for('kinkyvibe.fallbackTagList');
/** @type {Array<Record<string, any>>} */
const EMPTY = [];

/**
 * El árbol de respaldo (la lista que espera `tagsFactory`).
 * @returns {Array<Record<string, any>>}
 */
export const fallbackTagList = () => /** @type {any} */ (globalThis)[KEY] ?? EMPTY;

/**
 * Cambia el árbol de respaldo (solo las pruebas).
 * @param {Array<Record<string, any>>} list
 */
export function setFallbackTagList(list) {
	/** @type {any} */ (globalThis)[KEY] = list;
}
