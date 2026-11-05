/**
 * Sacarle a una imagen los datos ocultos que no hacen falta para verla (docs/imagenes.md): en un
 * JPEG, los segmentos Exif y XMP (APP1), IPTC (APP13) y los comentarios (COM); en un PNG, los
 * bloques eXIf, tEXt, zTXt, iTXt y tIME; en un WEBP, los bloques EXIF y XMP; en un AVIF, el
 * contenido de los ítems Exif y XMP. Ahí pueden ir el lugar donde se sacó la foto (GPS), la
 * fecha, el modelo del celu o un nombre. Se hace en el servidor antes de calcular el hash, así lo
 * que se guarda y se sirve nunca los lleva, venga de donde venga la subida.
 *
 * Lo que hace falta para dibujarla queda: en un JPEG, JFIF (APP0), el perfil de color (APP2) y
 * Adobe (APP14); de Exif, solo la orientación (sin ella, una foto del celu se vería de costado),
 * también en un WEBP. En un AVIF la orientación va en sus propias cajas (`irot`/`imir`), que no se
 * tocan; sus ítems Exif y XMP se pisan con ceros en el mismo lugar (sacarlos obligaría a
 * reescribir las posiciones de todo el archivo), así que mide lo mismo y se lee igual.
 * Un GIF y un archivo que no se entiende van tal cual.
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
 * La imagen sin metadatos (JPEG, PNG, WEBP y AVIF). Si no hay nada que sacar, o el archivo no se
 * entiende, devuelve los mismos bytes.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function stripImageMetadata(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length < 12) return bytes;
	try {
		if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return stripJpeg(bytes);
		if (bytes[0] === 0x89 && ascii(bytes, 1, 'PNG\r\n\x1a\n')) return stripPng(bytes);
		if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return stripWebp(bytes);
		if (ascii(bytes, 4, 'ftyp')) return stripAvif(bytes);
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

/** @param {Uint8Array} b @param {number} i */
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** @param {number} n */
const u32leBytes = (n) =>
	Uint8Array.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

/** Bits de `VP8X` que dicen que hay Exif y XMP. */
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

/**
 * Copia los bloques del WEBP (RIFF) salvo `EXIF` y `XMP `; de Exif deja solo la orientación, como
 * en un JPEG. Corrige los bits de `VP8X` y el largo del RIFF.
 * @param {Uint8Array} b
 */
function stripWebp(b) {
	const riffEnd = Math.min(b.length, 8 + u32le(b, 4));
	/** @type {Uint8Array[]} */
	const parts = [];
	let orientation = 0;
	let dropped = false;
	let vp8x = -1;
	let size = 0;
	let i = 12;
	while (i + 8 <= riffEnd) {
		const type = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
		const len = u32le(b, i + 4);
		if (i + 8 + len > riffEnd) return b;
		// Cada bloque ocupa un largo par (con un byte de relleno si es impar).
		const end = Math.min(i + 8 + len + (len & 1), riffEnd);
		if (type === 'EXIF' || type === 'XMP ') {
			if (type === 'EXIF' && !orientation) {
				let tiff = b.subarray(i + 8, i + 8 + len);
				// Algunos programas dejan adelante el «Exif\0\0» de JPEG.
				if (ascii(tiff, 0, 'Exif\0\0')) tiff = tiff.subarray(6);
				orientation = exifOrientation(tiff);
			}
			dropped = true;
		} else {
			if (type === 'VP8X' && len >= 10) vp8x = size;
			parts.push(b.subarray(i, end));
			size += end - i;
		}
		i = end;
	}
	if (!dropped) return b;
	// Sin `VP8X` (un WEBP simple) no puede llevar Exif: no hay dónde decirlo.
	const keepOrientation = orientation > 1 && orientation <= 8 && vp8x >= 0;
	if (keepOrientation) {
		// El bloque TIFF del segmento de JPEG (sin APP1 ni «Exif\0\0»), 26 bytes: largo par.
		const tiff = orientationSegment(orientation).subarray(10);
		parts.push(Uint8Array.from([0x45, 0x58, 0x49, 0x46]), u32leBytes(tiff.length), tiff);
	}
	// `concat` copia: los bytes de `b` no se tocan.
	const body = concat(parts);
	if (vp8x >= 0) {
		const flags = body[vp8x + 8] & ~(VP8X_EXIF | VP8X_XMP);
		body[vp8x + 8] = keepOrientation ? flags | VP8X_EXIF : flags;
	}
	return concat([b.subarray(0, 4), u32leBytes(4 + body.length), b.subarray(8, 12), body]);
}

