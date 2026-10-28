/**
 * Ayudas chicas para armar SQL de D1. Sin dependencias.
 */

/** D1 acepta hasta 100 parámetros por sentencia. */
export const D1_MAX_PARAMS = 100;

/**
 * Los `?` de una lista `IN (…)`: `inList(['a', 'b'])` da `'?, ?'`. Los valores van aparte, en el
 * `bind`, en el mismo orden. Con una lista vacía da `''` (y `IN ()` es un error de SQL): quien
 * llama no consulta si no hay nada que buscar.
 * @param {readonly unknown[]} values
 * @returns {string}
 */
export const inList = (values) => values.map(() => '?').join(', ');
