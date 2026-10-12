import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import qrcode from 'qrcode-generator';
import { qrPng } from './qr.js';

/** Lee un PNG en escala de grises de 1 bit (el que arma `qrPng`): ancho, alto y pixeles. */
function decode(/** @type {Uint8Array} */ png) {
	const buf = Buffer.from(png);
	expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	let o = 8;
	/** @type {Record<string, Buffer>} */
	const chunks = {};
	while (o < buf.length) {
		const len = buf.readUInt32BE(o);
		const type = buf.toString('latin1', o + 4, o + 8);
		chunks[type] = buf.subarray(o + 8, o + 8 + len);
		o += 12 + len;
	}
	const width = chunks.IHDR.readUInt32BE(0);
	const height = chunks.IHDR.readUInt32BE(4);
	expect(chunks.IHDR[8]).toBe(1);
	expect(chunks.IHDR[9]).toBe(0);
	expect(chunks.IEND).toBeDefined();
	const raw = inflateSync(chunks.IDAT);
	const rowBytes = Math.ceil(width / 8);
	expect(raw.length).toBe((rowBytes + 1) * height);
	/** @param {number} x @param {number} y */
	const dark = (x, y) => (raw[y * (rowBytes + 1) + 1 + (x >> 3)] & (0x80 >> (x & 7))) === 0;
	return { width, height, dark };
}

describe('qrPng', () => {
	const text = 'https://ejemplo.test/entradas/t/' + 'A'.repeat(43);

	it('es un PNG válido con los mismos módulos que el QR de la página', () => {
		const png = decode(qrPng(text, { scale: 4, margin: 4 }));
		const qr = qrcode(0, 'M');
		qr.addData(text);
		qr.make();
		const count = qr.getModuleCount();
		expect(png.width).toBe((count + 8) * 4);
		expect(png.height).toBe(png.width);
		for (let r = 0; r < count; r++) {
			for (let c = 0; c < count; c++) {
				// El centro de cada módulo.
				expect(png.dark((c + 4) * 4 + 2, (r + 4) * 4 + 2)).toBe(qr.isDark(r, c));
			}
		}
		// El borde es blanco.
		expect(png.dark(0, 0)).toBe(false);
		expect(png.dark(png.width - 1, png.height - 1)).toBe(false);
	});

	it('por defecto, de 10 pixeles por módulo (se lee bien en el celu)', () => {
		const png = decode(qrPng(text));
		expect(png.width % 10).toBe(0);
		expect(png.width).toBeGreaterThan(300);
	});
});
