import { describe, expect, it } from 'vitest';
import { AA, AA_GRANDE, contrast, hexToRgb, rgbToHex, rgbToHsl } from './flyerColors.js';
import {
	MARCA,
	PALETAS,
	acentoDelFlyer,
	conFondoPropio,
	elegirPaleta,
	paletasDelCarrusel,
	textoSobre
} from './carruselPaletas.js';

/** Un generador fijo (las pruebas dan siempre lo mismo). @param {number} seed */
function rng(seed) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

/**
 * Los pares de texto y fondo de una diapositiva, con el contraste que necesitan: los títulos son
 * texto grande (3:1), el resto texto normal (4.5:1).
 * @param {import('./carruselPaletas.js').PaletaDiapositiva} p
 * @returns {[string, string, number][]}
 */
const pares = (p) => [
	[p.ink, p.bg, AA],
	[p.tituloInk, p.bg, AA_GRANDE],
	[p.altInk, p.alt, AA],
	[p.altTituloInk, p.alt, AA_GRANDE],
	[p.cintaInk, p.cinta, AA],
	[p.claroInk, p.claro, AA],
	[p.acento, p.claro, AA_GRANDE],
	['#ffffff', p.oscuro, AA],
	[p.oscuro, '#ffffff', AA],
	[p.flyerInk, p.flyer, AA_GRANDE]
];

const brand = new Set(Object.values(MARCA));
const hue = (/** @type {string} */ hex) => rgbToHsl(hexToRgb(hex)).h;

describe('textoSobre', () => {
	it('blanco si se lee; si no, la tinta de la marca', () => {
		expect(textoSobre(MARCA.violetaOscuro)).toBe('#ffffff');
		expect(textoSobre(MARCA.verde)).toBe(MARCA.tinta);
		expect(textoSobre(MARCA.amarillo)).toBe(MARCA.tinta);
	});
	it('un título (texto grande) se queda en blanco con 3:1; el texto chico necesita 4.5:1', () => {
		// el rosa de la marca: 3.3:1 con blanco
		expect(contrast('#ffffff', MARCA.rosa)).toBeGreaterThan(AA_GRANDE);
		expect(contrast('#ffffff', MARCA.rosa)).toBeLessThan(AA);
		expect(textoSobre(MARCA.rosa, { grande: true })).toBe('#ffffff');
		expect(textoSobre(MARCA.rosa)).toBe(MARCA.tinta);
	});
	it('sobre cualquier fondo pasa lo que pide', () => {
		const next = rng(3);
		for (let i = 0; i < 300; i++) {
			const bg = rgbToHex({ r: next() * 255, g: next() * 255, b: next() * 255 });
			expect(contrast(textoSobre(bg), bg)).toBeGreaterThanOrEqual(AA);
			expect(contrast(textoSobre(bg, { grande: true }), bg)).toBeGreaterThanOrEqual(AA_GRANDE);
		}
	});
});

describe('las paletas de la marca', () => {
	it('las tres primeras son las del prototipo v2 (rosa, verde, violeta)', () => {
		expect(PALETAS.slice(0, 3).map((p) => p.bg)).toEqual([
			MARCA.rosa,
			MARCA.verde,
			MARCA.violetaOscuro
		]);
	});
	it('fondos y bloques son siempre colores de la marca', () => {
		for (const p of PALETAS) {
			for (const k of /** @type {const} */ (['bg', 'alt', 'claro', 'oscuro', 'medio', 'papel'])) {
				expect(brand.has(p[k]), `${p.id}.${k}`).toBe(true);
			}
		}
	});
});

describe('elegirPaleta: la que más hace resaltar al flyer', () => {
	it('un flyer verde no va sobre el verde; uno fucsia no va sobre el rosa ni el fucsia', () => {
		const verde = elegirPaleta(['#0f8b7a', '#ff9f1c', '#fdf6e3']);
		expect(PALETAS[verde].id).not.toBe('verde');
		const fucsia = elegirPaleta(['#e6148c', '#ffe14d']);
		expect(['rosa', 'fucsia']).not.toContain(PALETAS[fucsia].id);
		// el tono del fondo elegido queda lejos del flyer
		const d = Math.abs(hue(PALETAS[fucsia].bg) - hue('#e6148c')) % 360;
		expect(Math.min(d, 360 - d)).toBeGreaterThan(90);
	});
	it('un flyer violeta va sobre otra cosa que el violeta', () => {
		expect(PALETAS[elegirPaleta(['#3a1c71', '#b8f34a'])].id).not.toBe('violeta');
	});
	it('un flyer gris oscuro va sobre un fondo claro (manda el contraste)', () => {
		const p = PALETAS[elegirPaleta(['#222222', '#444444'])];
		expect(contrast(p.bg, '#222222')).toBeGreaterThan(5);
	});
	it('evita repetir la paleta de la diapositiva anterior si hay otra casi igual de buena', () => {
		// un flyer gris: varias paletas sirven parecido
		const gris = ['#808080'];
		const first = elegirPaleta(gris);
		expect(elegirPaleta(gris, { evitar: first })).not.toBe(first);
		// uno fucsia: el verde gana por mucho y se repite igual
		const fucsia = ['#e6148c'];
		const best = elegirPaleta(fucsia);
		expect(elegirPaleta(fucsia, { evitar: best })).toBe(best);
	});
});

