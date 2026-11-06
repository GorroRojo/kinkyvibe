/**
 * Los colores de cada diapositiva del carrusel de la portada (docs/estilo.md, «Carrusel de la
 * portada»). gorrite, al ver la v3 (5/11): los fondos y los bloques son SIEMPRE de la marca (los
 * colores saturados del prototipo v2); el flyer no se pinta con sus propios colores (se perdía
 * contra el fondo). Los colores del flyer sirven para dos cosas:
 *
 * 1. **Elegir** cuál de las paletas de la marca va detrás ({@link elegirPaleta}): la que más se
 *    distingue del color principal del flyer (tono y contraste), así el flyer resalta. Dos
 *    diapositivas seguidas evitan repetir paleta si hay otra casi igual de buena.
 * 2. **Acento** ({@link acentoDelFlyer}): el color más vivo del flyer, avivado, en lo chico (la
 *    estrella con la fecha, la cinta adhesiva, la franja de la fecha), solo si se ve contra el
 *    fondo; si no, el de la paleta.
 *
 * Los textos ({@link textoSobre}): blanco si se lee, si no la tinta oscura de la marca (si no, el
 * color corrido hasta que pase). Los títulos son texto grande (≥ 24 px, en negrita): les alcanza
 * 3:1 (WCAG AA texto grande, {@link AA_GRANDE}); el resto, 4.5:1 ({@link AA}).
 *
 * Sin flyer, o con un flyer sin sus colores guardados: las paletas de la marca rotan.
 *
 * Puro (sin Svelte ni DOM): la portada, el panel y vitest.
 */
import {
	AA,
	AA_GRANDE,
	chroma,
	contrast,
	ensureContrast,
	hexToRgb,
	hslHex,
	hueDistance,
	parseColors,
	rgbToHsl
} from './flyerColors.js';

/** @param {number} h @param {number} s en % @param {number} l en % */
const hsl = (h, s, l) => hslHex({ h, s: s / 100, l: l / 100 });

const BLANCO = '#ffffff';

/** Los colores de la marca (los mismos de src/lib/styles/style.scss), en hex para medirlos. */
export const MARCA = Object.freeze({
	rosa: hsl(319, 90, 60), // --1
	violeta: hsl(262, 90, 60), // --2
	verde: hsl(165, 84, 45), // --3
	amarillo: hsl(50, 100, 60), // --4
	rosaClaro: hsl(319, 100, 70), // --1-light
	violetaClaro: hsl(262, 100, 75), // --2-light
	verdeClaro: hsl(165, 84, 65), // --3-light
	amarilloClaro: hsl(50, 100, 70), // --4-light
	fucsia: hsl(319, 100, 40), // --1-dark
	violetaOscuro: hsl(262, 90, 50), // --2-dark
	verdeOscuro: hsl(165, 84, 30), // --3-dark
	rosaTinte: hsl(319, 100, 95), // --1-tint
	violetaTinte: hsl(262, 100, 96), // --2-tint
	verdeTinte: hsl(165, 70, 92), // --3-tint
	amarilloTinte: hsl(50, 100, 90), // --4-tint
	rosaTinta: hsl(319, 100, 36), // --1-ink
	verdeTinta: hsl(165, 84, 24), // --3-ink
	// --kv-tinta del carrusel: color-mix(in srgb, var(--2-dark) 30%, black)
	tinta: '#1d0449'
});

/**
 * Las paletas de la marca. Las tres primeras son las del prototipo v2 (las que gorrite vio). Cada
 * una: `bg` (el fondo), `alt` (la otra mitad de D, el segundo papel de A), `cinta` (las franjas con
 * texto), `garabato` (los dibujitos), `claro` y `acento` (la mesa de C y su título), `oscuro` (el
 * velo y las tiras de E, «Comprar»), `medio` (el fondo de E, debajo del velo `oscuro`: de su mismo tono), `papel` (el primer papel de A),
 * `sello` (el borde de la estrella) y `flyer`/`flyerInk` (el flyer hecho con el título, sin
 * imagen, como en el prototipo).
 */
