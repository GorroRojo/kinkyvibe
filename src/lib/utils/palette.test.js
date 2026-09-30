import { describe, it, expect } from 'vitest';
import {
	hexToRgb,
	rgbToHex,
	luminance,
	contrastRatio,
	readableText,
	ensureContrast,
	extractPalette,
	pickRoles,
	derivePalette,
	mix,
	LIGHT_TEXT,
	DARK_TEXT
} from './palette.js';

/** RGBA de una "imagen" con bloques de colores: [[hex, cantidad de píxeles], ...] */
function pixels(/** @type {[string, number][]} */ blocks) {
	const out = [];
	for (const [hex, n] of blocks) {
		const [r, g, b] = hexToRgb(hex);
		for (let i = 0; i < n; i++) out.push(r, g, b, 255);
	}
	return new Uint8ClampedArray(out);
}

describe('colores y contraste', () => {
	it('convierte hex ↔ rgb', () => {
		expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
		expect(hexToRgb('#f80')).toEqual([255, 136, 0]);
		expect(rgbToHex([255, 128, 0])).toBe('#ff8000');
		expect(rgbToHex([300, -5, 12.4])).toBe('#ff000c');
	});
	it('luminancia y contraste WCAG', () => {
		expect(luminance('#000000')).toBe(0);
		expect(luminance('#ffffff')).toBeCloseTo(1);
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
		expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1);
		// #767676 sobre blanco es el gris más claro que pasa AA (4.54)
		expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
	});
	it('elige texto claro u oscuro según el fondo', () => {
		expect(readableText('#1b0033')).toBe(LIGHT_TEXT);
		expect(readableText('#f7b2e3')).toBe(DARK_TEXT);
		expect(readableText('#f6f08c')).toBe(DARK_TEXT);
		expect(readableText('#6b2ee6')).toBe(LIGHT_TEXT);
	});
	it('readableText siempre llega a AA', () => {
		for (const bg of ['#808080', '#ff0000', '#00ff00', '#0000ff', '#f4622f', '#3cc2bd', '#777777']) {
			expect(contrastRatio(readableText(bg), bg)).toBeGreaterThanOrEqual(4.5);
		}
	});
	it('ensureContrast ajusta la luminosidad manteniendo el color', () => {
		const fg = ensureContrast('#f7a1dc', '#ffffff', 3);
		expect(contrastRatio(fg, '#ffffff')).toBeGreaterThanOrEqual(3);
		const [r, g, b] = hexToRgb(fg);
		expect(r).toBeGreaterThan(g); // sigue siendo rosa, no gris
		expect(ensureContrast('#ffffff', '#000000', 4.5)).toBe('#ffffff');
		expect(contrastRatio(ensureContrast('#3a0d78', '#2b0f4e', 4.5), '#2b0f4e')).toBeGreaterThanOrEqual(4.5);
	});
	it('mix mezcla en RGB', () => {
		expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
		expect(mix('#ff0000', '#0000ff', 0)).toBe('#ff0000');
	});
});

describe('extractPalette', () => {
	it('encuentra los colores de la imagen, ordenados por cuánto ocupan', () => {
		const pal = extractPalette(
			pixels([
				['#f4622f', 600],
				['#2b0f4e', 300],
				['#f6f08c', 100]
			]),
			4
		);
		expect(pal.map((s) => s.hex)).toEqual(['#f4622f', '#2b0f4e', '#f6f08c']);
		expect(pal[0].weight).toBeCloseTo(0.6);
		expect(pal.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1);
	});
	it('junta tonos casi iguales y agrupa el ruido', () => {
		const pal = extractPalette(
			pixels([
				['#f4622f', 300],
				['#f2602d', 300],
				['#f66431', 200],
				['#1b4b50', 200]
			]),
			6
		);
		expect(pal.length).toBe(2);
		expect(contrastRatio(pal[0].hex, '#f4622f')).toBeLessThan(1.1);
		expect(pal[0].weight).toBeCloseTo(0.8);
	});
	it('ignora los píxeles transparentes y no se rompe sin datos', () => {
		expect(extractPalette(new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 0]))).toEqual([]);
		expect(extractPalette(new Uint8ClampedArray([]))).toEqual([]);
	});
	it('es determinística', () => {
		const px = pixels([
			['#123456', 50],
			['#abcdef', 70],
			['#ff00aa', 30],
			['#00ffaa', 20]
		]);
		expect(extractPalette(px)).toEqual(extractPalette(px));
	});
});

describe('pickRoles y derivePalette', () => {
	it('fondo = el que más ocupa, títulos = el que más resalta', () => {
		const sw = extractPalette(
			pixels([
				['#2b0f4e', 700],
				['#31255e', 100], // casi el fondo: no sirve para títulos
				['#f7a1dc', 120],
				['#f6f08c', 80]
			])
		);
		const r = pickRoles(sw);
		expect(r.bg).toBe(sw[0].hex);
		expect([r.main, r.accent].sort()).toEqual(['#f6f08c', '#f7a1dc'].sort());
	});
	it('con una imagen de un solo color igual arma algo legible', () => {
		const r = pickRoles(extractPalette(pixels([['#f7b2e3', 100]])));
		expect(r.bg).toBe('#f7b2e3');
		expect(contrastRatio(r.main, r.bg)).toBeGreaterThan(3);
		expect(r.accent).toMatch(/^#[0-9a-f]{6}$/);
	});
	it('sin colores usa una paleta de la casa', () => {
		expect(pickRoles([])).toEqual({ bg: '#2b0f4e', main: '#f7a1dc', accent: '#f6f08c' });
	});
	it('cualquier combinación de colores queda legible', () => {
		const cases = [
			{ bg: '#ffffff', main: '#ffff00', accent: '#eeeeee' },
			{ bg: '#000000', main: '#111111', accent: '#222222' },
			{ bg: '#f4622f', main: '#f4622f', accent: '#f4622f' },
			{ bg: '#808080', main: '#7f7f7f', accent: '#818181' }
		];
		for (const c of cases) {
			const p = derivePalette(c);
			expect(contrastRatio(p.text, p.bg)).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(p.title, p.bg)).toBeGreaterThanOrEqual(3);
			expect(contrastRatio(p.small, p.bg)).toBeGreaterThanOrEqual(3);
			expect(contrastRatio(p.pillFg, p.pillBg)).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(p.badgeText, p.badge)).toBeGreaterThanOrEqual(3);
			expect(contrastRatio(p.tapeText, p.tape)).toBeGreaterThanOrEqual(4.5);
		}
	});
});
