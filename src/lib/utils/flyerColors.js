/**
 * Los colores del flyer de un evento, para la paleta de su diapositiva en el carrusel de la
 * portada (docs/estilo.md, «Carrusel de la portada»; docs/imagenes.md, «Colores de la imagen»).
 *
 * Dos pasos, en dos momentos:
 *
 * 1. **Al subir la imagen** (en el navegador, una sola vez): {@link colorsFromImage} la dibuja
 *    chiquita en un canvas y {@link extractColors} saca sus colores principales (hasta
 *    {@link COLORS_MAX}, primero los que más pesan, con preferencia por los vivos). Se guardan en
 *    el objeto `imagen` (`colors`, una lista de `#rrggbb`). Las imágenes de antes se completan
 *    desde Ajustes › Carrusel de la portada («Calcular los colores que faltan»).
 * 2. **Al dibujar la portada**: `paletaDelFlyer` (./carruselPaletas.js) usa esos colores para
 *    ELEGIR cuál de las paletas de la marca va detrás del flyer (la que más se le distingue) y
 *    como acento (la estrella, la cinta). Son cuentas sobre 5 colores, sin mirar la imagen.
 *
 * Puro (sin Svelte ni DOM, salvo lo que se le pasa a {@link colorsFromImage}): corre en el
 * navegador, en el Worker y en vitest. Sin imports.
 */

/** Cuántos colores se guardan por imagen, como mucho. */
export const COLORS_MAX = 5;

/** Contraste mínimo de un texto normal sobre su fondo (WCAG 2.x AA). */
export const AA = 4.5;

/** Contraste mínimo de un texto grande (24 px, o 18,66 px en negrita) sobre su fondo (WCAG 2.x AA). */
export const AA_GRANDE = 3;

/** Lado del dibujo chiquito del que se sacan los colores (px). */
export const SAMPLE_SIDE = 64;

const HEX = /^#[0-9a-f]{6}$/;

/** @typedef {{ r: number, g: number, b: number }} Rgb */
/** @typedef {{ h: number, s: number, l: number }} Hsl */

/**
 * ¿Es un color guardable (`#rrggbb` en minúsculas)?
 * @param {unknown} v
 * @returns {v is string}
 */
export const isHexColor = (v) => typeof v === 'string' && HEX.test(v);

/**
 * Un color de CSS simple como `#rrggbb`: `#rrggbb`, `white`, `black` o `hsl(h, s%, l%)` (los de las
 * tarjetas de vista previa). Otra cosa, `null`.
 * @param {unknown} v
 * @returns {string | null}
 */
export function cssColorHex(v) {
	const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
	if (HEX.test(s)) return s;
	if (s === 'white') return '#ffffff';
	if (s === 'black') return '#000000';
	const m = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/.exec(s);
	if (!m) return null;
	return hslHex({ h: Number(m[1]), s: Number(m[2]) / 100, l: Number(m[3]) / 100 });
}

/**
 * La lista de colores que vino (del navegador o de la base), limpia: solo `#rrggbb`, sin
 * repetidos, como mucho {@link COLORS_MAX}. Acepta un JSON o una lista. Sin ninguno válido, `null`.
 * @param {unknown} value
 * @returns {string[] | null}
 */
export function parseColors(value) {
	let list = value;
	if (typeof list === 'string') {
		try {
			list = JSON.parse(list);
		} catch {
			return null;
		}
	}
	if (!Array.isArray(list)) return null;
	/** @type {string[]} */
	const out = [];
	for (const c of list) {
		const hex = typeof c === 'string' ? c.trim().toLowerCase() : '';
		if (isHexColor(hex) && !out.includes(hex)) out.push(hex);
		if (out.length === COLORS_MAX) break;
	}
	return out.length ? out : null;
}