export const PALETAS = Object.freeze([
	{
		id: 'rosa',
		bg: MARCA.rosa,
		alt: MARCA.violetaOscuro,
		cinta: MARCA.violetaOscuro,
		garabato: MARCA.violetaOscuro,
		claro: MARCA.violetaTinte,
		acento: MARCA.violetaOscuro,
		oscuro: MARCA.violetaOscuro,
		medio: MARCA.violetaClaro,
		papel: MARCA.amarilloClaro,
		sello: MARCA.rosa,
		flyer: MARCA.violetaOscuro,
		flyerInk: MARCA.amarilloClaro
	},
	{
		id: 'verde',
		bg: MARCA.verde,
		alt: MARCA.fucsia,
		cinta: MARCA.violetaOscuro,
		garabato: MARCA.amarilloClaro,
		claro: MARCA.verdeTinte,
		acento: MARCA.verdeTinta,
		oscuro: MARCA.violetaOscuro,
		medio: MARCA.violetaClaro,
		papel: MARCA.amarilloClaro,
		sello: MARCA.rosa,
		flyer: MARCA.fucsia,
		flyerInk: BLANCO
	},
	{
		id: 'violeta',
		bg: MARCA.violetaOscuro,
		alt: MARCA.verde,
		cinta: MARCA.amarilloClaro,
		garabato: MARCA.rosaClaro,
		claro: MARCA.violetaTinte,
		acento: MARCA.violetaOscuro,
		oscuro: MARCA.violetaOscuro,
		medio: MARCA.violetaClaro,
		papel: MARCA.amarilloClaro,
		sello: MARCA.rosa,
		flyer: MARCA.amarilloClaro,
		flyerInk: MARCA.violetaOscuro
	},
	{
		id: 'amarillo',
		bg: MARCA.amarillo,
		alt: MARCA.violetaOscuro,
		cinta: MARCA.fucsia,
		garabato: MARCA.rosa,
		claro: MARCA.amarilloTinte,
		acento: MARCA.rosaTinta,
		oscuro: MARCA.violetaOscuro,
		medio: MARCA.violetaClaro,
		papel: MARCA.rosaClaro,
		sello: MARCA.rosa,
		flyer: MARCA.violetaOscuro,
		flyerInk: MARCA.amarilloClaro
	},
	{
		id: 'fucsia',
		bg: MARCA.fucsia,
		alt: MARCA.amarillo,
		cinta: MARCA.verde,
		garabato: MARCA.rosaClaro,
		claro: MARCA.rosaTinte,
		acento: MARCA.rosaTinta,
		oscuro: MARCA.rosaTinta,
		medio: MARCA.rosaClaro,
		papel: MARCA.verdeClaro,
		sello: MARCA.verde,
		flyer: MARCA.amarillo,
		flyerInk: MARCA.violetaOscuro
	}
]);

/** Sin flyer, las paletas rotan entre estas (las tres del prototipo v2). */
const ROTAN_SIN_FLYER = 3;

/**
 * El color de un texto sobre `bg`: blanco si se lee, si no la tinta de la marca; si ninguno
 * llega (no pasa con los colores de la marca), el que más contraste da, corrido hasta pasar.
 * @param {string} bg
 * @param {{ grande?: boolean }} [opts] `grande`: un título (≥ 24 px en negrita): alcanza 3:1
 */
export function textoSobre(bg, { grande = false } = {}) {
	const min = grande ? AA_GRANDE : AA;
	if (contrast(BLANCO, bg) >= min) return BLANCO;
	if (contrast(MARCA.tinta, bg) >= min) return MARCA.tinta;
	return ensureContrast(
		contrast(BLANCO, bg) > contrast(MARCA.tinta, bg) ? BLANCO : MARCA.tinta,
		bg,
		min
	);
}

/** @param {string} hex */
const hslOf = (hex) => rgbToHsl(hexToRgb(hex));

/**
 * El color principal del flyer: el primero vivo de los guardados (o el primero, si es todo gris).
 * @param {string[]} colors
 */
function principal(colors) {
	return colors.find((c) => chroma(hslOf(c)) >= 0.2) ?? colors[0];
}

/**
 * Cuánto se distingue un fondo del flyer (de 0 a 1, más es mejor): el tono (si el flyer tiene
 * color) y el contraste con el color principal, y un poco con los demás.
 * @param {string} bg
 * @param {string[]} colors
 */
export function distancia(bg, colors) {
	const score = (/** @type {string} */ c) => {
		const f = hslOf(c);
		const vivo = Math.min(1, chroma(f) * 2.5);
		const tono = (hueDistance(hslOf(bg).h, f.h) / 180) * vivo;
		const luz = Math.log(contrast(bg, c)) / Math.log(21);
		return 0.6 * tono + 0.4 * luz + (1 - vivo) * 0.25 * luz;
	};
	const main = principal(colors);
	const rest = colors.filter((c) => c !== main);
	const others = rest.length ? Math.min(...rest.map(score)) : score(main);
	return 0.75 * score(main) + 0.25 * others;
}

/**
 * Qué paleta de la marca va detrás de un flyer: la que más se le distingue. Si `evitar` (la de la
 * diapositiva anterior) gana por poco, otra.
 * @param {string[]} colors los colores guardados del flyer (ya limpios)
 * @param {{ evitar?: number | null }} [opts]
 * @returns {number} el índice en {@link PALETAS}
 */
