/**
 * Pedidos de una parte de un archivo (`Range: bytes=…`, RFC 9110 §14), para `/media/…`: el video
 * se adelanta sin bajar todo y los PDF grandes se abren por partes. Solo un rango por pedido; lo
 * que no se entiende (varios rangos, otra unidad, sintaxis rara) se ignora y se manda el archivo
 * entero (200), como permite la norma.
 *
 * También el `Content-Disposition` de un documento o un video ({@link disposition}).
 *
 * Sin dependencias: corre en el Worker y en vitest.
 */

/**
 * @typedef {{ offset: number, length: number }} ByteRange
 *   Desde `offset`, `length` bytes (lo que se le pide a R2 con `get(key, { range })`).
 */

/**
 * Lee el encabezado `Range` para un archivo de `size` bytes.
 *
 * @param {string | null | undefined} header
 * @param {number} size
 * @returns {ByteRange | 'unsatisfiable' | null}
 *   el rango; `'unsatisfiable'` si pide algo fuera del archivo (416); `null` si no hay rango que
 *   atender (se manda todo).
 */
export function parseRange(header, size) {
	if (!header || !Number.isSafeInteger(size) || size < 0) return null;
	const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
	if (!m) return null;
	const [, first, last] = m;
	if (first === '' && last === '') return null;
	if (first === '') {
		// Los últimos N bytes.
		const n = Number(last);
		if (!Number.isSafeInteger(n)) return null;
		if (n === 0 || size === 0) return 'unsatisfiable';
		const length = Math.min(n, size);
		return { offset: size - length, length };
	}
	const start = Number(first);
	if (!Number.isSafeInteger(start)) return null;
	if (start >= size) return 'unsatisfiable';
	let end = last === '' ? size - 1 : Number(last);
	if (!Number.isSafeInteger(end)) return null;
	if (end < start) return null;
	end = Math.min(end, size - 1);
	return { offset: start, length: end - start + 1 };
}

/**
 * El valor de `Content-Range` de una respuesta 206.
 * @param {ByteRange} range
 * @param {number} size
 */
export const contentRange = ({ offset, length }, size) =>
	`bytes ${offset}-${offset + length - 1}/${size}`;

/** `encodeURIComponent` más los caracteres que RFC 5987 no deja sueltos. @param {string} s */
const rfc5987 = (s) =>
	encodeURIComponent(s).replace(
		/['()*!]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
	);

/**
 * `Content-Disposition` con un nombre seguro: ASCII sin comillas ni barras en `filename` y el
 * nombre completo (con tildes) en `filename*` (RFC 6266).
 * @param {'inline' | 'attachment'} type
 * @param {string} title
 * @param {string} ext
 */
export function disposition(type, title, ext) {
	const base =
		String(title ?? '')
			.replace(/\p{Cc}/gu, ' ')
			.replace(/[\\/"]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 120) || 'archivo';
	const ascii =
		base
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^A-Za-z0-9._ -]/g, '_')
			.trim() || 'archivo';
	const name = `${base}.${ext}`;
	return `${type}; filename="${ascii}.${ext}"; filename*=UTF-8''${rfc5987(name)}`;
}
