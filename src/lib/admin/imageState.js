/**
 * El estado de la imagen que se sube al repo en el editor de las fichas de amigues (ImageSection):
 * la imagen elegida, con su URL local para la miniatura. Los eventos, el material, las series y
 * los perfiles usan el selector de imágenes de la biblioteca (ImagePicker, docs/imagenes.md).
 *
 * Sin imports de Svelte: corre en el navegador y en vitest. Las funciones de URL se pasan
 * (`urls`) para poder probarlas sin navegador.
 */
import { checkImageFile } from '$lib/utils/imageUpload.js';

/**
 * @typedef {object} Upload
 * @prop {string} url URL local (`blob:`) de la imagen elegida, para la miniatura ('' = ninguna)
 * @prop {string} name nombre del archivo
 * @prop {'jpg'|'png'|'webp'|''} ext
 * @prop {string} error por qué no se puede usar la última que se eligió
 */

/** @typedef {{ createObjectURL: (file: any) => string, revokeObjectURL: (url: string) => void }} Urls */

/** @returns {Upload} */
export const emptyUpload = () => ({ url: '', name: '', ext: '', error: '' });

/**
 * Se eligió un archivo (o se canceló el diálogo: `file` vacío).
 * @param {Upload} prev
 * @param {{ name: string, type: string, size: number } | null | undefined} file
 * @param {number} maxBytes
 * @param {Urls} [urls]
 * @returns {{ upload: Upload, clearInput: boolean, chosen: boolean }} `clearInput`: vaciar el
 *   `<input type="file">` (la imagen no sirve); `chosen`: hay una imagen nueva elegida. Con un
 *   error, la imagen que ya estaba elegida sigue (como antes).
 */
export function chooseImage(prev, file, maxBytes, urls = globalThis.URL) {
	if (!file) return { upload: { ...prev, error: '' }, clearInput: false, chosen: false };
	const check = checkImageFile(file, maxBytes);
	if (check.error)
		return { upload: { ...prev, error: check.error }, clearInput: true, chosen: false };
	if (prev.url) urls.revokeObjectURL(prev.url);
	return {
		upload: { url: urls.createObjectURL(file), name: file.name, ext: check.ext, error: '' },
		clearInput: false,
		chosen: true
	};
}

/**
 * «No cambiar la imagen»: suelta la URL local y vuelve a vacío.
 * @param {Upload} prev
 * @param {Urls} [urls]
 * @returns {Upload}
 */
export function clearImage(prev, urls = globalThis.URL) {
	if (prev.url) urls.revokeObjectURL(prev.url);
	return emptyUpload();
}
