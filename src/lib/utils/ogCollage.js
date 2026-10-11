/**
 * El dibujo de una tarjeta de vista previa, diseño «Collage» (gorrite, 11/10): a la derecha, un
 * mosaico inclinado de portadas de eventos; encima, un degradé violeta que las tapa a la izquierda;
 * y ahí el logo, el título, el subtítulo y `kinkyvibe.ar`. Devuelve el árbol de elementos que lee
 * satori (`{ type, props: { style, children } }`), sin dependencias: lo usan la ruta de la imagen
 * (src/routes/og/) y el script de las tarjetas de respaldo (scripts/og-default/render.js). Los
 * colores son los del sitio (`--1-tint`, `--3`). Ver docs/compartir.md.
 */
import { OG_CARD_SIZE } from './ogCards.js';

/** Cuántas portadas lleva el mosaico (4 columnas × 4 filas; se repiten si hay menos). */
export const COLLAGE_TILES = 16;

/** Lado de cada portada del mosaico, en px (las miniaturas se piden de este tamaño). */
export const COLLAGE_TILE = 250;

/** Las fuentes que usa el dibujo (archivos WOFF de static/fonts/share, la ruta los lee). */
export const COLLAGE_FONTS = Object.freeze([
	{ name: 'Lilita One', file: '/fonts/share/lilita-one-latin.woff', weight: 400 },
	{ name: 'Lato', file: '/fonts/share/lato-latin-700.woff', weight: 700 }
]);

/** El logo (redondo en la tarjeta). */
export const COLLAGE_LOGO = '/android-chrome-192x192.png';

/**
 * Sube cuando cambia el dibujo: entra en el hash de la dirección de la imagen, así las apps no
 * siguen mostrando la vieja.
 */
export const COLLAGE_VERSION = 1;

const BG = 'hsl(262, 75%, 13%)';
const TINT = 'hsl(319, 100%, 95%)';

/**
 * @typedef {{ type: string, props: Record<string, any> }} Node
 */

/**
 * @param {string} type
 * @param {Record<string, any>} style
 * @param {Node | Node[] | string} [children]
 * @param {Record<string, any>} [extra]
 * @returns {Node}
 */
const el = (type, style, children, extra = {}) => ({
	type,
	props: { style, ...(children === undefined ? {} : { children }), ...extra }
});

/**
 * Las portadas del mosaico: las que hay, repetidas hasta llenar {@link COLLAGE_TILES} y corridas
 * `offset` lugares (así cada tarjeta empieza por otra). Sin portadas, ninguna.
 * @template T
 * @param {T[]} covers
 * @param {number} [offset]
 * @returns {T[]}
 */
export function collageTiles(covers, offset = 0) {
	if (!covers.length) return [];
	return Array.from({ length: COLLAGE_TILES }, (_, i) => covers[(i + offset) % covers.length]);
}

/**
 * El tamaño del título según lo largo: el nombre de una sección va enorme; una frase (la del
 * sitio), más chica y en varias líneas.
 * @param {string} name
 */
export function titleSize(name) {
	const n = name.length;
	if (n <= 12) return 112;
	if (n <= 18) return 84;
	if (n <= 70) return 60;
	return 50;
}

/**
 * El árbol de la tarjeta.
 * @param {object} input
 * @param {string} input.name el texto grande (el nombre de la sección o la frase del sitio)
 * @param {string} [input.subtitle] debajo, más chico
 * @param {string[]} input.tiles las portadas (direcciones `data:`), ya repetidas ({@link collageTiles})
 * @param {string} input.logo el logo (dirección `data:`)
 * @returns {Node}
 */
export function collageTree({ name, subtitle = '', tiles, logo }) {
	const size = titleSize(name);
	const big = size >= 84;
	return el(
		'div',
		{
			width: OG_CARD_SIZE.width,
			height: OG_CARD_SIZE.height,
			display: 'flex',
			position: 'relative',
			overflow: 'hidden',
			backgroundColor: BG,
			fontFamily: 'Lato',
			color: 'white'
		},
		[
			tiles.length
				? el(
						'div',
						{
							position: 'absolute',
							left: 330,
							top: -170,
							width: COLLAGE_TILE * 4 + 16 * 3,
							display: 'flex',
							flexWrap: 'wrap',
							gap: 16,
							transform: 'rotate(-8deg)'
						},
						tiles.map((src) =>
							el(
								'img',
								{
									width: COLLAGE_TILE,
									height: COLLAGE_TILE,
									objectFit: 'cover',
									borderRadius: 16
								},
								undefined,
								{ src, width: COLLAGE_TILE, height: COLLAGE_TILE }
							)
						)
					)
				: el('div', {
						position: 'absolute',
						left: 0,
						top: 0,
						width: OG_CARD_SIZE.width,
						height: OG_CARD_SIZE.height,
						backgroundImage:
							'radial-gradient(circle at 82% 45%, hsla(262, 90%, 60%, 0.55), hsla(319, 90%, 60%, 0.18) 38%, hsla(262, 75%, 13%, 0) 70%)'
					}),
			el('div', {
				position: 'absolute',
				left: 0,
				top: 0,
				width: OG_CARD_SIZE.width,
				height: OG_CARD_SIZE.height,
				backgroundImage: `linear-gradient(90deg, ${BG} 0%, ${BG} 34%, hsla(262, 75%, 13%, 0.82) 50%, hsla(262, 75%, 13%, 0.15) 78%, hsla(262, 75%, 13%, 0) 100%)`
			}),
			el(
				'div',
				{
					position: 'absolute',
					left: 72,
					top: 0,
					width: big ? 600 : 640,
					height: OG_CARD_SIZE.height,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center'
				},
				[
					el(
						'img',
						{ width: 132, height: 132, borderRadius: 66, boxShadow: `0 0 0 6px ${BG}` },
						undefined,
						{ src: logo, width: 132, height: 132 }
					),
					el(
						'div',
						{
							marginTop: 22,
							fontFamily: 'Lilita One',
							fontSize: size,
							lineHeight: big ? 0.95 : 1.04,
							textWrap: 'balance'
						},
						name
					),
					...(subtitle
						? [
								el(
									'div',
									{
										marginTop: 22,
										fontSize: 36,
										fontWeight: 700,
										lineHeight: 1.2,
										color: TINT,
										textWrap: 'balance'
									},
									subtitle
								)
							]
						: []),
					el(
						'div',
						{
							marginTop: 22,
							display: 'flex',
							alignSelf: 'flex-start',
							padding: '10px 26px',
							borderRadius: 999,
							backgroundColor: 'hsl(165, 84%, 45%)',
							color: 'hsl(165, 84%, 12%)',
							fontSize: 28,
							fontWeight: 700
						},
						'kinkyvibe.ar'
					)
				]
			)
		]
	);
}
