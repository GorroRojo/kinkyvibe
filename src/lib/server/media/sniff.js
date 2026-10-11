/**
 * Qué es un archivo, mirando sus bytes (nunca el nombre ni lo que dice el navegador): una imagen
 * (el tipo y, si se puede leer de la cabecera, el ancho y el alto) o un documento o un video de la
 * biblioteca (PDF, MP4, WebM, ODT, ODS, ODP). Sin dependencias: corre en el
 * Worker, en Node (el script de importación) y en vitest.
 *
 * Solo usa imports relativos.
 */

/**
 * @typedef {{ mime: import('../objects/types/imagen.js').IMAGE_MIMES[number], ext: string,
 *   width?: number, height?: number }} SniffedImage
 */

/** @param {Uint8Array} b @param {number} i */
const u16be = (b, i) => (b[i] << 8) | b[i + 1];
/** @param {Uint8Array} b @param {number} i */
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
/** @param {Uint8Array} b @param {number} i */
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
/** @param {Uint8Array} b @param {number} i */
const u32be = (b, i) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
/** @param {Uint8Array} b @param {number} i @param {string} s */
const ascii = (b, i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

/**
 * @param {number | undefined} width
 * @param {number | undefined} height
 */
function dims(width, height) {
	return width && height && width > 0 && height > 0 ? { width, height } : {};
}

/**
 * Ancho y alto de un JPEG (el primer marcador SOF).
 * @param {Uint8Array} b
 */
function jpegSize(b) {
	let i = 2;
	while (i + 9 < b.length) {
		if (b[i] !== 0xff) {
			i++;
			continue;
		}
		const marker = b[i + 1];
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			i += 2;
			continue;
		}
		const len = u16be(b, i + 2);
		// SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
		if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
			return dims(u16be(b, i + 7), u16be(b, i + 5));
		}
		if (len < 2) break;
		i += 2 + len;
	}
	return {};
}

/**
 * Ancho y alto de un WEBP (VP8, VP8L o VP8X).
 * @param {Uint8Array} b
 */
