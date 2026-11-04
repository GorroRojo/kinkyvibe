/**
 * La vista previa de un objeto sin imagen propia (evento, material, perfil, entrada de la
 * Kinkipedia), diseño «Ficha» (gorrite, 3/11): el violeta del sitio y, donde iría la foto, una
 * ficha con el día (evento) o el símbolo de la sección (los mismos íconos de Lucide del sitio); a la
 * derecha el tipo, el título, el lugar, el resumen con el lugar que haya y las etiquetas. Se dibuja
 * en el servidor con el mismo dibujante de las tarjetas de las secciones
 * (`/og/objeto/<tipo>/<dirección>/<hash>.jpg`, src/routes/og/objeto/). Ver docs/compartir.md.
 *
 * Sin dependencias del servidor: lo que va en la imagen ({@link ObjectCardSpec}) se arma con lo que
 * la página ya tiene, y el árbol que lee satori ({@link objectCardTree}) mide los textos con el
 * dibujante (`measure`), así el resumen usa todas las líneas que entran.
 */
import { MONTHS_SHORT_ES, WEEKDAYS_ES, argTime, toArgentina } from './dates.js';
import { eventMode, placeShort, venuePlaceMeta } from './eventPlace.js';
import { KIND_LABELS } from './perfiles.js';
import { materialDescription } from './seo.js';
import { OG_CARD_SIZE } from './ogCards.js';
import { iconSvg } from './ogIconos.js';
import { toBase64 } from './base64.js';

/**
 * Sube cuando cambia el dibujo: entra en el hash de la dirección, así las apps piden la nueva.
 */
export const OBJECT_CARD_VERSION = 1;

/** Los tipos de objeto que tienen tarjeta propia (el segmento de la dirección). */
export const OBJECT_CARD_KINDS = Object.freeze(['evento', 'material', 'perfil', 'wiki']);

/** @typedef {'evento' | 'material' | 'perfil' | 'wiki'} ObjectCardKind */

/** ¿Es un tipo con tarjeta? @param {string} kind @returns {kind is ObjectCardKind} */
export const isObjectCardKind = (kind) =>
	/** @type {readonly string[]} */ (OBJECT_CARD_KINDS).includes(kind);

/** Hasta cuántos caracteres del resumen entran en lo que se dibuja (el resto no se vería). */
const SUMMARY_MAX = 600;
/** Hasta cuántas etiquetas. */
const TAGS_MAX = 3;

/**
 * @typedef {object} ObjectCardSpec lo que va en la imagen (y nada más: entra entero en el hash)
 * @property {ObjectCardKind} kind
 * @property {string} label arriba, en mayúsculas: «Evento · Online», «Material · Guía descargable»…
 * @property {string} title
 * @property {string} meta una línea debajo del título (el lugar de un evento presencial), o ''
 * @property {string} summary el resumen (se corta en el dibujo, según el lugar que quede)
 * @property {string[]} tags los nombres de hasta 3 etiquetas
 * @property {import('./ogIconos.js').OgIconName} icon el símbolo de la ficha
 * @property {{ month: string, day: string, sub: string } | null} date la ficha de un evento con fecha
 */

/** El texto en una línea, sin espacios de más. @param {unknown} s */
const flat = (s) =>
	String(s ?? '')
		.split(/\s+/)
		.filter(Boolean)
		.join(' ');

/** @param {unknown} s */
const summaryOf = (s) => flat(s).slice(0, SUMMARY_MAX);

/** @param {string} s */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** @param {readonly unknown[] | null | undefined} names */
const tagsOf = (names) => [...new Set((names ?? []).map(flat).filter(Boolean))].slice(0, TAGS_MAX);

/**
 * La ficha de la fecha de un evento, a la argentina: «NOV», «12», «Jueves · 21:00» (sin hora si el
 * evento tiene solo el día). `null` sin fecha que se pueda leer.
 * @param {unknown} start
 */
export function eventCardDate(start) {
	if (typeof start !== 'string' || !start.trim()) return null;
	const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(start.trim());
	// Un día solo es ese día en la Argentina (no medianoche UTC, que sería el día anterior).
	const a = toArgentina(dayOnly ? `${start.trim()}T12:00:00-03:00` : start);
	if (isNaN(a.getTime())) return null;
	const weekday = capitalize(WEEKDAYS_ES[a.getDay()]);
	return {
		month: MONTHS_SHORT_ES[a.getMonth()].toUpperCase(),
		day: String(a.getDate()),
		sub: dayOnly ? weekday : `${weekday} · ${argTime(start)}`
	};
}

