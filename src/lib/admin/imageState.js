/**
 * El estado de la imagen en los editores del panel (evento nuevo, Editar y el editor de
 * contenido): la imagen elegida (con su URL local para la miniatura) y, en los eventos, qué
 * `featured` se guarda y si hay que preguntar «¿para todas las ediciones o solo esta?».
 * Antes estaba copiado en /admin/eventos/nuevo, PostEditor y ContentEditor; ImageSection lo usa.
 *
 * Sin imports de Svelte: corre en el navegador y en vitest. Las funciones de URL se pasan
 * (`urls`) para poder probarlas sin navegador.
 */
import { checkImageFile } from '$lib/utils/imageUpload.js';
import { replacementAssetName, uploadScope } from '$lib/utils/sharedImage.js';

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

/** El mensaje cuando falta elegir para qué ediciones es la imagen nueva. */
export const SCOPE_PROBLEM =
	'Elegí si la imagen nueva es para todas las ediciones del evento o solo para esta.';

/**
 * Crear o duplicar un evento: qué imagen se usa (la del original, una nueva o ninguna).
 * @param {object} o
 * @param {'keep'|'upload'|'none'} o.mode
 * @param {string} o.sourceFeatured el `featured` del original ('' = sin imagen)
 * @param {boolean} o.sourceShared la del original es compartida (`src/lib/assets`)
 * @param {string | undefined} o.sourceUrl la URL de la imagen del original
 * @param {Upload} o.upload
 * @param {''|'todas'|'esta'} o.imageScope
 */
export function newEventImage({
	mode,
	sourceFeatured,
	sourceShared,
	sourceUrl,
	upload,
	imageScope
}) {
	const askScope = sourceShared && mode === 'upload';
	const scope = uploadScope(sourceFeatured, askScope ? imageScope : '');
	const sharedNewName =
		askScope && upload.ext ? replacementAssetName(sourceFeatured, upload.ext) : '';
	return {
		askScope,
		scope,
		sharedNewName,
		/** el `featured` de una imagen nueva (`buildEventMarkdown`) */
		uploadFeatured: scope === 'todas' ? sharedNewName : 1,
		preview: mode === 'upload' ? upload.url : mode === 'keep' ? sourceUrl : undefined,
		problem: askScope && !imageScope ? SCOPE_PROBLEM : ''
	};
}

/**
 * Editar un evento: la imagen que tiene y, si se eligió una nueva, con qué `featured` queda.
 * @param {object} o
 * @param {{ featured?: string, shared?: boolean, nextNumber?: number } | null | undefined} o.image
 *   la de `data.image`
 * @param {Upload} o.upload
 * @param {''|'todas'|'esta'} o.imageScope
 */
export function editEventImage({ image, upload, imageScope }) {
	const featured = image?.featured ?? '';
	const askScope = Boolean(image?.shared && upload.ext);
	const scope = uploadScope(featured, askScope ? imageScope : '');
	const sharedNewName = askScope ? replacementAssetName(featured, upload.ext) : '';
	return {
		askScope,
		scope,
		sharedNewName,
		/** `featured` después de guardar con la imagen nueva ('' = no cambia) */
		newFeatured: !upload.ext
			? ''
			: scope === 'todas'
				? sharedNewName
				: String(image?.nextNumber ?? 1),
		problem: askScope && !imageScope ? SCOPE_PROBLEM : ''
	};
}
