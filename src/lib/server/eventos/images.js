/**
 * Lo que queda de las imágenes que se suben al repo: las fichas de amigues (que todavía no son de
 * la base) suben su imagen a su carpeta del repo. Los eventos, el material, las series y los
 * perfiles usan la biblioteca de imágenes en R2 (src/lib/server/media/, docs/imagenes.md).
 */
import { toBase64 } from '$lib/utils/base64.js';
import { detectImageType, MAX_IMAGE_BYTES } from '$lib/utils/eventDraft.js';

export const POSTS_DIR = 'src/lib/posts/calendario';

/**
 * Validates the uploaded image. Returns its bytes and extension, or a message for the person.
 * @param {FormDataEntryValue|null} image
 * @returns {Promise<{bytes: Uint8Array, ext: 'jpg'|'png'|'webp', base64: string} | {error: string}>}
 */
export async function readUploadedImage(image) {
	if (!(image instanceof File) || image.size === 0) {
		return { error: 'Elegiste subir una imagen pero no llegó ningún archivo. Volvé a elegirla.' };
	}
	if (image.size > MAX_IMAGE_BYTES) {
		return { error: 'La imagen pesa más de 5 MB. Probá con una más liviana.' };
	}
	const bytes = new Uint8Array(await image.arrayBuffer());
	const ext = detectImageType(bytes);
	if (!ext) return { error: 'La imagen tiene que ser JPG, PNG o WEBP.' };
	return { bytes, ext, base64: toBase64(bytes) };
}
