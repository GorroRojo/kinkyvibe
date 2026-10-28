/**
 * Agenda impresa › Instagram (docs/panel.md#instagram): el carrusel mensual «agenda kinky» para
 * Instagram, como los que publica KinkyVibe (portada con la grilla del mes, placas de eventos con
 * su imagen, la placa del Fondo y «Otros eventos amigos»). Funciones puras: el rango por
 * defecto, cómo se reparten los eventos, el texto del posteo y el SVG de cada placa (1080 × 1350,
 * 4:5) que la página dibuja en un canvas para bajarla como PNG. Nada se guarda.
 *
 * Las filas son las de los volantes (`flyerRow` + `withOverrides`) con lo que suma Instagram
 * (resumen, imagen, si es de KinkyVibe, quién organiza, la segunda línea del lugar): el lugar ya
 * viene como lo ve cualquiera y con lo que se cambió a mano.
 */
import {
	MONTHS_ES,
	WEEKDAYS_ES,
	WEEKDAYS_SHORT_ES,
	argDate,
	argTime,
	toArgentina
} from './dates.js';
import { CALENDAR_URL, MAX_RANGE_DAYS, PRIVATE_ADDRESS_NOTE } from './agendaImpresa.js';
import { ONLINE_PLACE_TEXT } from './eventPlace.js';

/** Medidas de cada placa (el formato vertical del feed de Instagram, 4:5). */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
/** Cuántos eventos de KinkyVibe por placa se pueden elegir, y el de por defecto. */
export const PER_SLIDE_CHOICES = Object.freeze([2, 3]);
export const DEFAULT_PER_SLIDE = 3;
/** Cuántos eventos amigos entran en la última placa (con un evento de KinkyVibe arriba). */
export const FRIENDS_WITH_EVENT = 4;
/** Cuántos eventos amigos entran en una placa solo de amigos (con las filas grandes del .ai). */
export const FRIENDS_PER_SLIDE = 4;
/** Cuántos eventos de KinkyVibe entran en la placa con la lista de actividades. */
export const LIST_PER_SLIDE = 8;
/**
 * Hasta qué día del mes el rango por defecto es «lo que queda de este mes»; desde ese día, el mes
 * que viene entero (la agenda del mes se publica unos días antes de que empiece).
 */
export const NEXT_MONTH_FROM_DAY = 20;
/** La bajada de la portada. */
export const DEFAULT_COVER_TEXT = 'grilla de próximos eventos';
/** El pie de las placas de eventos. */
export const DEFAULT_SLIDE_FOOTER =
	'inscripciones en kinkyvibe.ar/calendario y linktr.ee/kinkyvibe';
/** Adónde lleva la placa del Fondo. */
export const FONDO_HOST = 'fondo.kinkyvibe.ar';

/**
 * @typedef {import('./agendaImpresa.js').FlyerRow & {
 *   start: string, summary: string, image: string, kinkyvibe: boolean, organizer: string,
 *   place2: string, nuevo: boolean }} SlideRow
 */

/** @param {string} d AAAA-MM-DD @param {number} n */
const plusDays = (d, n) =>
	new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** El último día (AAAA-MM-DD) del mes de `d`. @param {string} d */