/**
 * Las cajas (ISO BMFF) entre `from` y `to`: tipo, dónde empieza su contenido y dónde termina.
 * @param {Uint8Array} b
 * @param {number} from
 * @param {number} to
 * @returns {{ type: string, start: number, end: number }[] | null} `null` si no se entiende
 */
function boxes(b, from, to) {
	const out = [];
	let i = from;
	while (i + 8 <= to) {
		let size = u32be(b, i);
		const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
		let start = i + 8;
		if (size === 1) {
			// Tamaño de 64 bits: solo los que entran en 32.
			if (i + 16 > to || u32be(b, i + 8) !== 0) return null;
			size = u32be(b, i + 12);
			start = i + 16;
		} else if (size === 0) {
			size = to - i;
		}
		if (size < start - i || i + size > to) return null;
		out.push({ type, start, end: i + size });
		i += size;
	}
	return out;
}

/**
 * Un entero sin signo big endian de `n` bytes (0, 4 u 8; 0 da 0).
 * @param {Uint8Array} b @param {number} i @param {number} n
 */
function uintN(b, i, n) {
	if (n === 0) return 0;
	if (n === 4) return u32be(b, i);
	if (n === 8 && u32be(b, i) === 0) return u32be(b, i + 4);
	throw new Error('tamaño no soportado');
}

/**
 * Los ítems Exif y XMP (`mime` con `application/rdf+xml`) de la caja `iinf`: id → cuál es.
 * @param {Uint8Array} b
 * @param {{ start: number, end: number }} iinf
 */
function metadataItems(b, iinf) {
	/** @type {Map<number, 'exif' | 'xmp'>} */
	const ids = new Map();
	const entriesAt = iinf.start + 4 + (b[iinf.start] === 0 ? 2 : 4);
	for (const infe of boxes(b, entriesAt, iinf.end) ?? []) {
		const v = b[infe.start];
		if (infe.type !== 'infe' || v < 2) continue;
		let k = infe.start + 4;
		const id = v === 2 ? u16be(b, k) : u32be(b, k);
		k += (v === 2 ? 2 : 4) + 2; // el id y item_protection_index
		const type = String.fromCharCode(b[k], b[k + 1], b[k + 2], b[k + 3]);
		k += 4;
		if (type === 'Exif') ids.set(id, 'exif');
		if (type !== 'mime') continue;
		// item_name y content_type, cada uno terminado en 0.
		const nameEnd = b.indexOf(0, k);
		if (nameEnd < 0 || nameEnd >= infe.end) continue;
		const typeEnd = b.indexOf(0, nameEnd + 1);
		const contentType = String.fromCharCode(
			...b.subarray(nameEnd + 1, typeEnd < 0 || typeEnd > infe.end ? infe.end : typeEnd)
		);
		if (contentType.trim().toLowerCase() === 'application/rdf+xml') ids.set(id, 'xmp');
	}
	return ids;
}

/**
 * Pisa el contenido de los ítems Exif y XMP de un AVIF en el mismo lugar: el archivo queda del
 * mismo tamaño y con las mismas posiciones (`iloc` e `iinf` no cambian). El Exif queda válido pero
 * con solo la orientación (un Exif que no se entiende hace fallar a algunos lectores, como
 * libavif) y el resto en ceros; el XMP, en espacios. Solo ítems guardados en el archivo o en `idat`
 * (los métodos 0 y 1 de `iloc`); otro caso, tal cual.
 * @param {Uint8Array} b
 */
