/**
 * Documentos y videos de la biblioteca, del lado del navegador (docs/imagenes.md): qué se puede
 * elegir, el límite de peso, la dirección para buscar con filtro por tipo y el enlace que se pone
 * en un texto. El servidor vuelve a revisar todo (por los bytes, src/lib/server/media/sniff.js).
 *
 * Sin dependencias: corre en el navegador, en el servidor y en vitest.
 */

/**
 * Peso máximo de un documento o un video. El archivo llega entero al Worker (se lee para calcular
 * su hash y su tipo), así que tiene que entrar holgado en la memoria del Worker (128 MB) y en el
 * límite de un pedido de Cloudflare (100 MB en los planes Free y Pro). Los archivos del material
 * miden hasta 11,5 MB.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Lo que ofrece el selector de archivos del navegador. */
export const DOCUMENT_ACCEPT =
	'application/pdf,video/mp4,video/webm,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation,.pdf,.mp4,.webm,.odt,.ods,.odp';

/** Los filtros por tipo de la biblioteca (`?tipo=`). */
export const LIBRARY_KINDS = Object.freeze([
	{ id: 'todo', label: 'Todo' },
	{ id: 'imagen', label: 'Imágenes' },
	{ id: 'documento', label: 'Documentos' },
	{ id: 'video', label: 'Videos' }
]);

/** @param {unknown} v @returns {'todo' | 'imagen' | 'documento' | 'video' | null} */
export function libraryKind(v) {
	return v === 'todo' || v === 'imagen' || v === 'documento' || v === 'video' ? v : null;
}

const EXTENSIONS = /\.(pdf|mp4|webm|odt|ods|odp)$/i;

/** @param {number} n */
const mb = (n) => (n / 1024 / 1024).toFixed(1).replace('.', ',');

/** Por qué no se puede subir un archivo de la biblioteca (o `''` si se puede).
 * @param {number} size
 */
export function fileSizeProblem(size) {
	return size > MAX_FILE_BYTES
		? `El archivo pesa ${mb(size)} MB. El máximo es ${MAX_FILE_BYTES / 1024 / 1024} MB: achicalo (por ejemplo, exportando el PDF con menos calidad) o subilo a otro lado y poné el link.`
		: '';
}

/**
 * Antes de subir: tipo (por la extensión o lo que dice el navegador; el servidor mira los bytes)
 * y peso.
 * @param {{ name: string, type?: string, size: number }} file
 */
export function documentPickProblem(file) {
	if (!file.size) return 'El archivo está vacío.';
	const okType =
		EXTENSIONS.test(file.name) || DOCUMENT_ACCEPT.split(',').includes(String(file.type ?? ''));
	if (!okType) return 'Elegí un PDF, un video MP4 o WebM, o un documento ODT, ODS u ODP.';
	return fileSizeProblem(file.size);
}

/**
 * La dirección para buscar en la biblioteca con un filtro por tipo.
 * @param {string} q
 * @param {string} kind
 */
export const libraryHref = (q, kind) =>
	`/imagenes?q=${encodeURIComponent(q.trim())}&tipo=${encodeURIComponent(kind)}`;

/**
 * El enlace en markdown a algo de la biblioteca: `[Nombre](/media/…)` (corchetes y saltos de
 * línea del nombre, escapados o fuera, para no romper el enlace).
 * @param {{ title: string, url: string }} item
 */
export function libraryLink(item) {
	const name = String(item.title ?? '')
		.replace(/\s+/g, ' ')
		.replace(/([[\]\\])/g, '\\$1')
		.trim();
	return `[${name || 'Archivo'}](${item.url})`;
}

/**
 * Suma un enlace al final de un texto, en su propio párrafo.
 * @param {string} body
 * @param {string} markdown
 */
export function appendParagraph(body, markdown) {
	const text = String(body ?? '').replace(/\s+$/, '');
	return text ? `${text}\n\n${markdown}\n` : `${markdown}\n`;
}