const monthEnd = (d) => {
	const [y, m] = d.split('-').map(Number);
	return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/**
 * El rango de días (`?desde=&hasta=`, como los volantes); sin rango, el de la agenda del mes: si
 * hoy (en Argentina) es antes del día {@link NEXT_MONTH_FROM_DAY}, de hoy al fin de este mes; si
 * no, el mes que viene entero. Nunca al revés ni más largo que {@link MAX_RANGE_DAYS}.
 * @param {URLSearchParams} params
 * @param {number} [now]
 * @returns {{ from: string, to: string }}
 */
export function instagramRange(params, now = Date.now()) {
	const day = (/** @type {string | null} */ v) =>
		v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : '';
	const today = argDate(now);
	let from = day(params.get('desde'));
	let to = day(params.get('hasta'));
	if (!from && !to) {
		if (Number(today.slice(8)) < NEXT_MONTH_FROM_DAY) from = today;
		else from = plusDays(monthEnd(today), 1);
		to = monthEnd(from);
	}
	from ||= today;
	to ||= monthEnd(from);
	if (to < from) to = from;
	const max = plusDays(from, MAX_RANGE_DAYS - 1);
	if (to > max) to = max;
	return { from, to };
}

/**
 * El mes (o los meses) del rango, en minúscula: «noviembre», «noviembre y diciembre» o «octubre a
 * diciembre».
 * @param {{ from: string, to: string }} range
 */
export function rangeMonthName({ from, to }) {
	const a = Number(from.slice(5, 7)) - 1;
	const b = Number(to.slice(5, 7)) - 1;
	const span = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (b - a);
	if (!(span > 0)) return MONTHS_ES[a] ?? '';
	if (span === 1) return `${MONTHS_ES[a]} y ${MONTHS_ES[b]}`;
	return `${MONTHS_ES[a]} a ${MONTHS_ES[b]}`;
}

/**
 * Reparte las filas en placas de `perSlide`. Si la última quedaría con una sola y la anterior
 * tiene lugar para mandarle otra, las equilibra (3 + 1 → 2 + 2).
 * @template T
 * @param {readonly T[]} rows
 * @param {number} perSlide
 * @returns {T[][]}
 */
export function chunkSlides(rows, perSlide) {
	const n = Math.max(1, Math.floor(perSlide) || 1);
	/** @type {T[][]} */
	const out = [];
	for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
	const last = out.at(-1);
	const prev = out.at(-2);
	if (n > 2 && last && prev && last.length === 1) last.unshift(/** @type {T} */ (prev.pop()));
	return out;
}

/** @param {string} s */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * La fecha de una placa de eventos: «sábado 24. 20:00hs» (va en mayúsculas). '' si no se entiende.
 * @param {string} start
 */
export function slideDateLine(start) {
	const d = toArgentina(start);
	if (isNaN(d.getTime())) return '';
	return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()}. ${argTime(start)}hs`;
}

/**
 * La fecha de un evento amigo: «sáb 10 de octubre» (va en mayúsculas). '' si no se entiende.
 * @param {string} start
 */
export function friendDateLine(start) {
	const d = toArgentina(start);
	if (isNaN(d.getTime())) return '';
	return `${WEEKDAYS_SHORT_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
}

/**
 * El separador de los renglones de las placas: la 1797 MEDIUM no dibuja la barra «|», así que los
 * posts usan una «I» mayúscula.
 */
const SEP = ' I ';

/**
 * La fecha de un renglón de la lista de actividades: «jueves 8 de octubre I 19:00 hs». '' si no se
 * entiende.
 * @param {string} start
 */
export function listDateLine(start) {
	const d = toArgentina(start);
	if (isNaN(d.getTime())) return '';
	return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}${SEP}${argTime(start)} hs`;
}

const PRIVATE_RE = new RegExp(`^(.*?)\\s*\\(${PRIVATE_ADDRESS_NOTE}\\)$`, 'i');

/**
 * Las dos líneas del lugar, como los posts: «Villa Crespo, CABA» / «Dirección x privado»; la
 * dirección y el nombre del lugar (si es público); «Actividad online». La primera sale del lugar
 * de la fila (ya con su privacidad y con lo cambiado a mano); la segunda, si no es la nota de
 * privado, es `second` (el nombre público del lugar o lo que se escribió a mano).
 * @param {string} place la `place` de la fila
 * @param {string} [second]
 * @returns {[string, string]}
 */
export function placeLines(place, second = '') {
	const p = String(place ?? '').trim();
	const two = String(second ?? '').trim();
	if (!p) return ['', ''];
	if (p === ONLINE_PLACE_TEXT) return ['Actividad online', two];
	const m = p.match(PRIVATE_RE);
	if (m)
		return [m[1] || capitalize(PRIVATE_ADDRESS_NOTE), m[1] ? capitalize(PRIVATE_ADDRESS_NOTE) : ''];
	return [p, two && !p.toLowerCase().includes(two.toLowerCase()) ? two : ''];
}

/**
 * La zona de un evento amigo para su línea («Almagro», «Online»): el barrio si hay dirección, sin
 * la nota de privado.
 * @param {string} place
 */
export function friendPlace(place) {
	const [first] = placeLines(place);
	if (first === 'Actividad online') return ONLINE_PLACE_TEXT;
	const parts = first
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (parts.length < 2) return first;
	return parts.filter((s) => !/^caba$/i.test(s)).at(-1) ?? parts[0];
}

/**
 * Las semanas del mes (empiezan el domingo, como la grilla de los posts), con `null` en los días
 * de otros meses.
 * @param {string} monthKey AAAA-MM
 * @returns {(number | null)[][]}
 */
export function monthWeeks(monthKey) {
	const [y, m] = monthKey.split('-').map(Number);
	const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
	const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
	/** @type {(number | null)[]} */
	const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
	while (cells.length % 7) cells.push(null);
	/** @type {(number | null)[][]} */
	const weeks = [];
	for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
	return weeks;
}

/**
 * El texto del posteo: el título, una bajada, cada evento de KinkyVibe (día y hora, título, lugar
 * como lo ve cualquiera, precio), los eventos amigos y los links. En castellano rioplatense, con
 * voseo.
 * @param {readonly SlideRow[]} rows
 * @param {{ month: string, intro?: string, url?: string }} opts
 */
export function instagramCaption(rows, { month, intro, url = CALENDAR_URL }) {
	const host = url.replace(/^https?:\/\//, '');
	const ours = rows.filter((r) => r.kinkyvibe);
	const friends = rows.filter((r) => !r.kinkyvibe);
	const lines = [
		`🗓️ Agenda kinky de ${month}`,
		'',
		intro ?? `Estas son las actividades que preparamos para ${month}. ¡Les esperamos!`
	];
	for (const r of ours) {
		lines.push('', `${r.icon} ${r.title.toUpperCase()}`);
		const date = slideDateLine(r.start);
		if (date) lines.push(`📅 ${capitalize(date)}`);
		const [p1, p2] = placeLines(r.place, r.place2);
		if (p1) lines.push(`📍 ${[p1, p2].filter(Boolean).join(' · ')}`);
		if (r.price) lines.push(`🎟️ ${r.price}`);
	}
	if (friends.length) {
		lines.push('', 'Otros eventos amigos:');
		for (const r of friends) {
			const where = friendPlace(r.place);
			const who = r.organizer ? ` (${r.organizer})` : '';
			lines.push(`💜 ${r.title}${who}: ${friendDateLine(r.start)}${where ? ` | ${where}` : ''}`);
		}
	}
	lines.push(
		'',
		`Inscripciones en ${host} y linktr.ee/kinkyvibe (link en la bio). Guardate este posteo y compartilo con quien quieras traer 🖤`
	);
	return lines.join('\n');
}

/** @param {unknown} s Escapa texto para el XHTML de la placa. */
export const xml = (s) =>
	String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

/**
 * @typedef {{ poster: string, medium: string, signage: string, arimo: string, arimoBold: string,
 *   arimoBoldItalic: string, fredoka: string, pattern: string, logo: string,
 *   images: Record<string, string> }} SlideAssets
 *   las letras, el dibujo de fondo, el logo (ya en violeta) y las imágenes de los eventos (por
 *   slug) como `data:` URLs: una imagen SVG dibujada en un canvas no puede cargar nada de afuera.
 * @typedef {{ kind: 'cover', month: string, text: string, weeks: (number | null)[][],
 *     ours: number[], friends: number[] }
 *   | { kind: 'events', rows: readonly SlideRow[], first: number, footer: string }
 *   | { kind: 'fondo', percent: number }
 *   | { kind: 'list', month: string, rows: readonly SlideRow[] }
 *   | { kind: 'friends', row: SlideRow | null, index: number, friends: readonly SlideRow[],
 *     footer: string }} Slide
 */

// Las medidas salen del .ai original de los posts (mesas de 1080 × 1350 pt = px): posiciones,
// tamaños de letra y líneas de base de cada elemento.

// ---- Colores de los posts (los del .ai) ----
const C = {
	ink: '#26053e',
	pink: '#ff48c4',
	purple: '#6511f8',
	mint: '#2bedac',
	yellow: '#efd123',
	grey: '#ededed',
	bar: '#cad5e2',
	button: '#f6339a',
	calendar: '#f4f4f4'
};

/**
 * Dónde queda la línea de base debajo del borde de arriba de un renglón con `line-height: 0`, en
 * em (la mitad de ascendente − descendente de cada letra). Con esto cada texto suelto se ubica
 * por su línea de base, como en el .ai. Si cambia una letra, cambia su número.
 */
const BASE = { poster: 0.3, medium: 0.3, signage: 0.229, arimo: 0.3465, fredoka: 0.36 };

/**
 * `top` para que un renglón con `line-height: 0` tenga su línea de base en `baseline`.
 * @param {keyof typeof BASE} font @param {number} size @param {number} baseline
 */
const topFor = (font, size, baseline) => +(baseline - BASE[font] * size).toFixed(2);

const PIN = `<svg xmlns="http://www.w3.org/2000/svg" class="pin" viewBox="0 0 24 30"><path fill="${C.mint}" d="M12 0C5.4 0 0 5.2 0 11.6 0 19.8 12 30 12 30s12-10.2 12-18.4C24 5.2 18.6 0 12 0Zm0 16.4a4.9 4.9 0 1 1 0-9.8 4.9 4.9 0 0 1 0 9.8Z"/></svg>`;

/** El destello rosa de «NUEVO» (el del .ai: 10 puntas desparejas, 116 × 117). */
const BURST = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 118.4 118.8"><polygon fill="${C.pink}" stroke="${C.ink}" stroke-width="0.7" points="52.3,23.5 66.8,0 73.9,26.7 99.5,16.2 89.6,42 116.4,48.5 93.2,63.5 111.1,84.6 83.5,83.2 85.6,110.7 64.1,93.3 49.6,116.8 42.5,90.1 16.9,100.6 26.8,74.8 0,68.3 23.2,53.2 5.3,32.2 32.9,33.6 30.8,6.1"/></svg>`;

/**
 * El CSS de las placas.
 * @param {SlideAssets} a
 */
const slideCss = (a) => `
/* ---- Letras: el único lugar donde se declaran ----
   Las del .ai: 1797 POSTER (fechas, títulos), 1797 MEDIUM (precios, lugares, el Fondo) y 1797
   SIGNAGE (textos y pie), de static/fonts/1797/. La portada va en Arial (Bold, Bold Italic y
   Narrow): acá Arimo, la libre con las mismas medidas, y la Narrow es Arimo angostada al 82 %.
   SIGNAGE va con el espaciado del .ai (−50).
   «agenda kinky» está en curvas en el .ai: Fredoka es la libre más parecida, angostada al 80,5 %. */
@font-face { font-family: 'IG Poster'; src: url(${a.poster}) format('woff2'); }
@font-face { font-family: 'IG Medium'; src: url(${a.medium}) format('woff2'); }
@font-face { font-family: 'IG Signage'; src: url(${a.signage}) format('woff2'); }
@font-face { font-family: 'IG Arial'; font-weight: 400; src: url(${a.arimo}) format('woff2'); }
@font-face { font-family: 'IG Arial'; font-weight: 700; src: url(${a.arimoBold}) format('woff2'); }
@font-face { font-family: 'IG Arial'; font-weight: 700; font-style: italic; src: url(${a.arimoBoldItalic}) format('woff2'); }
@font-face { font-family: 'IG Fredoka'; font-weight: 300 700; src: url(${a.fredoka}) format('woff2'); }
.poster { font-family: 'IG Poster', sans-serif; font-weight: 400; text-transform: uppercase; }
.medium { font-family: 'IG Medium', sans-serif; font-weight: 400; }
.signage { font-family: 'IG Signage', sans-serif; font-weight: 400; letter-spacing: -0.05em; }
.arial { font-family: 'IG Arial', sans-serif; }
.round { font-family: 'IG Fredoka', sans-serif; font-weight: 600; color: ${C.mint}; }

* { box-sizing: border-box; }
p { margin: 0; }
.slide { position: relative; width: ${SLIDE_W}px; height: ${SLIDE_H}px; overflow: hidden; background: #fff; color: ${C.ink};
  font-family: 'IG Signage', sans-serif; line-height: 1.2; }
.abs { position: absolute; }
.l0 { position: absolute; line-height: 0; white-space: nowrap; }
.pat { position: absolute; left: 0; right: 0; background: url(${a.pattern}) repeat -300px -80px; background-size: 2160px; }
.band { position: absolute; left: -10px; right: -10px; top: 101.65px; height: 51.8px; background: ${C.pink}; border-block: 3.5px solid ${C.ink}; z-index: 1; }
.band.big { top: 55.5px; height: 100.6px; border-width: 4.2px; }
.head-title { z-index: 1; left: 64px; top: ${topFor('poster', 60.9, 129.2)}px; font-size: 60.9px; color: #fff; }
.tag { position: absolute; z-index: 2; border-radius: 50%; background: ${C.yellow}; border: 0 solid ${C.ink}; }
.tag-word { position: absolute; z-index: 2; line-height: 0; white-space: nowrap; transform-origin: 0 0; }
.foot { position: absolute; left: 0; right: 0; bottom: 0; height: 68px; background: ${C.purple}; color: #fff; font-size: 35px;
  line-height: 0; padding-top: ${(1332 - 1282 - BASE.signage * 35).toFixed(2)}px; text-align: center; white-space: nowrap; }
.logo { display: block; border-radius: 50%; }
.cover-logo { position: absolute; z-index: 2; top: 69.8px; left: 484.7px; width: 111px; height: 111px; border: 1px solid ${C.ink}; }
.sub { position: absolute; z-index: 3; top: 483.4px; left: 440px; width: 300px; font-weight: 700; font-style: italic; font-size: 55px; line-height: 50px;
  -webkit-text-stroke: 3px #fff; paint-order: stroke fill; }
.cal { position: absolute; left: 166.2px; top: 717px; width: 748px; border: 2.4px solid ${C.ink}; border-radius: 51px 51px 60px 60px;
  overflow: hidden; background: ${C.calendar}; }
.cal-head { background: ${C.purple}; color: #fff; text-align: center; font-weight: 700; font-style: italic; font-size: 56.2px; height: 82.6px;
  line-height: 80.2px; text-transform: uppercase; border-bottom: 2.4px solid ${C.ink}; letter-spacing: -1.7px;
  -webkit-text-stroke: 1.6px ${C.ink}; }
.cal-body { height: 386.2px; padding-top: 3px; }
.cal table { width: 731px; border-collapse: collapse; table-layout: fixed; }
.cal th { font-size: 36.1px; font-weight: 700; height: 53px; line-height: 53px; padding: 0; }
.cal td { text-align: center; height: 61.25px; line-height: 61.25px; font-size: 37.4px; padding: 0; }
.cal.six td { height: 54px; line-height: 54px; }
.cal td span { display: inline-block; width: 51.6px; height: 51.6px; line-height: 51.6px; border-radius: 50%; vertical-align: middle; }
.cal td .n { display: inline-block; transform: scaleX(0.82); }
.cal td .ours { background: ${C.yellow}; font-weight: 700; }
.cal td .ours .n { transform: none; }
.cal td .friends { box-shadow: inset 0 0 0 3px ${C.purple}; }
.cal-foot { background: ${C.mint}; border-top: 2.4px solid ${C.ink}; height: 80.9px; line-height: 78.5px; text-align: center;
  font-weight: 700; font-style: italic; font-size: 28.1px; white-space: nowrap; }
.events { position: absolute; left: 0; right: 0; top: 153.5px; bottom: 68px; display: flex; flex-direction: column; }
/* Arriba, como en el .ai (la primera imagen a 59,5 px de la banda), y lo que sobra queda abajo. */
.events .edge { flex: 0 1 59.5px; min-height: 16px; }
.events .edge.end { flex: 1 1 0; }
.events .gap { flex: 0 1 38px; min-height: 8px; }
.ev { display: flex; align-items: center; gap: 18px; padding: 0 76px; justify-content: flex-end; }
.ev.left { flex-direction: row-reverse; }
.ev .txt { width: 592px; text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
.ev.left .txt { text-align: left; align-items: flex-start; }
.ev .date { color: ${C.pink}; font-size: 70px; line-height: 70px; white-space: nowrap; }
.ev .price { color: ${C.purple}; font-size: 50px; line-height: 50px; margin-top: -4px; text-transform: uppercase; }
.ev .price.long { font-size: 44px; line-height: 50px; }
.ev .desc { font-size: 30px; line-height: 30px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.ev .where { display: flex; align-items: center; gap: 10px; margin-top: 14px; color: ${C.purple}; font-size: 34px; line-height: 33px; }
.ev.left .where { flex-direction: row-reverse; }
.pin { width: 46px; height: 70px; flex: none; }
.pic { position: relative; flex: none; width: 309px; height: 309px; }
.pic img, .pic .noimg { width: 100%; height: 100%; border-radius: 40px; border: 1px solid ${C.ink}; object-fit: cover; display: block; }
.pic .noimg { background: ${C.purple}; color: #fff; padding: 26px; display: flex; align-items: center; line-height: 0.9; overflow: hidden;
  overflow-wrap: anywhere; }
.burst { position: absolute; top: -42px; left: -48px; width: 118px; height: 118px; }
.burst svg { display: block; width: 100%; height: 100%; }
.burst span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 29.5px;
  line-height: 1; transform: rotate(-10deg); }
.fondo-top { position: absolute; top: ${(269.6 - 31.5 - BASE.medium * 70).toFixed(2)}px; left: 0; right: 0; padding-right: 27px;
  text-align: center; font-size: 70px; line-height: 63px; color: ${C.purple}; }
.fondo-top .hot { color: ${C.pink}; -webkit-text-stroke: 2px ${C.pink}; }
/* En el .ai ese renglón termina con un espacio, que lo corre un poco a la izquierda. */
.fondo-top .hot:nth-child(2) { padding-right: 16px; }
.fondo-name .l0 { -webkit-text-stroke: 2.4px ${C.ink}; }
.fondo-name .l0.de { -webkit-text-stroke: 0; }
.y { color: ${C.yellow}; } .p { color: ${C.pink}; } .m { color: ${C.mint}; } .v { color: ${C.purple}; }
.blob { position: absolute; border-radius: 50%; }
.fondo-logo { position: absolute; left: 803.7px; top: 586.6px; width: 206.1px; height: 206.1px; border: 2px solid ${C.ink}; }
.bar { position: absolute; top: 829.4px; left: 45.6px; width: 975px; height: 69px; border-radius: 15px; background: ${C.bar}; overflow: hidden; }
.bar .fill { position: absolute; left: 0; top: 0; bottom: 0; background: ${C.pink}; border-radius: 15px; }
.bar .tick { position: absolute; top: 19.3px; width: 2.2px; height: 32.8px; background: #fff; }
.pct { position: absolute; top: 906px; height: 70px; padding: ${(957.5 - 906 - BASE.poster * 46.3).toFixed(2)}px 17px 0; min-width: 86.7px;
  border-radius: 0 23px 23px 23px; background: ${C.yellow}; font-size: 46.3px; line-height: 0; text-align: center; color: ${C.ink}; }
.mecenas { position: absolute; top: ${(1049.6 - 31.5 - BASE.medium * 70).toFixed(2)}px; left: 0; right: 0; padding-left: 33px;
  text-align: center; color: ${C.purple}; font-size: 70px; line-height: 63px; }
.btn { position: absolute; top: 1148.6px; left: 556.6px; transform: translateX(-50%); height: 96.7px; padding: 0 36px; border-radius: 26.2px;
  background: ${C.button}; border: 2.4px solid ${C.ink}; color: #fff; font-size: 72.15px; line-height: 0; white-space: nowrap;
  padding-top: ${(1219.3 - 1148.6 - 2.4 - BASE.poster * 72.15).toFixed(2)}px; }
.stack { position: absolute; left: 0; right: 0; top: 153.5px; bottom: 68px; display: flex; flex-direction: column; }
.stack.only { top: 146.1px; bottom: 95.9px; }
.stack .solo { flex: none; padding: 59.5px 0 30.7px; }
.friends-wrap { flex: 1 1 auto; background: ${C.grey}; display: flex; flex-direction: column; }
.friends-wrap h2 { flex: none; margin: 59.6px 0 0; height: 0; line-height: 0; text-align: center; color: ${C.purple}; font-size: 75.6px; font-weight: 400;
  }
.friends-wrap .rule { flex: none; margin: ${(BASE.poster * 75.6 + 16.2 - 0.5).toFixed(1)}px auto 0; width: 798px; height: 10.8px; background: ${C.purple}; border: 1px solid ${C.ink}; }
.friends-wrap .rows { flex: 1 1 auto; display: flex; flex-direction: column; gap: 25.5px; padding: 24.6px 0 20px; }
.fr { display: flex; align-items: center; padding-left: 142px; flex: none; }
.fr .who { width: 140px; margin-right: 53px; text-align: right; font-size: 30px; line-height: 27px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.fr .thumb { width: 122px; height: 122px; flex: none; border-radius: 27px; border: 0.8px solid ${C.ink}; object-fit: cover; background: ${C.purple}; display: block; }
.fr .txt { width: 525px; margin-left: 18px; }
/* La primera línea de un recorte de dos renglones se comería las tildes de las mayúsculas: el
   relleno de arriba les deja lugar. */
.fr .t1 { color: ${C.pink}; font-size: 40px; line-height: 36.5px; padding-top: 8px; margin-top: -8px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fr .t2 { color: ${C.purple}; font-size: 30px; line-height: 30px; margin-top: 1.5px; text-transform: uppercase; }
.only .friends-wrap .rows { gap: 74px; padding: 96.3px 0 0; }
.only .fr { padding-left: 105px; }
.only .fr .who { width: 140px; margin-right: 12px; text-align: center; font-size: 30.2px; line-height: 26.7px; }
.only .fr .thumb { width: 177px; height: 177px; }
.only .fr .txt { width: 540px; margin-left: 25.6px; }
.only .fr .t1 { font-size: 42.9px; line-height: 37.4px; }
.only .fr .t2 { font-size: 34.6px; line-height: 34.6px; margin-top: 5.9px; }
.white { position: absolute; left: 0; right: 0; top: 73.4px; height: 1188.6px; background: #fff; }
.list { position: absolute; left: 0; right: 0; top: 205px; display: flex; flex-direction: column; gap: 14.2px; }
.li { display: flex; align-items: center; gap: 21px; padding-left: 80.6px; }
.li .thumb { position: relative; width: 108px; height: 108px; flex: none; border-radius: 39.5px; border: 0.4px solid ${C.ink}; object-fit: cover;
  background: ${C.purple}; display: block; overflow: hidden; }
.li .thumb span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 51.4px;
  line-height: 1; transform: rotate(-14.5deg); }
.li .txt { width: 841px; }
.li .t1 { color: ${C.purple}; font-size: 53px; line-height: 53px; text-transform: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.li .t2 { font-size: 42.1px; line-height: 42.1px; margin-top: -2.8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

/**
 * «agenda kinky» en su óvalo amarillo, como en el .ai: el chico de arriba de las placas (escala 1),
 * el grande de las placas con título y el de la portada son el mismo dibujo a otra escala.
 * @param {number} x @param {number} y la esquina del óvalo (sin el borde)
 * @param {number} k la escala
 */
function tagHtml(x, y, k) {
	const w = 188.9 * k;
	const h = 112.2 * k;
	const b = 1.1 * k;
	const size = 53.8 * k;
	const r = (/** @type {number} */ n) => +n.toFixed(2);
	const word = (
		/** @type {string} */ text,
		/** @type {number} */ inkLeft,
		/** @type {number} */ bearing,
		/** @type {number} */ baseline
	) =>
		`<span class="tag-word round" style="left:${r(x + inkLeft * k - bearing * size * 0.805)}px;top:${r(
			y + topFor('fredoka', size, baseline * k)
		)}px;font-size:${r(size)}px;transform:scaleX(0.805);-webkit-text-stroke:${r(b)}px ${C.ink};text-shadow:${r(
			-1.6 * k
		)}px ${r(1.6 * k)}px 0 ${C.ink}">${text}</span>`;
	return `<div class="tag" style="left:${r(x - b / 2)}px;top:${r(y - b / 2)}px;width:${r(w + b)}px;height:${r(
		h + b
	)}px;border-width:${r(b)}px"></div>${word('agenda', 11.25, 0.02, 45.6)}${word('kinky', 63.45, 0.04, 87.8)}`;
}

