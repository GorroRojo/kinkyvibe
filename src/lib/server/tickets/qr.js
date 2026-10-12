/**
 * Códigos QR en JS puro (qrcode-generator), así funcionan en Cloudflare Workers.
 */
import qrcode from 'qrcode-generator';

/** @param {string} text */
function make(text) {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	return qr;
}

/**
 * SVG escalable (para mostrar en la página de la entrada).
 *
 * @param {string} text
 */
export function qrSvg(text) {
	return make(text).createSvgTag({ cellSize: 8, margin: 4, scalable: true });
}

/**
 * GIF (para el email: Gmail y otros no muestran SVG).
 *
 * @param {string} text
 * @returns {Uint8Array}
 */
export function qrGif(text) {
	const dataUrl = make(text).createDataURL(8, 4);
	const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------------------------
// PNG (para mandar el QR como foto por Telegram: el bot, «Mis entradas»)
// ---------------------------------------------------------------------------------------------

/** @type {Uint32Array | null} */
let crcTable = null;

/** CRC-32 (el de PNG). @param {Uint8Array} bytes */
function crc32(bytes) {
	if (!crcTable) {
		crcTable = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			crcTable[n] = c >>> 0;
		}
	}
	let crc = 0xffffffff;
	for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/** Adler-32 (el de zlib). @param {Uint8Array} bytes */
function adler32(bytes) {
	let a = 1;
	let b = 0;
	for (const x of bytes) {
		a = (a + x) % 65521;
		b = (b + a) % 65521;
	}
	return ((b << 16) | a) >>> 0;
}

/**
 * zlib sin comprimir (bloques «stored» de deflate): sincrónico y sin dependencias. Un QR en 1 bit
 * por pixel pesa unos pocos KB igual.
 *
 * @param {Uint8Array} data
 */
function zlibStored(data) {
	const BLOCK = 65535;
	const blocks = Math.max(1, Math.ceil(data.length / BLOCK));
	const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
	out[0] = 0x78;
	out[1] = 0x01;
	let o = 2;
	for (let i = 0; i < blocks; i++) {
		const chunk = data.subarray(i * BLOCK, Math.min(data.length, (i + 1) * BLOCK));
		out[o++] = i === blocks - 1 ? 1 : 0;
		out[o++] = chunk.length & 0xff;
		out[o++] = chunk.length >>> 8;
		out[o++] = ~chunk.length & 0xff;
		out[o++] = (~chunk.length >>> 8) & 0xff;
		out.set(chunk, o);
		o += chunk.length;
	}
	new DataView(out.buffer).setUint32(o, adler32(data));
	return out;
}

/**
 * Un chunk de PNG: largo, tipo, datos y CRC.
 *
 * @param {string} type
 * @param {Uint8Array} data
 */
function pngChunk(type, data) {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

/**
 * PNG en blanco y negro (1 bit por pixel). Lo usa el bot para mandar el QR de una entrada como
 * foto (Telegram convierte cualquier foto; un PNG lo acepta seguro). El mismo QR que la página de
 * la entrada y el mail: el texto que se le pasa.
 *
 * @param {string} text
 * @param {{ scale?: number, margin?: number }} [opts] pixeles por módulo y módulos de borde
 * @returns {Uint8Array}
 */
export function qrPng(text, { scale = 10, margin = 4 } = {}) {
	const qr = make(text);
	const count = qr.getModuleCount();
	const size = (count + margin * 2) * scale;
	const rowBytes = Math.ceil(size / 8);
	const raw = new Uint8Array((rowBytes + 1) * size);
	for (let y = 0; y < size; y++) {
		const base = y * (rowBytes + 1);
		raw[base] = 0; // sin filtro
		const row = Math.floor(y / scale) - margin;
		for (let x = 0; x < size; x++) {
			const col = Math.floor(x / scale) - margin;
			const dark = row >= 0 && row < count && col >= 0 && col < count && qr.isDark(row, col);
			// 1 = blanco, 0 = negro (escala de grises de 1 bit).
			if (!dark) raw[base + 1 + (x >> 3)] |= 0x80 >> (x & 7);
		}
	}
	const ihdr = new Uint8Array(13);
	const v = new DataView(ihdr.buffer);
	v.setUint32(0, size);
	v.setUint32(4, size);
	ihdr[8] = 1; // bits por pixel
	ihdr[9] = 0; // escala de grises
	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk('IHDR', ihdr),
		pngChunk('IDAT', zlibStored(raw)),
		pngChunk('IEND', new Uint8Array(0))
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}
