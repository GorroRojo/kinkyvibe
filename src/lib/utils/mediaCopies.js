/**
 * Las copias chicas de las imágenes de la biblioteca (docs/imagenes.md, «Copias chicas para las
 * tarjetas»): cada imagen tiene, al lado de su original en R2, dos copias WEBP para las tarjetas y
 * las listas, hechas **al subirla** (en el navegador, como la de 2000 px) o por la pasada única de
 * scripts/copias-chicas.js para las que ya estaban. Sin el cupo de transformaciones de Cloudflare.
 *
 * - **Clave**: la del original con el lado: `img/<sha-256 del original>-360.webp` y `-720.webp`.
 *   Se nombra por el contenido del original (que nunca cambia), así que se guarda en caché para
 *   siempre igual que el original, y se sabe la dirección sin preguntarle nada a la base.
 * - **Medida**: el lado más corto mide {@link COPY_SIDES} px (o menos, si el original es más chico:
 *   nunca se agranda), con la misma proporción. Es lo que pide un recuadro con `object-fit: cover`
 *   (la tarjeta, 13rem × 15em, recorta al centro sea la imagen vertical o apaisada).
 * - **Si una copia no existe** (una imagen vieja antes de la pasada, o una que el navegador no pudo
 *   achicar), `/media/img/<hash>-360.webp` redirige al original: las páginas siempre pueden pedir
 *   la copia.
 * - Un GIF no tiene copias (puede ser animado y la copia sería la primera imagen, quieta).
 *
 * Sin dependencias: corre en el navegador, en el Worker, en Node (la pasada) y en vitest.
 */

/** Lado más corto de cada copia, en píxeles. */
export const COPY_SIDES = /** @type {const} */ ([360, 720]);

/** Calidad del WEBP de las copias (0 a 1). */
export const COPY_QUALITY = 0.8;

/** Peso máximo de una copia que llega con la subida (una de 720 px pesa mucho menos). */
export const MAX_COPY_BYTES = 2 * 1024 * 1024;

/** Un original de la biblioteca que puede tener copias (no GIF): `img/<hash>.<ext>`. */
const ORIGINAL_KEY = /^img\/([0-9a-f]{64})\.(?:webp|jpg|png|avif)$/;

/** La clave de una copia: `img/<hash>-<lado>.webp`. */
export const COPY_KEY = /^img\/([0-9a-f]{64})-(360|720)\.webp$/;

/** La dirección de una imagen de la biblioteca, del mismo sitio (`/media/img/<hash>.<ext>`). */
const ORIGINAL_PATH = /^\/media\/(img\/[0-9a-f]{64}\.(?:webp|jpg|png|avif))$/;

/**
 * La clave de la copia de `side` px de un original, o `null` si ese original no tiene copias (un
 * GIF, algo que no es de la biblioteca o un lado que no es de {@link COPY_SIDES}).
 * @param {string} originalKey
 * @param {number} side
 */
export function copyKey(originalKey, side) {
	const m = ORIGINAL_KEY.exec(String(originalKey));
	if (!m || !COPY_SIDES.includes(/** @type {any} */ (side))) return null;
	return `img/${m[1]}-${side}.webp`;
}

/**
 * `img/<hash>-360.webp` → `{ hash, side: 360 }`; `null` si no es la clave de una copia.
 * @param {string} key
 * @returns {{ hash: string, side: number } | null}
 */
export function parseCopyKey(key) {
	const m = COPY_KEY.exec(String(key));
	return m ? { hash: m[1], side: Number(m[2]) } : null;
}

/**
 * Las medidas de la copia de `side` px: el lado más corto en `side` (o el del original si es más
 * chico: nunca se agranda), con la misma proporción.
 * @param {number} width
 * @param {number} height
 * @param {number} side
 * @returns {{ width: number, height: number }}
 */