/**
 * La tarjeta de un evento. El lugar, como en la descripción de la vista previa: lo que deja ver su
 * nivel de privacidad (`venuePlaceMeta` + `placeShort`), nunca una dirección escondida.
 * @param {{ meta: Record<string, any>, venue?: import('./venues.js').VenueView | null, tagNames?: readonly string[] }} input
 * @returns {ObjectCardSpec}
 */
export function eventCardSpec({ meta, venue = null, tagNames = [] }) {
	const placeMeta = venuePlaceMeta(meta ?? {}, venue);
	const online = eventMode(placeMeta, { hasVenue: Boolean(venue) }) === 'online';
	const cancelled = meta?.status === 'cancelado';
	return {
		kind: 'evento',
		label: ['Evento', cancelled ? 'Cancelado' : online ? 'Online' : ''].filter(Boolean).join(' · '),
		title: flat(meta?.title),
		meta: online ? (cancelled ? 'Online' : '') : flat(placeShort(placeMeta)),
		summary: summaryOf(meta?.summary),
		tags: tagsOf(tagNames),
		icon: 'calendar-range',
		date: eventCardDate(meta?.start)
	};
}

/**
 * El símbolo de un material, con la misma regla que su ícono en las listas (PostListItem.svelte):
 * pago, descargable, interactivo; un video, la cámara; si no, el libro abierto.
 * @param {readonly string[]} tags
 * @returns {import('./ogIconos.js').OgIconName}
 */
export function materialIcon(tags) {
	if (tags.includes('pago')) return 'shopping-cart';
	if (tags.includes('descargable')) return 'download';
	if (tags.includes('interactivo')) return 'mouse-pointer-click';
	if (tags.includes('video')) return 'video';
	return 'book-open';
}

/**
 * La tarjeta de un material: qué es (por sus etiquetas de formato, como su descripción) y su resumen.
 * @param {{ meta: Record<string, any>, tagManager?: Parameters<typeof materialDescription>[1], tagNames?: readonly string[] }} input
 * @returns {ObjectCardSpec}
 */
export function materialCardSpec({ meta, tagManager, tagNames = [] }) {
	const tags = Array.isArray(meta?.tags) ? meta.tags.filter((t) => typeof t === 'string') : [];
	const what = materialDescription({ tags, summary: '' }, tagManager);
	return {
		kind: 'material',
		label: ['Material', what].filter(Boolean).join(' · '),
		title: flat(meta?.title),
		meta: '',
		summary: summaryOf(meta?.summary),
		tags: tagsOf(tagNames),
		icon: materialIcon(tags),
		date: null
	};
}

/**
 * La tarjeta de un perfil: el tipo (persona, proyecto, lugar), la presentación y las etiquetas.
 * Sin la dirección de un lugar (la tarjeta no la necesita para nada).
 * @param {{ title: unknown, kind?: unknown, bio?: unknown, tagNames?: readonly string[] }} input
 * @returns {ObjectCardSpec}
 */
export function profileCardSpec({ title, kind, bio, tagNames = [] }) {
	const kindLabel = typeof kind === 'string' ? (KIND_LABELS[kind] ?? '') : '';
	return {
		kind: 'perfil',
		label: ['Amigues', kindLabel].filter(Boolean).join(' · '),
		title: flat(title),
		meta: '',
		summary: summaryOf(bio),
		tags: tagsOf(tagNames),
		icon: 'heart',
		date: null
	};
}

/**
 * La tarjeta de una entrada de la Kinkipedia: el término y su resumen.
 * @param {{ title: unknown, summary?: unknown }} input
 * @returns {ObjectCardSpec}
 */
export function wikiCardSpec({ title, summary }) {
	return {
		kind: 'wiki',
		label: 'Kinkipedia',
		title: flat(title),
		meta: '',
		summary: summaryOf(summary),
		tags: [],
		icon: 'globe',
		date: null
	};
}

