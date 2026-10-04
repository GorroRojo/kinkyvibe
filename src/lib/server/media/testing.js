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