describe('acentoDelFlyer', () => {
	it('el color más vivo del flyer, avivado, si se ve contra el fondo', () => {
		const a = acentoDelFlyer(['#f4ede1', '#d62828', '#1d3557'], MARCA.verde);
		expect(a).not.toBeNull();
		// rojo, como el del flyer
		const h = hue(/** @type {string} */ (a));
		expect(Math.min(h, 360 - h)).toBeLessThan(15);
		expect(rgbToHsl(hexToRgb(/** @type {string} */ (a))).s).toBeGreaterThanOrEqual(0.79);
	});
	it('un flyer gris no da acento; uno que se pierde contra el fondo, tampoco', () => {
		expect(acentoDelFlyer(['#808080', '#f0f0f0'], MARCA.verde)).toBeNull();
		expect(acentoDelFlyer(['#12d3a3'], MARCA.verde)).toBeNull();
	});
});

describe('paletasDelCarrusel', () => {
	it('sin flyer (o sin colores guardados), las paletas del prototipo rotan', () => {
		const p = paletasDelCarrusel([
			{ hasImage: false },
			{ hasImage: true, colors: null },
			{ hasImage: false, colors: ['#e6148c'] },
			{ hasImage: false }
		]);
		expect(p.map((x) => x.paleta)).toEqual(['rosa', 'verde', 'violeta', 'rosa']);
		// sin acento del flyer: la cinta y la estrella de la paleta
		expect(p[0].cinta).toBe(PALETAS[0].cinta);
		expect(p[0].sello).toBe(PALETAS[0].sello);
	});
	it('con colores, el fondo lo elige el flyer y el acento sale del flyer', () => {
		const [p] = paletasDelCarrusel([{ hasImage: true, colors: ['#0f8b7a', '#ff9f1c'] }]);
		expect(p.paleta).not.toBe('verde');
		expect(brand.has(p.bg)).toBe(true);
		expect(brand.has(p.cinta)).toBe(false);
		expect(p.sello).toBe(p.cinta);
	});
	it('cada texto pasa lo suyo (títulos 3:1, el resto 4.5:1), con cualquier flyer', () => {
		const next = rng(42);
		const color = () => rgbToHex({ r: next() * 255, g: next() * 255, b: next() * 255 });
		for (let i = 0; i < 200; i++) {
			const slides = Array.from({ length: 5 }, () => ({
				hasImage: next() > 0.2,
				colors: Array.from({ length: 1 + Math.floor(next() * 5) }, color)
			}));
			for (const p of paletasDelCarrusel(slides)) {
				expect(brand.has(p.bg)).toBe(true);
				for (const [fg, bg, min] of pares(p)) {
					expect(contrast(fg, bg), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(min);
				}
			}
		}
	});
	it('los títulos sobre fondos oscuros o el rosa van en blanco', () => {
		const p = paletasDelCarrusel([{ hasImage: false }, { hasImage: false }, { hasImage: false }]);
		expect(p[0].tituloInk).toBe('#ffffff'); // rosa
		expect(p[1].altTituloInk).toBe('#ffffff'); // fucsia, la otra mitad de D
		expect(p[2].tituloInk).toBe('#ffffff'); // violeta
		expect(p[1].tituloInk).toBe(MARCA.tinta); // verde: el blanco no llega a 3:1
	});
});

describe('conFondoPropio (colores escritos a mano en el evento)', () => {
	it('manda el fondo y corre el texto hasta que se lea', () => {
		const [base] = paletasDelCarrusel([{ hasImage: false }]);
		const p = conFondoPropio(base, '#f2a68f', '#ffffff');
		expect(p.bg).toBe('#f2a68f');
		expect(contrast(p.ink, p.bg)).toBeGreaterThanOrEqual(AA);
		expect(contrast(p.tituloInk, p.bg)).toBeGreaterThanOrEqual(AA_GRANDE);
		expect(conFondoPropio(base, '#000000', null).ink).toBe('#ffffff');
	});
});