/**
 * El hash de una tarjeta: 16 caracteres hexadecimales del SHA-256 de lo que se dibuja y la versión
 * del dibujo. Cambia el título, la fecha, el lugar… y cambia la dirección.
 * @param {ObjectCardSpec} spec
 */
export async function objectCardHash(spec) {
	const bytes = new TextEncoder().encode(JSON.stringify({ v: OBJECT_CARD_VERSION, ...spec }));
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * La dirección de la imagen (relativa). La dirección del objeto va como un segmento.
 * @param {ObjectCardKind} kind
 * @param {string} slug
 * @param {string} hash
 */
export const objectCardPath = (kind, slug, hash) =>
	`/og/objeto/${kind}/${encodeURIComponent(slug)}/${hash}.jpg`;

/**
 * El texto alternativo: lo que se lee en la imagen.
 * @param {Pick<ObjectCardSpec, 'title' | 'label'>} spec
 */
export const objectCardAlt = (spec) => `${spec.title} · ${spec.label} (kinkyvibe.ar)`;

/**
 * La imagen de la vista previa de un objeto, para `SeoHead` (`card`): dirección relativa, medidas y
 * texto alternativo. Sin título, ninguna (queda la tarjeta por defecto).
 * @param {ObjectCardKind} kind
 * @param {string} slug
 * @param {ObjectCardSpec} spec
 * @returns {Promise<{ url: string, width: number, height: number, alt: string } | null>}
 */
export async function objectCardImage(kind, slug, spec) {
	if (!spec.title || !slug) return null;
	return {
		url: objectCardPath(kind, slug, await objectCardHash(spec)),
		...OG_CARD_SIZE,
		alt: objectCardAlt(spec)
	};
}

/* ------------------------------------------------------------------ */
/* El dibujo                                                           */
/* ------------------------------------------------------------------ */

const C = Object.freeze({
	bg: 'hsl(262, 75%, 13%)',
	pink: 'hsl(319, 90%, 60%)',
	violet: 'hsl(262, 90%, 60%)',
	violetLight: 'hsl(262, 100%, 75%)',
	teal: 'hsl(165, 84%, 45%)',
	tealDark: 'hsl(165, 84%, 12%)',
	yellow: 'hsl(50, 100%, 60%)',
	tint: 'hsl(319, 100%, 95%)',
	ink: 'hsl(262, 75%, 13%)'
});

/** El color de cada tipo (los del sitio, `--1` a `--4`). */
const ACCENT = Object.freeze({
	evento: C.pink,
	material: C.teal,
	perfil: C.yellow,
	wiki: C.violet
});

const W = OG_CARD_SIZE.width;
const H = OG_CARD_SIZE.height;
const TILE = Object.freeze({ w: 330, h: 380 });
/** La columna de texto. */
const COL = Object.freeze({ left: 470, top: 56, width: 660, bottom: 48 });
const LABEL_H = 32 + 24; // la etiqueta de arriba y su aire
const FOOT_H = 64 + 24; // logo y dirección, y su aire
/** Los tamaños del título, de mayor a menor. */
export const TITLE_SIZES = Object.freeze([104, 84, 72, 62, 54, 48, 44]);
const TITLE_LH = 1.04;
/** Hasta 3 líneas de título; 4 si ya es chico (un título muy largo). @param {number} size */
const maxTitleLines = (size) => (size >= 54 ? 3 : 4);
const META = Object.freeze({ fontSize: 32, lh: 1.25, gap: 16 });
const SUM = Object.freeze({ fontSize: 29, lh: 1.32, gap: 16 });
const TAGS_H = 20 + 46;

/**
 * @typedef {{ type: string, props: Record<string, any> }} Node
 * @typedef {(text: string, style: Record<string, any>) => Promise<number>} MeasureLines cuántas
 *   líneas ocupa `text` con `style` (que lleva `width`), medido con satori
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
/** @param {Record<string, any>} style @param {Node | Node[] | string} [children] */
const div = (style, children) => el('div', { display: 'flex', ...style }, children);
/** @param {Record<string, any>} style @param {string} s */
const text = (style, s) => el('div', { display: 'block', ...style }, s);
/** @param {string} src @param {number} size @param {Record<string, any>} [style] */
const img = (src, size, style = {}) =>
	el('img', { width: size, height: size, ...style }, undefined, { src, width: size, height: size });

/** @param {import('./ogIconos.js').OgIconName} name @param {Parameters<typeof iconSvg>[1]} opts */
const iconSrc = (name, opts) => `data:image/svg+xml;base64,${toBase64(iconSvg(name, opts))}`;

/** La ficha de la izquierda. @param {ObjectCardSpec} spec */
function tile(spec) {
	const accent = ACCENT[spec.kind];
	const box = {
		width: TILE.w,
		height: TILE.h,
		borderRadius: 36,
		overflow: 'hidden',
		flexDirection: 'column',
		justifyContent: 'center',
		alignItems: 'center'
	};
	if (spec.kind === 'evento' && spec.date) {
		// el almanaque con el día: es lo primero que se busca de un evento
		return div(
			{
				...box,
				justifyContent: 'flex-start',
				backgroundColor: 'white',
				boxShadow: `14px 14px 0 ${accent}`
			},
			[
				div(
					{
						width: TILE.w,
						height: 96,
						backgroundColor: accent,
						color: 'white',
						justifyContent: 'center',
						alignItems: 'center',
						fontFamily: 'Lilita One',
						fontSize: 56,
						letterSpacing: 4
					},
					spec.date.month
				),
				div(
					{
						flexGrow: 1,
						flexDirection: 'column',
						justifyContent: 'center',
						alignItems: 'center',
						color: C.ink
					},
					[
						text({ fontFamily: 'Lilita One', fontSize: 168, lineHeight: 0.9 }, spec.date.day),
						text(
							{ fontSize: 36, fontWeight: 700, marginTop: 14, color: 'hsl(262, 40%, 40%)' },
							spec.date.sub
						)
					]
				)
			]
		);
	}
	const size = 200;
	if (spec.kind === 'perfil') {
		return div({ ...box, backgroundColor: accent, boxShadow: `14px 14px 0 ${C.pink}` }, [
			img(iconSrc(spec.icon, { color: C.ink, fill: C.pink, stroke: 1.5 }), size)
		]);
	}
	if (spec.kind === 'material') {
		return div({ ...box, backgroundColor: accent, boxShadow: `14px 14px 0 ${C.pink}` }, [
			img(iconSrc(spec.icon, { color: C.tealDark }), size)
		]);
	}
	// la Kinkipedia y un evento sin fecha: blanca, con el color del tipo
	return div({ ...box, backgroundColor: 'white', boxShadow: `14px 14px 0 ${accent}` }, [
		img(iconSrc(spec.icon, { color: spec.kind === 'wiki' ? C.violet : C.ink }), size)
	]);
}

/**
 * Cuánto lugar toma cada texto: el título más grande que entra en 3 líneas (4 si es muy largo)
 * dejando lugar para el resumen, y cuántas líneas de resumen entran (puntos suspensivos solo si de
 * verdad no entra). Se mide con satori mismo, sin `lineClamp` (con `textWrap: 'balance'`,
 * `lineClamp` reparte el texto en más líneas que las medidas, así que el título solo lo lleva si
 * igual no entra).
 * @param {ObjectCardSpec} spec
 * @param {MeasureLines} measure
 */
export async function objectCardLayout(spec, measure) {
	const avail = H - COL.top - COL.bottom - LABEL_H - FOOT_H;
	const metaH = spec.meta ? META.gap + META.fontSize * META.lh : 0;
	const tagsH = spec.tags.length ? TAGS_H : 0;
	const sumLine = SUM.fontSize * SUM.lh;
	const sumNeed = spec.summary
		? await measure(spec.summary, {
				width: COL.width,
				fontFamily: 'Lato',
				fontWeight: 700,
				fontSize: SUM.fontSize,
				lineHeight: SUM.lh
			})
		: 0;
	/** @type {Array<{ size: number, lines: number, sumLines: number }>} */
	const options = [];
	for (const size of TITLE_SIZES) {
		const lines = await measure(spec.title, {
			width: COL.width,
			fontFamily: 'Lilita One',
			fontSize: size,
			lineHeight: TITLE_LH,
			textWrap: 'balance'
		});
		if (lines > maxTitleLines(size)) continue;
		const rest = avail - lines * size * TITLE_LH - metaH - tagsH - (spec.summary ? SUM.gap : 0);
		options.push({ size, lines, sumLines: Math.max(0, Math.floor(rest / sumLine)) });
	}
	// El título más grande con el que entra todo el resumen (sin achicarlo de más); si no, el más
	// grande que deja 3 líneas de resumen (o las que necesite), después 1; si no, el más chico.
	const pick = options.find((p) => p.sumLines >= sumNeed && p.size >= 62) ??
		options.find((p) => p.sumLines >= Math.min(sumNeed, 3)) ??
		options.find((p) => p.sumLines >= Math.min(sumNeed, 1)) ??
		options.at(-1) ?? {
			size: /** @type {number} */ (TITLE_SIZES.at(-1)),
			lines: maxTitleLines(/** @type {number} */ (TITLE_SIZES.at(-1))) + 1,
			sumLines: 1
		};
	return {
		titleSize: pick.size,
		clampTitle: pick.lines > maxTitleLines(pick.size),
		summaryLines: Math.min(sumNeed, pick.sumLines)
	};
}

/**
 * El árbol de la tarjeta que lee satori.
 * @param {ObjectCardSpec} spec
 * @param {{ logo: string, measure: MeasureLines }} opts `logo`: dirección `data:` del logo
 * @returns {Promise<Node>}
 */
export async function objectCardTree(spec, { logo, measure }) {
	const accent = ACCENT[spec.kind];
	const layout = await objectCardLayout(spec, measure);
	return div(
		{
			width: W,
			height: H,
			position: 'relative',
			overflow: 'hidden',
			backgroundColor: C.bg,
			fontFamily: 'Lato',
			color: 'white'
		},
		[
			div({
				position: 'absolute',
				left: 0,
				top: 0,
				width: W,
				height: H,
				backgroundImage:
					'radial-gradient(circle at 18% 50%, hsla(262, 90%, 60%, 0.45), hsla(319, 90%, 60%, 0.12) 35%, hsla(262, 75%, 13%, 0) 65%)'
			}),
			div({ position: 'absolute', left: 72, top: (H - TILE.h) / 2 - 7 }, [tile(spec)]),
			div(
				{
					position: 'absolute',
					left: COL.left,
					top: COL.top,
					width: COL.width,
					height: H - COL.top - COL.bottom,
					flexDirection: 'column'
				},
				[
					text(
						{
							height: 32,
							fontSize: 26,
							fontWeight: 700,
							letterSpacing: 3,
							color: accent === C.violet ? C.violetLight : accent,
							lineClamp: 1
						},
						spec.label.toUpperCase()
					),
					div({ flexGrow: 1, flexDirection: 'column', justifyContent: 'center' }, [
						text(
							{
								width: COL.width,
								fontFamily: 'Lilita One',
								fontSize: layout.titleSize,
								lineHeight: TITLE_LH,
								textWrap: 'balance',
								...(layout.clampTitle ? { lineClamp: maxTitleLines(layout.titleSize) } : {})
							},
							spec.title
						),
						...(spec.meta
							? [
									text(
										{
											marginTop: META.gap,
											fontSize: META.fontSize,
											fontWeight: 700,
											lineHeight: META.lh,
											lineClamp: 1
										},
										spec.meta
									)
								]
							: []),
						...(spec.summary && layout.summaryLines > 0
							? [
									text(
										{
											width: COL.width,
											marginTop: SUM.gap,
											fontSize: SUM.fontSize,
											fontWeight: 700,
											color: C.tint,
											opacity: 0.88,
											lineHeight: SUM.lh,
											lineClamp: layout.summaryLines
										},
										spec.summary
									)
								]
							: []),
						...(spec.tags.length
							? [
									div(
										{ marginTop: 20, gap: 12, overflow: 'hidden' },
										spec.tags.map((t) =>
											div(
												{
													flexShrink: 0,
													padding: '6px 18px',
													borderRadius: 999,
													border: `3px solid ${C.violetLight}`,
													color: C.tint,
													fontSize: 24,
													fontWeight: 700
												},
												t
											)
										)
									)
								]
							: [])
					]),
					div({ alignItems: 'center', gap: 18 }, [
						img(logo, 64, { borderRadius: 32 }),
						div(
							{
								padding: '8px 21px',
								borderRadius: 999,
								backgroundColor: C.teal,
								color: C.tealDark,
								fontSize: 26,
								fontWeight: 700
							},
							'kinkyvibe.ar'
						)
					])
				]
			)
		]
	);
}
