/**
 * Un archivo .tar (formato ustar) con archivos de texto, sin dependencias. Lo usa «Descargar todo»
 * (Contenido → En la base): los .md de lo que está en la base, para tenerlos fuera del sitio.
 * Cualquier sistema lo abre (doble clic en macOS y Windows 11, `tar -xf` en la terminal).
 */

const BLOCK = 512;
const encoder = new TextEncoder();

/**
 * Escribe `text` (ASCII) en `buf` desde `offset`, en un campo de `length` bytes.
 * @param {Uint8Array} buf
 * @param {number} offset
 * @param {number} length
 * @param {string} text
 */
function field(buf, offset, length, text) {
	const bytes = encoder.encode(text);
	buf.set(bytes.subarray(0, length), offset);
}

/**
 * Número en octal, con ceros adelante y terminado en NUL (como piden los campos numéricos).
 * @param {number} value
 * @param {number} length
 */
const octal = (value, length) => value.toString(8).padStart(length - 1, '0') + '\0';

/**
 * @param {{ name: string, content: string }[]} files `name`: ruta dentro del archivo, hasta 100
 *   bytes (`calendario/fiesta-2026-10.md`)
 * @param {{ mtime?: number }} [opts] fecha de los archivos (ms desde epoch)
 * @returns {Uint8Array}
 */
export function makeTar(files, { mtime = Date.now() } = {}) {
	/** @type {Uint8Array[]} */
	const parts = [];
	for (const file of files) {
		const name = encoder.encode(file.name);
		if (!file.name || name.length > 100 || file.name.includes('..') || file.name.startsWith('/')) {
			throw new Error(`Nombre de archivo inválido para el .tar: ${file.name}`);
		}
		const body = encoder.encode(file.content);
		const header = new Uint8Array(BLOCK);
		field(header, 0, 100, file.name);
		field(header, 100, 8, octal(0o644, 8));
		field(header, 108, 8, octal(0, 8));
		field(header, 116, 8, octal(0, 8));
		field(header, 124, 12, octal(body.length, 12));
		field(header, 136, 12, octal(Math.floor(mtime / 1000), 12));
		field(header, 148, 8, '        '); // el checksum se calcula con estos espacios
		field(header, 156, 1, '0');
		field(header, 257, 6, 'ustar\0');
		field(header, 263, 2, '00');
		let sum = 0;
		for (const b of header) sum += b;
		field(header, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
		parts.push(header, body);
		const pad = (BLOCK - (body.length % BLOCK)) % BLOCK;
		if (pad) parts.push(new Uint8Array(pad));
	}
	parts.push(new Uint8Array(BLOCK * 2)); // fin del archivo
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}
