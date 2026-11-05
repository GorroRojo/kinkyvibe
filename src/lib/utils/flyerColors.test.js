import { describe, expect, it } from 'vitest';
import {
	AA,
	COLORS_MAX,
	colorsFromImage,
	contrast,
	ensureContrast,
	extractColors,
	hexToRgb,
	isHexColor,
	parseColors,
	readableInk,
	rgbToHex
} from './flyerColors.js';

/**
 * Píxeles RGBA de mentira: `[color, cantidad]`, con alfa opaco salvo que se diga.
 * @param {[[number, number, number, number?], number][]} parts
 */
function pixels(parts) {
	/** @type {number[]} */
	const out = [];
	for (const [[r, g, b, a = 255], n] of parts) for (let i = 0; i < n; i++) out.push(r, g, b, a);
	return new Uint8ClampedArray(out);
}

/** Un generador fijo (las pruebas dan siempre lo mismo). @param {number} seed */
function rng(seed) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

describe('contraste (WCAG)', () => {
	it('negro sobre blanco es 21:1 y un color consigo mismo 1:1', () => {
		expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
		expect(contrast('#ff00aa', '#ff00aa')).toBeCloseTo(1, 5);
		// el gris de AA justo: #767676 sobre blanco pasa 4.5
		expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(AA);
		expect(contrast('#777777', '#ffffff')).toBeLessThan(AA);
	});

	it('ensureContrast deja un color que ya se lee y corre el que no, sin cambiar de tono', () => {
		expect(ensureContrast('#000000', '#ffffff')).toBe('#000000');
		const fixed = ensureContrast('#ff66cc', '#ffffff');
		expect(contrast(fixed, '#ffffff')).toBeGreaterThanOrEqual(AA);
		// sigue siendo rosado: el rojo y el azul le ganan al verde
		const { r, g, b } = hexToRgb(fixed);
		expect(r).toBeGreaterThan(g);
		expect(b).toBeGreaterThan(g);
		// sobre un fondo oscuro, aclara
		const light = ensureContrast('#552288', '#1a1a1a');
		expect(contrast(light, '#1a1a1a')).toBeGreaterThanOrEqual(AA);
	});

	it('readableInk siempre pasa AA, sobre cualquier fondo', () => {
		const next = rng(7);
		for (let i = 0; i < 400; i++) {
			const bg = rgbToHex({ r: next() * 255, g: next() * 255, b: next() * 255 });
			expect(contrast(readableInk(bg), bg), bg).toBeGreaterThanOrEqual(AA);
		}
		// los grises del medio (donde ni el negro ni el blanco sobran) también
		for (let v = 0; v <= 255; v += 5) {
			const bg = rgbToHex({ r: v, g: v, b: v });
			expect(contrast(readableInk(bg), bg), bg).toBeGreaterThanOrEqual(AA);
		}
	});
});

describe('parseColors', () => {
	it('se queda con los #rrggbb, en minúsculas, sin repetir y hasta 5', () => {
		expect(parseColors(['#FF00AA', '#ff00aa', 'rojo', '#abc', '#112233'])).toEqual([
			'#ff00aa',
			'#112233'
		]);
		expect(parseColors('["#000000","#ffffff"]')).toEqual(['#000000', '#ffffff']);
		const many = Array.from({ length: 9 }, (_, i) => `#00000${i}`);
		expect(parseColors(many)).toHaveLength(COLORS_MAX);
	});
	it('nada válido es null', () => {
		expect(parseColors(null)).toBeNull();
		expect(parseColors('no es json')).toBeNull();
		expect(parseColors({ a: '#000000' })).toBeNull();
		expect(parseColors(['javascript:alert(1)', 'url(x)'])).toBeNull();
		expect(isHexColor('#ff00aa; background:url(x)')).toBe(false);
	});
});

describe('extractColors', () => {
	it('un flyer con fondo blanco y título fucsia da primero el fucsia (lo vivo pesa más)', () => {
		const colors = extractColors(
			pixels([
				[[250, 250, 250], 700],
				[[230, 20, 140], 250],
				[[20, 20, 20], 50]
			])
		);
		expect(colors[0]).toBe('#e6148c');
		expect(colors).toContain('#fafafa');
		expect(colors).toContain('#141414');
	});
	it('ignora lo transparente y junta los colores casi iguales', () => {
		const colors = extractColors(
			pixels([
				[[0, 200, 0, 0], 900],
				[[40, 90, 200], 50],
				[[44, 94, 206], 50]
			])
		);
		expect(colors).toHaveLength(1);
		expect(colors[0]).toMatch(/^#2[89a-f][5-6][0-9a-f]c[0-9a-f]$/);
	});
	it('sin píxeles opacos, nada; nunca más de `max`', () => {
		expect(extractColors(pixels([[[1, 2, 3, 0], 10]]))).toEqual([]);
		const rainbow = pixels(
			Array.from({ length: 12 }, (_, i) => /** @type {any} */ ([[i * 20, 255 - i * 20, i * 7], 5]))
		);
		expect(extractColors(rainbow, { max: 3 })).toHaveLength(3);
	});
});

describe('colorsFromImage', () => {
	/** @param {Uint8ClampedArray} data */
	const canvasWith = (data) =>
		/** @type {any} */ (
			() => ({
				getContext: () => ({ drawImage() {}, getImageData: () => ({ data }) })
			})
		);
	it('dibuja chiquito y saca los colores', () => {
		const data = pixels([[[230, 20, 140], 64 * 64]]);
		expect(colorsFromImage(/** @type {any} */ ({}), canvasWith(data))).toEqual(['#e6148c']);
	});
	it('si el canvas no deja leer (imagen de otro sitio) o no hay canvas, null', () => {
		const tainted = /** @type {any} */ (
			() => ({
				getContext: () => ({
					drawImage() {},
					getImageData() {
						throw new Error('SecurityError');
					}
				})
			})
		);
		expect(colorsFromImage(/** @type {any} */ ({}), tainted)).toBeNull();
		expect(
			colorsFromImage(
				/** @type {any} */ ({}),
				/** @type {any} */ (() => ({ getContext: () => null }))
			)
		).toBeNull();
	});
});
