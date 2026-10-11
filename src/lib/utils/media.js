/**
 * Direcciones de la biblioteca de imágenes (R2, docs/imagenes.md). Sin dependencias: corre en el
 * navegador, en el servidor y en vitest.
 */

/**
 * ¿Es la dirección de una imagen de la biblioteca (`/media/img/<sha-256>.<ext>`)? Las lecturas de
 * la base ponen esa dirección en `featured` cuando el post tiene su edge `portada`; si no,
 * `featured` sigue siendo la imagen vieja del repo (número o archivo de src/lib/assets).
 * @param {unknown} value
 * @returns {boolean}
 */
export const isMediaPath = (value) =>
	typeof value === 'string' && /^\/media\/img\/[0-9a-f]{64}\.[a-z]{3,4}$/.test(value);

/**
 * ¿Es una imagen de la biblioteca del sitio público, con la dirección entera
 * (`https://kinkyvibe.ar/media/img/<sha-256>.<ext>`)? Las usan las copias de eventos reales del
 * modo demo (src/lib/server/demo/realEvents.js, docs/demo.md): el preview no tiene esas imágenes
 * en su R2, así que la copia apunta a la del sitio público y se muestra tal cual. Solo https y solo
 * de kinkyvibe.ar.
 * @param {unknown} value
 * @returns {boolean}
 */
export const isPublicMediaUrl = (value) =>
	typeof value === 'string' &&
	/^https:\/\/kinkyvibe\.ar\/media\/img\/[0-9a-f]{64}\.[a-z]{3,4}$/.test(value);