/**
 * Un evento de KinkyVibe en su placa.
 * @param {SlideRow} r
 * @param {number} i su número entre los de KinkyVibe (la imagen va a la izquierda en los pares)
 * @param {SlideAssets} a
 */
function eventHtml(r, i, a) {
	const side = i % 2 ? 'right' : 'left';
	const [p1, p2] = placeLines(r.place, r.place2);
	const img = a.images[r.slug];
	const pic = img
		? `<img src="${xml(img)}" alt=""/>`
		: `<div class="noimg poster" style="font-size:${noimgSize(r.title)}px">${xml(r.title)}</div>`;
	const burst = r.nuevo ? `<div class="burst">${BURST}<span class="poster">Nuevo</span></div>` : '';
	const date = slideDateLine(r.start);
	return `<div class="ev ${side}"><div class="txt">
${date ? `<p class="date poster">${xml(date)}</p>` : ''}
${r.price ? `<p class="price medium${r.price.length > PRICE_LONG ? ' long' : ''}">${xml(r.price)}</p>` : ''}
${r.summary ? `<p class="desc signage">${xml(r.summary)}</p>` : ''}
${p1 ? `<div class="where medium"><p>${xml(p1)}${p2 ? `<br/>${xml(p2)}` : ''}</p>${PIN}</div>` : ''}
</div><div class="pic">${pic}${burst}</div></div>`;
}

