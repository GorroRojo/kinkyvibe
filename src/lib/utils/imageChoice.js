/**
 * Lo que manda un formulario con el selector de imágenes (ImagePicker.svelte) en su campo
 * oculto (`imageId` por defecto), y cómo lo lee el servidor:
 * - `''`: no se tocó (la imagen queda como estaba);
 * - `'none'`: se sacó la imagen;
 * - un número: el id de la imagen de la biblioteca elegida.
 *
 * Sin dependencias: corre en el navegador, en el servidor y en vitest.
 */

/** @typedef {{ action: 'keep' } | { action: 'remove' } | { action: 'set', id: number }} ImageChoice */

/** El nombre del campo oculto por defecto. */
export const IMAGE_FIELD = 'imageId';

/**
 * El valor del campo oculto.
 * @param {{ id: number } | null | undefined} value la imagen elegida
 * @param {boolean} touched si la persona cambió algo
 */
export function imageFieldValue(value, touched) {
	if (!touched) return '';
	return value ? String(value.id) : 'none';
}

/**
 * Lee el campo del formulario.
 * @param {unknown} raw
 * @returns {ImageChoice}
 */
export function readImageChoice(raw) {
	const v = typeof raw === 'string' ? raw.trim() : '';
	if (v === 'none') return { action: 'remove' };
	if (/^[1-9]\d{0,15}$/.test(v)) {
		const id = Number(v);
		if (Number.isSafeInteger(id)) return { action: 'set', id };
	}
	return { action: 'keep' };
}

/**
 * La dirección para buscar en la biblioteca.
 * @param {string} q
 */
export const searchHref = (q) => `/imagenes?q=${encodeURIComponent(q.trim())}`;

/**
 * La dirección de las imágenes «De este evento» (`evento:<dirección>`, `perfil:<dirección>`…).
 * @param {string} target
 */
export const contextHref = (target) => `/imagenes?para=${encodeURIComponent(target)}`;