function webpSize(b) {
	if (ascii(b, 12, 'VP8X') && b.length >= 30) return dims(u24le(b, 24) + 1, u24le(b, 27) + 1);
	if (ascii(b, 12, 'VP8L') && b.length >= 25) {
		const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
		return dims((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
	}
	if (ascii(b, 12, 'VP8 ') && b.length >= 30) {
		return dims(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
	}
	return {};
}

/**
 * El tipo de imagen (y sus medidas si se pueden leer), o `null` si no es una imagen que se acepte.
 *
 * @param {Uint8Array} b
 * @returns {SniffedImage | null}
 */
export function sniffImage(b) {
	if (!(b instanceof Uint8Array) || b.length < 12) return null;
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
		return { mime: 'image/jpeg', ext: 'jpg', ...jpegSize(b) };
	}
	if (b[0] === 0x89 && ascii(b, 1, 'PNG\r\n\x1a\n')) {
		return {
			mime: 'image/png',
			ext: 'png',
			...(b.length >= 24 && ascii(b, 12, 'IHDR') ? dims(u32be(b, 16), u32be(b, 20)) : {})
		};
	}
	if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) {
		return { mime: 'image/webp', ext: 'webp', ...webpSize(b) };
	}
	if (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) {
		return { mime: 'image/gif', ext: 'gif', ...dims(u16le(b, 6), u16le(b, 8)) };
	}
	if (ascii(b, 4, 'ftyp') && (ascii(b, 8, 'avif') || ascii(b, 8, 'avis'))) {
		return { mime: 'image/avif', ext: 'avif' };
	}
	return null;
}

/**
 * @typedef {{ kind: 'documento' | 'video',
 *   mime: import('../objects/types/archivo.js').FILE_MIMES[number], ext: string }} SniffedFile
 */

/** Marcas de un MP4 (`ftyp`) que se aceptan como video. Las de imagen (AVIF, HEIC) no. */
const MP4_BRANDS = new Set([
	'isom',
	'iso2',
	'iso4',
	'iso5',
	'iso6',
	'mp41',
	'mp42',
	'avc1',
	'M4V ',
	'dash'
]);

/** Los tipos de OpenDocument que se aceptan, por su entrada `mimetype`. */
const ODF = Object.freeze({
	'application/vnd.oasis.opendocument.text': 'odt',
	'application/vnd.oasis.opendocument.spreadsheet': 'ods',
	'application/vnd.oasis.opendocument.presentation': 'odp'
});

/**
 * Un OpenDocument: un zip cuya PRIMERA entrada se llama `mimetype`, va sin comprimir y dice el
 * tipo (así lo pide la norma ODF). Cualquier otro zip (un .docx, un .zip con lo que sea) no.
 * @param {Uint8Array} b
 */
function sniffOpenDocument(b) {
	if (b.length < 38 || !(b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04))
		return null;
	const method = u16le(b, 8);
	const size = b[18] | (b[19] << 8) | (b[20] << 16) | (b[21] << 24);
	const nameLen = u16le(b, 26);
	const extraLen = u16le(b, 28);
	if (method !== 0 || nameLen !== 8 || !ascii(b, 30, 'mimetype')) return null;
	const start = 30 + nameLen + extraLen;
	if (size <= 0 || size > 100 || start + size > b.length) return null;
	const mime = new TextDecoder().decode(b.subarray(start, start + size));
	const ext = /** @type {Record<string, string>} */ (ODF)[mime];
	return ext ? /** @type {SniffedFile} */ ({ kind: 'documento', mime, ext }) : null;
}

/**
 * Un documento o un video que se acepta en la biblioteca (PDF, MP4, WebM, ODT, ODS, ODP), por
 * sus bytes; `null` si no es ninguno. HTML, SVG, scripts y zips que no son OpenDocument, no.
 *
 * @param {Uint8Array} b
 * @returns {SniffedFile | null}
 */
export function sniffDocument(b) {
	if (!(b instanceof Uint8Array) || b.length < 12) return null;
	if (ascii(b, 0, '%PDF-')) return { kind: 'documento', mime: 'application/pdf', ext: 'pdf' };
	if (ascii(b, 4, 'ftyp')) {
		const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
		return MP4_BRANDS.has(brand) ? { kind: 'video', mime: 'video/mp4', ext: 'mp4' } : null;
	}
	// WebM: cabecera EBML con DocType «webm» (en los primeros bytes).
	if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
		const head = b.subarray(0, Math.min(b.length, 64));
		for (let i = 4; i + 6 <= head.length; i++) {
			// Elemento DocType (0x4282), largo 0x84 (4 bytes), «webm».
			if (head[i] === 0x42 && head[i + 1] === 0x82 && ascii(head, i + 3, 'webm')) {
				return { kind: 'video', mime: 'video/webm', ext: 'webm' };
			}
		}
		return null;
	}
	return sniffOpenDocument(b);
}

/**
 * Qué es un archivo para la biblioteca: una imagen ({@link sniffImage}) o un documento o video
 * ({@link sniffDocument}); `null` si no se acepta.
 *
 * @param {Uint8Array} b
 * @returns {(SniffedImage & { kind: 'imagen' }) | SniffedFile | null}
 */
export function sniffMedia(b) {
	const image = sniffImage(b);
	if (image) return { kind: 'imagen', ...image };
	return sniffDocument(b);
}

/**
 * SHA-256 en hex de los bytes (Web Crypto: Worker, Node ≥ 20 y vitest).
 * @param {Uint8Array} bytes
 */
export async function sha256Hex(bytes) {
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * La clave en R2 de un archivo: por contenido, así el mismo archivo es siempre la misma clave y
 * se puede guardar en caché para siempre.
 * @param {string} hash sha-256 en hex
 * @param {string} ext
 */
export const mediaKey = (hash, ext) => `img/${hash}.${ext}`;

/**
 * La clave en R2 de un documento o un video (tipo `archivo`), también por contenido.
 * @param {string} hash sha-256 en hex
 * @param {string} ext
 */
export const fileKey = (hash, ext) => `file/${hash}.${ext}`;

/** La dirección pública de una clave. @param {string} key */
export const mediaPath = (key) => `/media/${key}`;
