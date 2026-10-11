/**
 * Las imágenes de la vista previa al compartir (1200 × 630), diseño «Collage» (gorrite, 11/10):
 * un mosaico inclinado de portadas de eventos con un degradé violeta, el logo y un título. Hay una
 * por defecto y una por sección. Se dibujan en el servidor con las portadas de los próximos
 * eventos (`/og/<tarjeta>/<hash>.jpg`, src/routes/og/) y los textos del panel
 * (src/lib/utils/previewTexts.js). Las de `static/` son el respaldo, sin portadas, para cuando no se
 * puede dibujar (sin base, en `vite dev`): `node scripts/og-default/render.js` (docs/compartir.md).
 * Sin dependencias: lo leen el sitio, la ruta de la imagen y el script.
 */
import { PREVIEW_TEXT_DEFAULTS, SITE_TAGLINE, cardSubtitle } from './previewTexts.js';

export { SITE_TAGLINE };

/** Medidas de todas las tarjetas. */
export const OG_CARD_SIZE = Object.freeze({ width: 1200, height: 630 });

/**
 * Las tarjetas: de dónde sale el texto grande (`nameKey`) y el subtítulo (`headingKey`, lo que va
 * después de « · »), y el archivo de respaldo en `static/`. La por defecto lleva la frase del
 * sitio y no lleva subtítulo.
 * @type {Readonly<Record<'default' | 'calendario' | 'material' | 'amigues' | 'wiki', { nameKey: string, headingKey: string | null, file: string }>>}
 */
export const OG_CARDS = Object.freeze({
	default: { nameKey: 'home.cardText', headingKey: null, file: 'og-default.jpg' },
	calendario: {
		nameKey: 'calendario.cardName',
		headingKey: 'calendario.heading',
		file: 'og-calendario.jpg'
	},
	material: {
		nameKey: 'material.cardName',
		headingKey: 'material.heading',
		file: 'og-material.jpg'
	},
	amigues: { nameKey: 'amigues.cardName', headingKey: 'amigues.heading', file: 'og-amigues.jpg' },
	wiki: { nameKey: 'wiki.cardName', headingKey: 'wiki.title', file: 'og-kinkipedia.jpg' }
});

/** @typedef {keyof typeof OG_CARDS} OgCardKey */

/** ¿Es una tarjeta? @param {string} key @returns {key is OgCardKey} */
export const isOgCard = (key) => Object.hasOwn(OG_CARDS, key);

/**
 * Lo que va escrito en una tarjeta: el texto grande y el subtítulo.
 * @param {OgCardKey} key
 * @param {Readonly<Record<string, string>>} [texts]
 */
export function ogCardText(key, texts = PREVIEW_TEXT_DEFAULTS) {
	const card = OG_CARDS[key];
	return {
		name: texts[card.nameKey] ?? '',
		subtitle: card.headingKey ? cardSubtitle(texts[card.headingKey] ?? '') : ''
	};
}

/**
 * El texto alternativo de una tarjeta: lo que se lee en ella.
 * @param {OgCardKey} key
 * @param {Readonly<Record<string, string>>} [texts]
 */
export function ogCardAlt(key, texts = PREVIEW_TEXT_DEFAULTS) {
	const { name, subtitle } = ogCardText(key, texts);
	const words = [name, subtitle].filter(Boolean).join(' · ');
	return `Logo de Kinky Vibe y «${words}» sobre portadas de eventos (kinkyvibe.ar)`;
}