export function elegirPaleta(colors, { evitar = null } = {}) {
	let best = 0;
	let bestScore = -Infinity;
	PALETAS.forEach((p, i) => {
		const s = distancia(p.bg, colors) - (i === evitar ? 0.08 : 0);
		if (s > bestScore) {
			best = i;
			bestScore = s;
		}
	});
	return best;
}

/**
 * El acento que sale del flyer: su color más vivo, avivado (saturado y de luz media), si se ve
 * contra el fondo `bg`; si no hay uno así, `null` (va el de la paleta).
 * @param {string[]} colors
 * @param {string} bg
 * @returns {string | null}
 */
export function acentoDelFlyer(colors, bg) {
	const vivos = colors
		.map((c) => ({ c, f: hslOf(c) }))
		.filter(({ f }) => chroma(f) >= 0.3)
		.sort((a, b) => chroma(b.f) - chroma(a.f));
	for (const { f } of vivos) {
		const acento = hslHex({
			h: f.h,
			s: Math.max(f.s, 0.8),
			l: Math.min(0.62, Math.max(0.42, f.l))
		});
		if (hueDistance(hslOf(acento).h, hslOf(bg).h) >= 40 || contrast(acento, bg) >= 1.8) {
			return acento;
		}
	}
	return null;
}

/**
 * @typedef {{
 *   paleta: string, bg: string, ink: string, tituloInk: string, alt: string, altInk: string,
 *   altTituloInk: string, cinta: string, cintaInk: string, garabato: string, claro: string,
 *   claroInk: string, acento: string, oscuro: string, medio: string, papel: string,
 *   sello: string, flyer: string, flyerInk: string, cintaAdhesiva: string
 * }} PaletaDiapositiva
 *   Todos `#rrggbb`. `ink`/`tituloInk`: el texto y el título sobre `bg`; `altInk`/`altTituloInk`,
 *   sobre `alt`; `cintaInk`, sobre `cinta`; `claroInk` sobre `claro` (y `acento` es el título
 *   ahí); `oscuro` lleva texto blanco; `cintaAdhesiva`: la de A (decorativa).
 */

/**
 * Los colores de una paleta, con los textos que se leen.
 * @param {(typeof PALETAS)[number]} p
 * @param {string | null} acento el del flyer (o `null`)
 * @returns {PaletaDiapositiva}
 */
function completar(p, acento) {
	const cinta = acento ?? p.cinta;
	return {
		paleta: p.id,
		bg: p.bg,
		ink: textoSobre(p.bg),
		tituloInk: textoSobre(p.bg, { grande: true }),
		alt: p.alt,
		altInk: textoSobre(p.alt),
		altTituloInk: textoSobre(p.alt, { grande: true }),
		cinta,
		cintaInk: textoSobre(cinta),
		garabato: p.garabato,
		claro: p.claro,
		claroInk: textoSobre(p.claro),
		acento: ensureContrast(p.acento, p.claro, AA_GRANDE),
		oscuro: p.oscuro,
		medio: p.medio,
		papel: p.papel,
		sello: acento ?? p.sello,
		flyer: p.flyer,
		flyerInk: ensureContrast(p.flyerInk, p.flyer, AA_GRANDE),
		cintaAdhesiva: acento ?? MARCA.amarilloTinte
	};
}

/**
 * Los colores de cada diapositiva, en orden: con flyer y sus colores guardados, la paleta de la
 * marca que más se le distingue y el acento del flyer; si no, las de la marca rotando.
 * @param {readonly { hasImage: boolean, colors?: unknown }[]} slides
 * @returns {PaletaDiapositiva[]}
 */
export function paletasDelCarrusel(slides) {
	/** @type {number | null} */
	let prev = null;
	return slides.map((s, i) => {
		const colors = s.hasImage ? parseColors(s.colors) : null;
		const idx = colors ? elegirPaleta(colors, { evitar: prev }) : i % ROTAN_SIN_FLYER;
		prev = idx;
		const p = PALETAS[idx];
		return completar(p, colors ? acentoDelFlyer(colors, p.bg) : null);
	});
}

/**
 * La paleta con el fondo (y su texto) escritos a mano en el evento (`carrousel_background`,
 * `carrousel_color`, hex): el texto se corre hasta que se lea.
 * @param {PaletaDiapositiva} paleta
 * @param {string} bg
 * @param {string | null} ink
 * @returns {PaletaDiapositiva}
 */
export function conFondoPropio(paleta, bg, ink) {
	return {
		...paleta,
		bg,
		ink: ink ? ensureContrast(ink, bg, AA) : textoSobre(bg),
		tituloInk: ink ? ensureContrast(ink, bg, AA_GRANDE) : textoSobre(bg, { grande: true })
	};
}
