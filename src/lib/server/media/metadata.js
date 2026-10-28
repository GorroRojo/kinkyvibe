/**
 * Sacarle a una imagen los datos ocultos que no hacen falta para verla (docs/imagenes.md): en un
 * JPEG, los segmentos Exif y XMP (APP1), IPTC (APP13) y los comentarios (COM); en un PNG, los
 * bloques eXIf, tEXt, zTXt, iTXt y tIME. Ahí pueden ir el lugar donde se sacó la foto (GPS), la
 * fecha, el modelo del celu o un nombre. Se hace en el servidor antes de calcular el hash, así lo
 * que se guarda y se sirve nunca los lleva, venga de donde venga la subida.
 *
 * Lo que hace falta para dibujarla queda: en un JPEG, JFIF (APP0), el perfil de color (APP2) y
 * Adobe (APP14); de Exif, solo la orientación (sin ella, una foto del celu se vería de costado).
 * Los demás tipos (WEBP, GIF, AVIF) y un archivo que no se entiende van tal cual.
 *
 * Sin dependencias: corre en el Worker, en Node y en vitest. Solo usa imports relativos.
 */

/** @param {Uint8Array} b @param {number} i */
const u16be = (b, i) => (b[i] << 8) | b[i + 1];
/** @param {Uint8Array} b @param {number} i */
const u32be = (b, i) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
/** @param {Uint8Array} b @param {number} i @param {string} s */
const ascii = (b, i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

/** Bloques de un PNG que son solo metadatos. */
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/**
 * La imagen sin metadatos (JPEG y PNG). Si no hay nada que sacar, o el archivo no se entiende,
 * devuelve los mismos bytes.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function stripImageMetadata(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length < 12) return bytes;
	try {
		if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return stripJpeg(bytes);
		if (bytes[0] === 0x89 && ascii(bytes, 1, 'PNG\r\n\x1a\n')) return stripPng(bytes);
	} catch {
		// Un archivo raro se guarda como llegó (el tipo ya lo validó sniffImage).
	}
	return bytes;
}

/**
 * Recorre los segmentos hasta el comienzo de los datos (SOS) y copia todo lo demás tal cual.
 * @param {Uint8Array} b
 */
function stripJpeg(b) {
	/** @type {Uint8Array[]} */
	const parts = [b.subarray(0, 2)];
	let orientation = 0;
	let dropped = false;
	let i = 2;
	while (i < b.length) {
		if (b[i] !== 0xff) return b;
		const marker = b[i + 1];
		// Relleno entre segmentos.
		if (marker === 0xff) {
			i++;
			continue;
		}
		// Marcadores sin largo.
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
			parts.push(b.subarray(i, i + 2));
			i += 2;
			continue;
		}
		if (marker === 0xd9 || i + 4 > b.length) break;
		const len = u16be(b, i + 2);
		if (len < 2 || i + 2 + len > b.length) return b;
		const end = i + 2 + len;
		if (marker === 0xda) {
			// SOS: desde acá son los datos de la imagen.
			parts.push(b.subarray(i));
			i = b.length;
			break;
		}
		const isExif = marker === 0xe1 && ascii(b, i + 4, 'Exif\0');
		const drop =
			marker === 0xe1 || // Exif o XMP
			marker === 0xed || // IPTC (Photoshop)
			marker === 0xfe; // comentario
		if (drop) {
			if (isExif && !orientation) orientation = exifOrientation(b.subarray(i + 10, end));
			dropped = true;
		} else {
			parts.push(b.subarray(i, end));
		}
		i = end;
	}
	if (i < b.length) parts.push(b.subarray(i));
	if (!dropped) return b;
	if (orientation > 1 && orientation <= 8) {
		// Después de JFIF (APP0), que tiene que ir primero, si está.
		const at = parts[1]?.[0] === 0xff && parts[1][1] === 0xe0 ? 2 : 1;
		parts.splice(at, 0, orientationSegment(orientation));
	}
	return concat(parts);
}

/**
 * La orientación (etiqueta 0x0112 del primer IFD) de un bloque TIFF de Exif, o 0.
 * @param {Uint8Array} t
 */
function exifOrientation(t) {
	if (t.length < 8) return 0;
	const le = t[0] === 0x49 && t[1] === 0x49;
	if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return 0;
	const u16 = (/** @type {number} */ k) => (le ? t[k] | (t[k + 1] << 8) : (t[k] << 8) | t[k + 1]);
	const u32 = (/** @type {number} */ k) =>
		le
			? (t[k] | (t[k + 1] << 8) | (t[k + 2] << 16) | (t[k + 3] << 24)) >>> 0
			: ((t[k] << 24) >>> 0) + ((t[k + 1] << 16) | (t[k + 2] << 8) | t[k + 3]);
	const ifd = u32(4);
	if (ifd + 2 > t.length) return 0;
	const count = u16(ifd);
	for (let n = 0; n < count; n++) {
		const e = ifd + 2 + n * 12;
		if (e + 12 > t.length) return 0;
		if (u16(e) === 0x0112) return u16(e + 8);
	}
	return 0;
}

/**
 * Un segmento Exif mínimo que solo dice la orientación.
 * @param {number} orientation 2..8
 */
function orientationSegment(orientation) {
	// APP1, largo 34: «Exif\0\0», cabecera TIFF (MM, 42, IFD en 8), una entrada y fin.
	// prettier-ignore
	return Uint8Array.from([
		0xff, 0xe1, 0x00, 0x22,
		0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
		0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
		0x00, 0x01,
		0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00
	]);
}

/**
 * Copia los bloques del PNG salvo los de metadatos.
 * @param {Uint8Array} b
 */
function stripPng(b) {
	/** @type {Uint8Array[]} */
	const parts = [b.subarray(0, 8)];
	let dropped = false;
	let i = 8;
	while (i + 12 <= b.length) {
		const len = u32be(b, i);
		const end = i + 12 + len;
		if (end > b.length) return b;
		const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
		if (PNG_DROP.has(type)) dropped = true;
		else parts.push(b.subarray(i, end));
		i = end;
		if (type === 'IEND') break;
	}
	if (i < b.length) parts.push(b.subarray(i));
	return dropped ? concat(parts) : b;
}

/** @param {Uint8Array[]} parts */
function concat(parts) {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}