function stripAvif(b) {
	const top = boxes(b, 0, b.length);
	const ftyp = top?.[0];
	if (!top || ftyp?.type !== 'ftyp') return b;
	// Solo AVIF (marca principal o compatible): un HEIC u otro ISO BMFF va tal cual.
	let isAvif = false;
	for (let k = ftyp.start; k + 4 <= ftyp.end; k += 4) {
		if (k !== ftyp.start + 4 && (ascii(b, k, 'avif') || ascii(b, k, 'avis'))) isAvif = true;
	}
	const meta = top.find((x) => x.type === 'meta');
	if (!isAvif || !meta) return b;
	// `meta` es una FullBox: 4 bytes de versión y flags antes de sus cajas.
	const inner = boxes(b, meta.start + 4, meta.end);
	const iinf = inner?.find((x) => x.type === 'iinf');
	const iloc = inner?.find((x) => x.type === 'iloc');
	const idat = inner?.find((x) => x.type === 'idat');
	if (!iinf || !iloc) return b;
	const hidden = metadataItems(b, iinf);
	if (!hidden.size) return b;

	/** @type {Map<number, [number, number][]>} */
	const ranges = new Map();
	const v = b[iloc.start];
	let k = iloc.start + 4;
	const offsetSize = b[k] >> 4;
	const lengthSize = b[k] & 15;
	const baseSize = b[k + 1] >> 4;
	const indexSize = v === 1 || v === 2 ? b[k + 1] & 15 : 0;
	k += 2;
	const idSize = v < 2 ? 2 : 4;
	const count = v < 2 ? u16be(b, k) : u32be(b, k);
	k += idSize;
	for (let n = 0; n < count; n++) {
		const id = v < 2 ? u16be(b, k) : u32be(b, k);
		k += idSize;
		let method = 0;
		if (v === 1 || v === 2) {
			method = u16be(b, k) & 15;
			k += 2;
		}
		k += 2; // data_reference_index
		const base = uintN(b, k, baseSize);
		k += baseSize;
		const extents = u16be(b, k);
		k += 2;
		for (let e = 0; e < extents; e++) {
			k += indexSize;
			const offset = uintN(b, k, offsetSize);
			k += offsetSize;
			const length = uintN(b, k, lengthSize);
			k += lengthSize;
			if (k > iloc.end) return b;
			if (!hidden.has(id)) continue;
			// Largo 0 = «hasta el final»: no se adivina, va tal cual.
			if (length === 0 || method > 1 || (method === 1 && !idat)) return b;
			const from = method === 0 ? base + offset : /** @type {any} */ (idat).start + base + offset;
			const limit = method === 0 ? b.length : /** @type {any} */ (idat).end;
			if (from + length > limit) return b;
			ranges.set(id, [...(ranges.get(id) ?? []), [from, from + length]]);
		}
	}
	if (!ranges.size) return b;
	const out = b.slice();
	for (const [id, parts] of ranges) {
		if (hidden.get(id) === 'xmp') {
			for (const [from, to] of parts) out.fill(0x20, from, to);
			continue;
		}
		// El Exif de un AVIF: 4 bytes con dónde empieza el bloque TIFF, y el bloque.
		const payload = concat(parts.map(([from, to]) => b.subarray(from, to)));
		const at = 4 + u32be(payload, 0);
		const found = at < payload.length ? exifOrientation(payload.subarray(at)) : 0;
		const tiff = orientationSegment(found >= 1 && found <= 8 ? found : 1).subarray(10);
		if (payload.length < 4 + tiff.length) return b;
		const clean = new Uint8Array(payload.length);
		clean.set(tiff, 4);
		let k = 0;
		for (const [from, to] of parts) {
			out.set(clean.subarray(k, k + to - from), from);
			k += to - from;
		}
	}
	return out;
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