/** @param {string} hex @returns {Rgb} */
export function hexToRgb(hex) {
	const n = parseInt(hex.slice(1, 7), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** @param {Rgb} c */
export function rgbToHex({ r, g, b }) {
	const h = (/** @type {number} */ v) =>
		Math.max(0, Math.min(255, Math.round(v)))
			.toString(16)
			.padStart(2, '0');
	return `#${h(r)}${h(g)}${h(b)}`;
}

/** @param {Rgb} c @returns {Hsl} h en grados, s y l de 0 a 1 */
export function rgbToHsl({ r, g, b }) {
	const R = r / 255;
	const G = g / 255;
	const B = b / 255;
	const max = Math.max(R, G, B);
	const min = Math.min(R, G, B);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h;
	if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
	else if (max === G) h = (B - R) / d + 2;
	else h = (R - G) / d + 4;
	return { h: h * 60, s, l };
}

/** @param {Hsl} c @returns {Rgb} */
export function hslToRgb({ h, s, l }) {
	const hue = (((h % 360) + 360) % 360) / 360;
	if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	/** @param {number} t */
	const ch = (t) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	return { r: ch(hue + 1 / 3) * 255, g: ch(hue) * 255, b: ch(hue - 1 / 3) * 255 };
}

/** @param {Hsl} c */
export const hslHex = (c) => rgbToHex(hslToRgb(c));

/**
 * Luminancia relativa (WCAG 2.x).
 * @param {string} hex
 */
export function luminance(hex) {
	const { r, g, b } = hexToRgb(hex);
	const lin = (/** @type {number} */ v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Contraste entre dos colores (WCAG 2.x), de 1 a 21.
 * @param {string} a
 * @param {string} b
 */
export function contrast(a, b) {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Qué tan vivo es un color (croma de HSL, de 0 a 1). @param {Hsl} c */
export const chroma = (c) => c.s * (1 - Math.abs(2 * c.l - 1));

/** Distancia entre dos tonos, en grados (0 a 180). @param {number} a @param {number} b */
export const hueDistance = (a, b) => {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
};

/**
 * `fg` corrido (en luminosidad, mismo tono) hasta que se lea sobre `bg` con al menos `min`. Va
 * hacia el negro o el blanco, el que más contraste da con `bg`. Si ni así llega, negro o blanco
 * (uno de los dos siempre pasa 4.5:1).
 * @param {string} fg
 * @param {string} bg
 * @param {number} [min]
 */
export function ensureContrast(fg, bg, min = AA) {
	if (contrast(fg, bg) >= min) return fg;
	const towardDark = contrast('#000000', bg) >= contrast('#ffffff', bg);
	const hsl = rgbToHsl(hexToRgb(fg));
	for (let step = 1; step <= 50; step++) {
		const l = towardDark ? hsl.l - step * 0.02 : hsl.l + step * 0.02;
		if (l < 0 || l > 1) break;
		const candidate = hslHex({ ...hsl, l });
		if (contrast(candidate, bg) >= min) return candidate;
	}
	return towardDark ? '#000000' : '#ffffff';
}

/**
 * Un color de texto que se lee sobre `bg`: del mismo tono que el fondo, muy oscuro o muy claro
 * (el que más contraste da), corrido hasta pasar `min`.
 * @param {string} bg
 * @param {number} [min]
 */
export function readableInk(bg, min = AA) {
	const { h, s } = rgbToHsl(hexToRgb(bg));
	const dark = hslHex({ h, s: Math.min(s, 0.6), l: 0.13 });
	const light = hslHex({ h, s: Math.min(s, 0.5), l: 0.97 });
	const start = contrast(dark, bg) >= contrast(light, bg) ? dark : light;
	return ensureContrast(start, bg, min);
}

/**
 * Los colores principales de una imagen, de sus píxeles (RGBA, como `getImageData().data`).
 * Agrupa los píxeles en cajas de color (4 bits por canal), ordena las cajas por cuánto pesan
 * (cantidad de píxeles, con un empujón a las vivas: un flyer con fondo blanco y un título fucsia
 * da primero el fucsia) y se queda con las que se distinguen entre sí. Ignora lo transparente.
 *
 * @param {ArrayLike<number>} rgba
 * @param {{ max?: number }} [opts]
 * @returns {string[]} hasta `max` colores `#rrggbb` (vacío si no hay píxeles opacos)
 */
export function extractColors(rgba, { max = COLORS_MAX } = {}) {
	/** @type {Map<number, { n: number, r: number, g: number, b: number }>} */
	const boxes = new Map();
	for (let i = 0; i + 3 < rgba.length; i += 4) {
		if (rgba[i + 3] < 128) continue;
		const r = rgba[i];
		const g = rgba[i + 1];
		const b = rgba[i + 2];
		const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
		const box = boxes.get(key);
		if (box) {
			box.n++;
			box.r += r;
			box.g += g;
			box.b += b;
		} else boxes.set(key, { n: 1, r, g, b });
	}
	const ranked = [...boxes.values()]
		.map((box) => {
			const rgb = { r: box.r / box.n, g: box.g / box.n, b: box.b / box.n };
			const hsl = rgbToHsl(rgb);
			return { rgb, n: box.n, score: box.n * (0.3 + 1.7 * chroma(hsl)) };
		})
		.sort((a, b) => b.score - a.score);
	/** @type {{ rgb: Rgb, n: number }[]} */
	const chosen = [];
	for (const c of ranked) {
		const near = chosen.find((k) => rgbDistance(k.rgb, c.rgb) < 56);
		if (near) continue;
		chosen.push(c);
		if (chosen.length === max) break;
	}
	return chosen.map((c) => rgbToHex(c.rgb));
}

/** @param {Rgb} a @param {Rgb} b */
function rgbDistance(a, b) {
	return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/**
 * Los colores de una imagen ya cargada, en el navegador: la dibuja en un canvas de
 * {@link SAMPLE_SIDE} px y pasa sus píxeles por {@link extractColors}. Si algo falla (un canvas
 * «manchado» por una imagen de otro sitio, un navegador sin canvas), `null`: la imagen se guarda
 * igual, sin colores.
 *
 * @param {CanvasImageSource} source un ImageBitmap, un <img> cargado o un canvas
 * @param {(w: number, h: number) => HTMLCanvasElement | OffscreenCanvas} makeCanvas
 * @returns {string[] | null}
 */
export function colorsFromImage(source, makeCanvas) {
	try {
		const canvas = makeCanvas(SAMPLE_SIDE, SAMPLE_SIDE);
		const ctx = /** @type {CanvasRenderingContext2D | null} */ (
			canvas.getContext('2d', { willReadFrequently: true })
		);
		if (!ctx || typeof ctx.getImageData !== 'function') return null;
		ctx.drawImage(source, 0, 0, SAMPLE_SIDE, SAMPLE_SIDE);
		const colors = extractColors(ctx.getImageData(0, 0, SAMPLE_SIDE, SAMPLE_SIDE).data);
		return colors.length ? colors : null;
	} catch {
		return null;
	}
}
