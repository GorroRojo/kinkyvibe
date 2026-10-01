/**
 * Revisión de la imagen que alguien elige en los editores del panel (evento nuevo, Editar y el
 * editor de contenido) antes de mandarla: tipo y peso. El servidor vuelve a revisar todo.
 *
 * Sin imports de Svelte: corre en el navegador y en vitest.
 */

/** Tipos de imagen que aceptan los editores (los mismos del `accept` de los inputs). */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * @param {{ type: string, size: number }} file
 * @param {number} maxBytes
 * @returns {{ error: string, ext: 'jpg'|'png'|'webp'|'' }} `error` vacío = se puede usar
 */
export function checkImageFile(file, maxBytes) {
	if (!IMAGE_TYPES.includes(file.type))
		return { error: 'La imagen tiene que ser JPG, PNG o WEBP.', ext: '' };
	if (file.size > maxBytes)
		return {
			error: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo es ${
				maxBytes / 1024 / 1024
			} MB.`,
			ext: ''
		};
	return {
		error: '',
		ext: file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
	};
}
