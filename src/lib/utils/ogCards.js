/**
 * Las tarjetas de la vista previa al compartir (1200 × 630) que viven en `static/`: la por defecto
 * y una por sección. Sin dependencias: lo leen el sitio (src/lib/utils/seo.js) y el script que las
 * dibuja (scripts/og-default/render.js). Si cambiás algo de acá, volvé a correr el script y
 * commiteá los PNG (docs/compartir.md).
 */

/**
 * La frase de las tarjetas: la oficial de gorrite, tal cual (con la coma antes de «y»). Para
 * cambiarla: este texto y `node scripts/og-default/render.js`.
 */
export const SITE_TAGLINE = 'Educación crítica, cultura transformativa, y comunidad disidente.';

/** Medidas de todas las tarjetas. */
export const OG_CARD_SIZE = Object.freeze({ width: 1200, height: 630 });

/**
 * Las tarjetas: la por defecto (`default`, sin nombre de sección) y una por sección, con el nombre
 * que se ve en la tarjeta y su archivo en `static/`.
 * @type {Readonly<Record<'default' | 'calendario' | 'material' | 'amigues' | 'wiki', { name: string, file: string }>>}
 */
export const OG_CARDS = Object.freeze({
	default: { name: '', file: 'og-default.png' },
	calendario: { name: 'Calendario', file: 'og-calendario.png' },
	material: { name: 'Material', file: 'og-material.png' },
	amigues: { name: 'Amigues', file: 'og-amigues.png' },
	wiki: { name: 'Kinkipedia', file: 'og-kinkipedia.png' }
});

/**
 * El texto alternativo de una tarjeta: lo que se lee en ella.
 * @param {keyof typeof OG_CARDS} key
 */
export function ogCardAlt(key) {
	const name = OG_CARDS[key].name;
	return `Logo de Kinky Vibe${name ? `, «${name}»` : ''} y el texto «${SITE_TAGLINE}» (kinkyvibe.ar)`;
}