/** @param {SlideRow} r @param {SlideAssets} a */
function friendHtml(r, a) {
	const img = a.images[r.slug];
	const where = friendPlace(r.place);
	const thumb = img ? `<img class="thumb" src="${xml(img)}" alt=""/>` : '<div class="thumb"></div>';
	return `<div class="fr"><p class="who poster">${xml(r.organizer)}</p>${thumb}<div class="txt"><p class="t1 poster">${xml(
		r.title
	)}</p><p class="t2 medium">${xml(friendDateLine(r.start))}${where ? xml(SEP + where) : ''}</p></div></div>`;
}

/** @param {SlideRow} r @param {SlideAssets} a */
function listHtml(r, a) {
	const img = a.images[r.slug];
	const thumb = img
		? `<img class="thumb" src="${xml(img)}" alt=""/>`
		: `<div class="thumb">${r.nuevo ? '<span class="poster">Nuevo</span>' : ''}</div>`;
	const [p1] = placeLines(r.place, r.place2);
	const where = p1 === 'Actividad online' ? 'online' : p1;
	const line = [listDateLine(r.start), where].filter(Boolean).join(SEP);
	return `<div class="li">${thumb}<div class="txt"><p class="t1 poster">${xml(r.title)}</p><p class="t2 medium">${xml(
		line
	)}</p></div></div>`;
}

