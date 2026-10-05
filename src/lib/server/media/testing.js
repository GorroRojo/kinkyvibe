/**
 * Solo para pruebas (vitest; nunca lo importa la app): imágenes inventadas, chiquitas y de un solo
 * color, armadas byte a byte (sin fotos de nadie).
 */
import { deflateSync } from 'node:zlib';

/** CRC-32 de PNG. @param {Uint8Array} bytes */
function crc32(bytes) {
	let c = ~0;
	for (const b of bytes) {
		c ^= b;
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
}

/** @param {string} type @param {Uint8Array} data */
function chunk(type, data) {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(new TextEncoder().encode(type), 4);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

/**
 * Un PNG de un solo color.
 * @param {number} width
 * @param {number} height
 * @param {[number, number, number]} [rgb]
 */
export function solidPng(width, height, rgb = [138, 62, 160]) {
	const ihdr = new Uint8Array(13);
	const v = new DataView(ihdr.buffer);
	v.setUint32(0, width);
	v.setUint32(4, height);
	ihdr.set([8, 2, 0, 0, 0], 8);
	const row = new Uint8Array(1 + width * 3);
	for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
	const raw = new Uint8Array(row.length * height);
	for (let y = 0; y < height; y++) raw.set(row, y * row.length);
	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', new Uint8Array(deflateSync(raw))),
		chunk('IEND', new Uint8Array())
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

const enc = (/** @type {string} */ s) => new TextEncoder().encode(s);

/** @param {...Uint8Array} parts */
function concat(...parts) {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/**
 * Un PDF inventado y mínimo (solo la cabecera y un poco de relleno: alcanza para reconocerlo).
 * @param {number} [size]
 */
export function fakePdf(size = 300) {
	const head = enc('%PDF-1.4\n% documento de prueba\n');
	const body = new Uint8Array(Math.max(0, size - head.length)).fill(0x20);
	return concat(head, body);
}

/**
 * Un MP4 inventado: la caja `ftyp` con la marca pedida y relleno numerado (para probar rangos).
 * @param {string} [brand]
 * @param {number} [size]
 */
export function fakeMp4(brand = 'isom', size = 1000) {
	const head = concat(new Uint8Array([0, 0, 0, 0x18]), enc('ftyp'), enc(brand), new Uint8Array(12));
	const out = new Uint8Array(Math.max(size, head.length));
	for (let i = 0; i < out.length; i++) out[i] = i % 251;
	out.set(head, 0);
	return out;
}

/** Un WebM inventado: la cabecera EBML con DocType «webm». */
export function fakeWebm() {
	return concat(
		new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]),
		enc('webm'),
		new Uint8Array(40)
	);
}

/**
 * Un zip inventado cuya primera entrada se llama `name` y guarda `content` (sin comprimir, o con
 * el método 8 si `compressed`). Con `name = 'mimetype'` y un tipo de OpenDocument, es un ODT/ODS/ODP.
 * @param {string} name
 * @param {string} content
 * @param {{ compressed?: boolean }} [opts]
 */
export function fakeZip(name, content, { compressed = false } = {}) {
	const data = enc(content);
	const header = new Uint8Array(30);
	const v = new DataView(header.buffer);
	v.setUint32(0, 0x04034b50, true);
	v.setUint16(4, 20, true);
	v.setUint16(8, compressed ? 8 : 0, true);
	v.setUint32(18, data.length, true);
	v.setUint32(22, data.length, true);
	v.setUint16(26, name.length, true);
	v.setUint16(28, 0, true);
	return concat(header, enc(name), data, enc('PK\x03\x04'), new Uint8Array(20));
}

/** Un ODT inventado. */
export const fakeOdt = () => fakeZip('mimetype', 'application/vnd.oasis.opendocument.text');
