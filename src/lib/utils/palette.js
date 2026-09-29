// Colores para las imágenes de compartir: extracción de la paleta de una imagen (k-means
// sobre un histograma chico, en el navegador y sin dependencias) y helpers de contraste
// (WCAG) para que el texto se lea siempre, elija quien elija los colores.

/** @typedef {[number, number, number]} RGB */
/** @typedef {{hex:string, rgb:RGB, weight:number}} Swatch */

/** @param {string} hex @returns {RGB} */
export function hexToRgb(hex) {
	let h = String(hex).trim().replace('#', '');
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	if (!/^[0-9a-f]{6}$/i.test(h)) return [0, 0, 0];
	return /** @type {RGB} */ ([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
}

/** @param {number[]} rgb */
export function rgbToHex(rgb) {
	return (
		'#' +
		rgb
			.slice(0, 3)
			.map((v) =>
				Math.round(Math.min(255, Math.max(0, v)))
					.toString(16)
					.padStart(2, '0')
			)
			.join('')
	);
}

/** @param {string} s */
export const isHex = (s) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(s ?? '').trim());

/** Luminancia relativa WCAG 2.x (0 = negro, 1 = blanco). @param {string} hex */
export function luminance(hex) {
	const [r, g, b] = hexToRgb(hex).map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores (1 a 21). @param {string} a @param {string} b */
export function contrastRatio(a, b) {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const LIGHT_TEXT = '#ffffff';
export const DARK_TEXT = '#1a1024';

/**
 * Texto claro u oscuro, el que más contraste tenga con el fondo.
 * @param {string} bg @param {string} [light] @param {string} [dark]
 */
export function readableText(bg, light = LIGHT_TEXT, dark = DARK_TEXT) {
	const useLight = contrastRatio(light, bg) >= contrastRatio(dark, bg);
	const c = useLight ? light : dark;
	// en tonos medios puede quedar apenas abajo de AA: blanco o negro puros (uno de los
	// dos siempre llega a 4.58 o más)
	if (contrastRatio(c, bg) < 4.5) return contrastRatio('#ffffff', bg) >= contrastRatio('#000000', bg) ? '#ffffff' : '#000000';
	return c;
}

/** @param {RGB} rgb @returns {[number, number, number]} h (0-360), s, l (0-1) */
function rgbToHsl([r, g, b]) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h;
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return [h * 60, s, l];
}

/** @param {number} h @param {number} s @param {number} l @returns {RGB} */
function hslToRgb(h, s, l) {
	const k = (/** @type {number} */ n) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (/** @type {number} */ n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
	return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Saturación HSL (0-1). @param {string} hex */
export const saturation = (hex) => rgbToHsl(hexToRgb(hex))[1];

/** Mezcla a con b (t = 0 → a, t = 1 → b). @param {string} a @param {string} b @param {number} t */
export function mix(a, b, t) {
	const x = hexToRgb(a);
	const y = hexToRgb(b);
	return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

/**
 * Aclara u oscurece fg (manteniendo el tono) hasta que tenga al menos `min` de contraste
 * con bg. Si no llega ni en blanco/negro, devuelve el texto legible (blanco o casi negro).
 * @param {string} fg @param {string} bg @param {number} [min]
 */
export function ensureContrast(fg, bg, min = 4.5) {
	if (contrastRatio(fg, bg) >= min) return fg;
	const [h, s, l] = rgbToHsl(hexToRgb(fg));
	// hacia donde hay más lugar: fondo oscuro → aclarar, fondo claro → oscurecer
	const up = luminance(bg) < 0.4;
	for (let i = 1; i <= 24; i++) {
		const nl = up ? l + ((1 - l) * i) / 24 : l - (l * i) / 24;
		const c = rgbToHex(hslToRgb(h, s, nl));
		if (contrastRatio(c, bg) >= min) return c;
	}
	return readableText(bg);
}

/** @param {number[]} a @param {number[]} b */
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Paleta de una imagen: k-means (inicialización k-means++ determinística) sobre un
 * histograma de 4 bits por canal, así el costo no depende del tamaño de la imagen.
 * Devuelve los colores ordenados por cuánto ocupan, sin casi-duplicados.
 * @param {ArrayLike<number>} pixels RGBA (como ImageData.data)
 * @param {number} [k]
 * @returns {Swatch[]}
 */
export function extractPalette(pixels, k = 6) {
	/** @type {Map<number, {n:number, r:number, g:number, b:number}>} */
	const buckets = new Map();
	let total = 0;
	for (let i = 0; i + 3 < pixels.length; i += 4) {
		if (pixels[i + 3] < 128) continue; // transparente
		const r = pixels[i];
		const g = pixels[i + 1];
		const b = pixels[i + 2];
		const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
		const bk = buckets.get(key);
		if (bk) {
			bk.n++;
			bk.r += r;
			bk.g += g;
			bk.b += b;
		} else buckets.set(key, { n: 1, r, g, b });
		total++;
	}
	if (!total) return [];
	const points = [...buckets.values()].map((b) => ({
		c: [b.r / b.n, b.g / b.n, b.b / b.n],
		w: b.n
	}));
	points.sort((a, b) => b.w - a.w);
	k = Math.min(k, points.length);
	// k-means++ determinístico: el más pesado primero, después el más lejos (ponderado)
	/** @type {number[][]} */
	const centers = [points[0].c.slice()];
	while (centers.length < k) {
		let best = -1;
		let bestScore = -1;
		for (let i = 0; i < points.length; i++) {
			const d = Math.min(...centers.map((c) => dist2(c, points[i].c)));
			const score = d * Math.sqrt(points[i].w);
			if (score > bestScore) {
				bestScore = score;
				best = i;
			}
		}
		if (bestScore <= 0) break;
		centers.push(points[best].c.slice());
	}
	const assign = new Array(points.length).fill(0);
	for (let iter = 0; iter < 12; iter++) {
		let moved = false;
		for (let i = 0; i < points.length; i++) {
			let bi = 0;
			let bd = Infinity;
			for (let j = 0; j < centers.length; j++) {
				const d = dist2(points[i].c, centers[j]);
				if (d < bd) {
					bd = d;
					bi = j;
				}
			}
			if (assign[i] !== bi) moved = true;
			assign[i] = bi;
		}
		const sums = centers.map(() => [0, 0, 0, 0]);
		points.forEach((p, i) => {
			const s = sums[assign[i]];
			s[0] += p.c[0] * p.w;
			s[1] += p.c[1] * p.w;
			s[2] += p.c[2] * p.w;
			s[3] += p.w;
		});
		sums.forEach((s, j) => {
			if (s[3]) centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
		});
		if (!moved && iter > 0) break;
	}
	const weights = centers.map(() => 0);
	points.forEach((p, i) => (weights[assign[i]] += p.w));
	/** @type {Swatch[]} */
	const out = [];
	centers
		.map((c, j) => ({ c, w: weights[j] }))
		.filter((x) => x.w > 0)
		.sort((a, b) => b.w - a.w)
		.forEach(({ c, w }) => {
			// casi iguales (distancia < ~20 por canal): se suman al que ya está
			const twin = out.find((s) => dist2(s.rgb, c) < 20 * 20 * 3);
			if (twin) twin.weight += w / total;
			else
				out.push({
					hex: rgbToHex(c),
					rgb: /** @type {RGB} */ (c.map(Math.round)),
					weight: w / total
				});
		});
	return out.sort((a, b) => b.weight - a.weight);
}

/**
 * Paleta de una imagen ya cargada, leyendo una versión chiquita en un canvas.
 * @param {CanvasImageSource} img @param {number} [k]
 * @returns {Swatch[]}
 */
export function paletteFromImage(img, k = 6) {
	if (!img || typeof document === 'undefined') return [];
	try {
		const n = 64;
		const cv = document.createElement('canvas');
		cv.width = n;
		cv.height = n;
		const cx = /** @type {CanvasRenderingContext2D} */ (
			cv.getContext('2d', { willReadFrequently: true })
		);
		cx.drawImage(img, 0, 0, n, n);
		return extractPalette(cx.getImageData(0, 0, n, n).data, k);
	} catch (e) {
		// imagen de otro origen sin CORS
		return [];
	}
}

/** @typedef {{bg:string, main:string, accent:string}} Roles */

/**
 * Elige fondo, color de títulos y acento a partir de los colores de la imagen:
 * fondo = el que más ocupa; títulos = el que más resalta sobre el fondo (contraste y
 * saturación); acento = otro color vivo distinto de los dos. Si la imagen no da para
 * tanto (blanco y negro, por ejemplo) se completan con colores derivados.
 * @param {Swatch[]} swatches
 * @returns {Roles}
 */
export function pickRoles(swatches) {
	if (!swatches.length) return { bg: '#2b0f4e', main: '#f7a1dc', accent: '#f6f08c' };
	const bg = swatches[0].hex;
	const rest = swatches.slice(1);
	/** @param {string} hex @param {number} w */
	const vivid = (hex, w) =>
		Math.min(contrastRatio(hex, bg), 7) * (0.35 + saturation(hex)) * Math.sqrt(w + 0.03);
	let main = '';
	let best = 0;
	for (const s of rest) {
		const score = vivid(s.hex, s.weight);
		if (contrastRatio(s.hex, bg) >= 1.6 && score > best) {
			best = score;
			main = s.hex;
		}
	}
	if (!main) main = readableText(bg);
	let accent = '';
	best = 0;
	for (const s of rest) {
		if (s.hex === main) continue;
		const apart = Math.sqrt(dist2(s.rgb, hexToRgb(main))) / 441;
		const score = vivid(s.hex, s.weight) * (0.2 + apart);
		if (contrastRatio(s.hex, bg) >= 1.4 && score > best) {
			best = score;
			accent = s.hex;
		}
	}
	if (!accent) {
		// complementario del fondo, con luminosidad opuesta
		const [h, s] = rgbToHsl(hexToRgb(bg));
		accent = rgbToHex(hslToRgb((h + 180) % 360, Math.max(0.6, s), luminance(bg) < 0.4 ? 0.7 : 0.35));
	}
	return { bg, main, accent };
}

/**
 * Paleta completa del generador a partir de tres colores, cuidando el contraste de cada
 * texto con el fondo sobre el que va.
 * @param {Roles} r
 * @param {string} [extra] cuarto color opcional (lomas, fondo del duotono)
 */
export function derivePalette({ bg, main, accent }, extra) {
	const dark = luminance(bg) < 0.18;
	const title = ensureContrast(main, bg, 3);
	let acc = ensureContrast(accent, bg, 3);
	// si el acento terminó casi igual al título, se usa el color de texto
	if (contrastRatio(acc, title) < 1.25) acc = readableText(bg);
	const text = readableText(bg);
	const extrude = dark ? mix(bg, '#000000', 0.55) : mix(title, '#000000', 0.62);
	const bg2 = extra && contrastRatio(extra, bg) > 1.3 ? extra : mix(accent, bg, 0.35);
	return {
		label: 'Personalizada',
		bg,
		bg2,
		title,
		extrude,
		outline: dark && contrastRatio(acc, title) > 1.5 ? acc : null,
		small: acc,
		sub: acc,
		accent: acc,
		text,
		pillBg: acc,
		pillFg: readableText(acc),
		dots: mix(bg, title, 0.28),
		duoDark: dark ? mix(bg, '#000000', 0.25) : mix(title, '#000000', 0.45),
		duoLight: mix(title, '#ffffff', 0.35),
		badge: title,
		badgeText: readableText(title),
		tape: acc,
		tapeText: readableText(acc)
	};
}