export function copySize(width, height, side) {
	const w = Math.max(1, Math.round(width));
	const h = Math.max(1, Math.round(height));
	const short = Math.min(w, h);
	if (short <= side) return { width: w, height: h };
	const k = side / short;
	return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/**
 * La dirección de la copia de `side` px de una imagen, o '' si esa dirección no es de una imagen de
 * la biblioteca del mismo sitio (una imagen vieja de otro sitio, un GIF, nada). Las direcciones
 * enteras al sitio público (`https://kinkyvibe.ar/media/…`, las de local y los previews) quedan
 * afuera: ese sitio puede no tener todavía la copia ni la redirección.
 * @param {unknown} src
 * @param {number} side
 */
export function copyUrl(src, side) {
	const m = typeof src === 'string' ? ORIGINAL_PATH.exec(src) : null;
	const key = m ? copyKey(m[1], side) : null;
	return key ? `/media/${key}` : '';
}

/**
 * El `srcset` de la imagen de una tarjeta (recuadro fijo de 13rem × 15em, `object-fit: cover`):
 * la copia de 360 px para pantallas comunes y la de 720 px para las densas (2× y 3×). '' si la
 * imagen no tiene copias (queda solo el `src`, el original).
 * @param {unknown} src
 */
export function cardSrcset(src) {
	const small = copyUrl(src, 360);
	return small ? `${small} 1x, ${copyUrl(src, 720)} 2x` : '';
}

/**
 * El `srcset` de una imagen chica (la de una fila de lista, ~128 px; la del encabezado de un
 * perfil, 4em): solo la copia de 360 px, que alcanza para pantallas de hasta ~2,5×. Con una sola
 * densidad (1x) la imagen mide lo mismo que mediría la copia sola: la lista, que se acomoda al
 * tamaño de la imagen, queda igual. '' si la imagen no tiene copias.
 * @param {unknown} src
 */
export function smallSrcset(src) {
	const small = copyUrl(src, 360);
	return small ? `${small} 1x` : '';
}

/**
 * El `srcset` del afiche de la página de un evento (un cuadrado de ancho variable con
 * `object-fit: cover`; el `sizes` lo pone la página según su CSS): las dos copias y, si se saben las
 * medidas del original, el original como la opción más grande. '' si la imagen no tiene copias.
 *
 * Como el cuadrado recorta al centro, lo que tiene que alcanzar es el **lado corto** (igual que en
 * las tarjetas): cada opción se anota con su lado corto (`360w`, `720w`, el del original) y no con
 * su ancho, así una imagen apaisada no elige una copia que se ve borrosa. El tamaño en pantalla lo
 * manda el CSS (ancho y `aspect-ratio`), así que ese número no cambia cómo se ve. Sin medidas (una
 * portada vieja sin `width`/`height`) quedan solo las copias. Dos opciones con el mismo lado (un
 * original chico) quedan en una: la más liviana, la copia.
 * @param {unknown} src
 * @param {{ width?: number | null, height?: number | null } | null | undefined} [size] las medidas
 *   del original (la portada de la biblioteca)
 */
export function posterSrcset(src, size) {
	if (!copyUrl(src, 360)) return '';
	const w = Number(size?.width);
	const h = Number(size?.height);
	const short = w > 0 && h > 0 ? Math.round(Math.min(w, h)) : 0;
	const options = COPY_SIDES.map(
		(side) =>
			/** @type {[string, number]} */ ([copyUrl(src, side), short ? Math.min(side, short) : side])
	);
	if (short) options.push([String(src), short]);
	/** @type {Set<number>} */
	const seen = new Set();
	return options
		.filter(([, width]) => !seen.has(width) && seen.add(width))
		.map(([url, width]) => `${url} ${width}w`)
		.join(', ');
}

/**
 * Pura (la pasada única, scripts/copias-chicas.js): de todas las claves del bucket, las copias que
 * faltan, una por original y lado. Nunca devuelve una clave que ya está.
 * @param {Iterable<string>} keys todas las claves del bucket (originales, copias y archivos)
 * @returns {{ original: string, key: string, side: number }[]}
 */
export function missingCopies(keys) {
	const all = new Set(keys);
	/** @type {{ original: string, key: string, side: number }[]} */
	const out = [];
	for (const original of [...all].sort()) {
		for (const side of COPY_SIDES) {
			const key = copyKey(original, side);
			if (key && !all.has(key)) out.push({ original, key, side });
		}
	}
	return out;
}