/** Los tamaños del título en el recuadro sin imagen (82 px es el del .ai). */
const NOIMG_SIZES = [82, 72, 62, 54, 48, 42, 36, 32, 28];
/** El lado de adentro del recuadro sin imagen (309 px menos el borde y 26 px de cada lado). */
const NOIMG_INNER = 309 - 2 - 2 * 26;

/** Los anchos de 1797 POSTER (en milésimas de em) de A–Z y 0–9, para medir los títulos. */
const POSTER_W =
	'362,356,366,363,315,303,368,374,182,233,367,305,493,371,368,351,369,356,343,324,368,373,475,363,362,345,368,247,366,363,353,348,348,313,348,348'
		.split(',')
		.map(Number);
const POSTER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * El ancho de una palabra en 1797 POSTER (va en mayúsculas), en em; lo que no está en la tabla
 * cuenta de más, para no quedarse corto.
 * @param {string} w
 */
const posterWidth = (w) =>
	[
		...w
			.toUpperCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
	].reduce((t, ch) => {
		const i = POSTER_CHARS.indexOf(ch);
		if (i >= 0) return t + POSTER_W[i] / 1000;
		return t + (/[.,:;'¡!]/.test(ch) ? 0.2 : /[()]/.test(ch) ? 0.22 : 0.45);
	}, 0);

/**
 * El tamaño más grande al que el título entra entero en el recuadro sin imagen (renglones de 0,9
 * em, cortando entre palabras): nunca queda cortado arriba ni abajo.
 * @param {string} title
 */
const noimgSize = (title) => {
	const words = title.trim().split(/\s+/);
	for (const size of NOIMG_SIZES) {
		let lines = 1;
		let width = 0;
		let fits = true;
		for (const word of words) {
			const w = posterWidth(word) * size;
			if (w > NOIMG_INNER) fits = false;
			const next = width ? width + 0.15 * size + w : w;
			if (next > NOIMG_INNER && width) {
				lines += 1;
				width = w;
			} else width = next;
		}
		if (fits && lines * 0.9 * size <= NOIMG_INNER) return size;
	}
	return NOIMG_SIZES.at(-1);
};

/** Un precio más largo que esto va más chico, para que no ocupe dos renglones. */
const PRICE_LONG = 36;

/**
 * Los eventos de una placa, desde arriba como en el .ai, con 38 px entre uno y otro (que se
 * achican si no entran): con menos eventos, lo que sobra queda abajo.
 * @param {string[]} items
 */
const eventsColumn = (items) =>
	`<div class="events"><div class="edge"></div>${items.join('<div class="gap"></div>')}<div class="edge end"></div></div>`;

const TOP = `<div class="pat" style="top:0;height:102px"></div><div class="band"></div>${tagHtml(445.55, 69.7, 1)}`;

/**
 * La cabecera de las placas con título (la lista y los amigos solos): la banda ancha con el título
 * y «agenda kinky» más grande a la derecha.
 * @param {string} title
 */
const titledTop = (title) =>
	`<div class="pat" style="top:0;bottom:0"></div><div class="band big"></div><p class="l0 poster head-title">${xml(
		title
	)}</p>${tagHtml(748, 31, 251.6 / 188.9)}`;

/**
 * La placa como imagen SVG (1080 × 1350) con el diseño en XHTML adentro (`foreignObject`), lista
 * para un `<img>` o para dibujarla en un canvas y bajarla como PNG.
 * @param {Slide} slide
 * @param {SlideAssets} assets
 */
export function slideSvg(slide, assets) {
	const logo = (/** @type {string} */ cls) =>
		`<img class="logo ${cls}" src="${xml(assets.logo)}" alt=""/>`;
	let inner = '';
	if (slide.kind === 'cover') {
		const ours = new Set(slide.ours);
		const friends = new Set(slide.friends);
		const cell = (/** @type {number | null} */ d) => {
			if (d === null) return '<td></td>';
			const cls = [ours.has(d) && 'ours', friends.has(d) && 'friends'].filter(Boolean).join(' ');
			return `<td><span class="${cls}"><span class="n">${String(d).padStart(2, '0')}</span></span></td>`;
		};
		const rows = slide.weeks.map((w) => `<tr>${w.map(cell).join('')}</tr>`).join('');
		const head = ['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d) => `<th>${d}</th>`).join('');
		inner = `<div class="pat" style="top:0;bottom:0"></div><div class="band"></div>${logo('cover-logo')}
${tagHtml(288.2, 240, 502.4 / 188.9)}
${slide.text ? `<p class="sub arial">${xml(slide.text)}</p>` : ''}
<div class="cal arial${slide.weeks.length > 5 ? ' six' : ''}"><div class="cal-head">${xml(slide.month)}</div><div class="cal-body"><table><tr>${head}</tr>${rows}</table></div>
<div class="cal-foot">Deslizá para ver los eventos que se vienen &gt; &gt; &gt;</div></div>`;
	} else if (slide.kind === 'events') {
		const evs = slide.rows.map((r, i) => eventHtml(r, slide.first + i, assets));
		inner = `${TOP}${eventsColumn(evs)}
${slide.footer ? `<div class="foot signage">${xml(slide.footer)}</div>` : ''}`;
	} else if (slide.kind === 'fondo') {
		const p = Math.max(0, Math.min(100, Math.round(slide.percent)));
		const ticks = Array.from(
			{ length: 9 },
			(_, i) => `<i class="tick" style="left:${(96.9 + 96.2 * i).toFixed(1)}px"></i>`
		).join('');
		const tagLeft = Math.round(Math.max(45.6, Math.min(45.6 + 975 - 100, 43.2 + (975 * p) / 100)));
		/** Una palabra del nombre del Fondo, por su línea de base (y girada, como en el .ai). */
		const word = (
			/** @type {string} */ text,
			/** @type {string} */ cls,
			/** @type {number} */ left,
			/** @type {number} */ size,
			/** @type {number} */ baseline,
			/** @type {number} */ deg = 0
		) =>
			`<span class="l0 poster ${cls}" style="left:${left}px;top:${topFor('poster', size, baseline)}px;font-size:${size}px;text-transform:none${
				deg
					? `;transform:rotate(${deg}deg);transform-origin:0 ${+(BASE.poster * size).toFixed(2)}px`
					: ''
			}">${text}</span>`;
		inner = `${TOP}<div class="pat" style="top:1292px;bottom:0;background-position:0 -500px"></div>
<div class="fondo-top medium"><p>este mes</p><p class="hot">el ${p}% del precio</p><p class="hot">de las entradas</p><p>a eventos y talleres</p><p>está cubierto por el</p></div>
<div class="fondo-name">${word('Fondo', 'y', 95.7, 134.59, 732.7)}${word('educativo', 'p', 337.4, 110.4, 647.3, -4.4)}${word(
			'cultural',
			'y',
			340.9,
			134.59,
			723.8,
			1.35
		)}${word('comunitario', 'm', 335.5, 90.13, 789.5, -1.09)}${word('de', 'v de', 660.7, 153.4, 730.1)}</div>
<i class="blob" style="left:820.9px;top:573.2px;width:213.5px;height:200.3px;background:${C.yellow}"></i><i class="blob" style="left:762.6px;top:586.3px;width:240.9px;height:230.2px;background:${C.pink}"></i><i class="blob" style="left:794.5px;top:561.5px;width:200.3px;height:207.3px;background:${C.mint}"></i>${logo('fondo-logo')}
<div class="bar"><div class="fill" style="width:${p}%"></div>${ticks}</div>
<div class="pct poster" style="left:${tagLeft}px">${p}%</div>
<div class="mecenas medium"><p>Volvete nuestre mecenas para</p><p>ayudarnos a que todo sea gratis</p></div>
<p class="btn poster" style="text-transform:none">${FONDO_HOST}</p>`;
	} else if (slide.kind === 'list') {
		inner = `<div class="pat" style="top:0;bottom:0"></div><div class="white"></div>${titledTop(
			`Actividades de ${slide.month}`
		).replace('<div class="pat" style="top:0;bottom:0"></div>', '')}
<div class="list">${slide.rows.map((r) => listHtml(r, assets)).join('')}</div>`;
	} else if (slide.row) {
		// El evento arriba (con su alto) y el bloque gris de los amigos ocupa lo que queda hasta el
		// pie, con las filas desde arriba, como en el .ai.
		inner = `${TOP}<div class="stack"><div class="solo">${eventHtml(slide.row, slide.index, assets)}</div>
<div class="friends-wrap"><h2 class="poster">Otros eventos amigos:</h2><div class="rule"></div><div class="rows">${slide.friends
			.map((r) => friendHtml(r, assets))
			.join('')}</div></div></div>
${slide.footer ? `<div class="foot signage">${xml(slide.footer)}</div>` : ''}`;
	} else {
		// Solo amigos: el título va en la banda ancha, sin pie (como en el .ai).
		inner = `${titledTop('Otros eventos amigos')}<div class="stack only"><div class="friends-wrap"><div class="rows">${slide.friends
			.map((r) => friendHtml(r, assets))
			.join('')}</div></div></div>`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_W}" height="${SLIDE_H}" viewBox="0 0 ${SLIDE_W} ${SLIDE_H}">
<foreignObject x="0" y="0" width="${SLIDE_W}" height="${SLIDE_H}">
<div xmlns="http://www.w3.org/1999/xhtml" class="slide"><style>${slideCss(assets)}</style>${inner}</div>
</foreignObject></svg>`;
}

/** @param {string} svg */
export const svgDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * Las placas del carrusel: la portada con la grilla del mes, las de los eventos de KinkyVibe (de a
 * `perSlide`), la del Fondo (si `fondo` no es null), la lista de actividades (si `list`; de a
 * {@link LIST_PER_SLIDE}) y, si hay eventos amigos, la última con el último evento de KinkyVibe
 * arriba y los amigos abajo (los que no entran, en placas propias).
 * @param {readonly SlideRow[]} rows
 * @param {{ month: string, monthKey: string, perSlide: number, coverText: string, footer: string,
 *   fondo: number | null, list?: boolean }} opts `monthKey`: AAAA-MM de la grilla
 * @returns {Slide[]}
 */
export function buildSlides(rows, { month, monthKey, perSlide, coverText, footer, fondo, list }) {
	const ours = rows.filter((r) => r.kinkyvibe);
	const friends = rows.filter((r) => !r.kinkyvibe);
	/** @param {readonly SlideRow[]} list */
	const days = (list) =>
		list
			.map((r) => argDate(r.start))
			.filter((d) => d.startsWith(monthKey))
			.map((d) => Number(d.slice(8)));
	/** @type {Slide[]} */
	const slides = [
		{
			kind: 'cover',
			month,
			text: coverText,
			weeks: monthWeeks(monthKey),
			ours: days(ours),
			friends: days(friends)
		}
	];
	// Con amigos, el último evento de KinkyVibe va arriba de ellos (como los posts).
	const last = friends.length && ours.length ? ours.at(-1) : undefined;
	const body = last ? ours.slice(0, -1) : ours;
	let index = 0;
	for (const chunk of chunkSlides(body, perSlide)) {
		slides.push({ kind: 'events', rows: chunk, first: index, footer });
		index += chunk.length;
	}
	if (fondo !== null && Number.isFinite(fondo)) slides.push({ kind: 'fondo', percent: fondo });
	if (list) {
		for (let i = 0; i < ours.length; i += LIST_PER_SLIDE)
			slides.push({ kind: 'list', month, rows: ours.slice(i, i + LIST_PER_SLIDE) });
	}
	if (friends.length) {
		const firstBatch = last ? FRIENDS_WITH_EVENT : FRIENDS_PER_SLIDE;
		const batch = (/** @type {number} */ from, /** @type {number} */ n) =>
			friends.slice(from, from + n);
		slides.push({
			kind: 'friends',
			row: last ?? null,
			index,
			friends: batch(0, firstBatch),
			footer
		});
		for (let i = firstBatch; i < friends.length; i += FRIENDS_PER_SLIDE) {
			slides.push({
				kind: 'friends',
				row: null,
				index,
				friends: batch(i, FRIENDS_PER_SLIDE),
				footer
			});
		}
	}
	return slides;
}

/** Para nombrar los PNG: «agenda-noviembre-1.png». @param {string} month @param {number} i */
export const slideFileName = (month, i) =>
	`agenda-${
		month
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/gi, '-')
			.toLowerCase() || 'kinkyvibe'
	}-${i + 1}.png`;
