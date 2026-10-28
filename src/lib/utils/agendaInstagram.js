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
/** Cuántos eventos amigos entran en una placa solo de amigos. */
export const FRIENDS_PER_SLIDE = 7;
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
 * @typedef {{ bebas: string, barlow: string, fredoka: string, lato: string, latoBold: string,
 *   pattern: string, logo: string, images: Record<string, string> }} SlideAssets
 *   las fuentes, el dibujo de fondo, el logo (ya en violeta) y las imágenes de los eventos (por
 *   slug) como `data:` URLs: una imagen SVG dibujada en un canvas no puede cargar nada de afuera.
 * @typedef {{ kind: 'cover', month: string, text: string, weeks: (number | null)[][],
 *     ours: number[], friends: number[] }
 *   | { kind: 'events', rows: readonly SlideRow[], first: number, footer: string }
 *   | { kind: 'fondo', percent: number }
 *   | { kind: 'friends', row: SlideRow | null, index: number, friends: readonly SlideRow[],
 *     footer: string }} Slide
 */

// ---- Colores de los posts ----
const C = {
	ink: '#2b0e3d',
	pink: '#ff4fc4',
	hot: '#ff3db4',
	purple: '#6a17ee',
	mint: '#2fe8ad',
	yellow: '#f2d024',
	grey: '#ececee',
	bar: '#cdd6e2'
};

const PIN = `<svg xmlns="http://www.w3.org/2000/svg" class="pin" viewBox="0 0 24 30"><path fill="${C.mint}" d="M12 0C5.4 0 0 5.2 0 11.6 0 19.8 12 30 12 30s12-10.2 12-18.4C24 5.2 18.6 0 12 0Zm0 16.4a4.9 4.9 0 1 1 0-9.8 4.9 4.9 0 0 1 0 9.8Z"/></svg>`;

/** El destello rosa de «NUEVO» (16 puntas). */
const BURST = (() => {
	const pts = [];
	for (let i = 0; i < 32; i++) {
		const a = (Math.PI * 2 * i) / 32;
		const r = i % 2 ? 36 : 50;
		pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon fill="#ff7bd5" points="${pts.join(' ')}"/></svg>`;
})();

/** Alto del bloque de amigos con `n` eventos (título, raya y filas). @param {number} n */
const friendsHeight = (n) => 36 + 96 + 23 + n * 144 + 30;

/**
 * El CSS de las placas.
 * @param {SlideAssets} a
 */
const slideCss = (a) => `
@font-face { font-family: 'IG Bebas'; src: url(${a.bebas}) format('woff2'); }
@font-face { font-family: 'IG Barlow'; font-weight: 600; src: url(${a.barlow}) format('woff2'); }
@font-face { font-family: 'IG Fredoka'; font-weight: 300 700; src: url(${a.fredoka}) format('woff2'); }
@font-face { font-family: 'IG Lato'; font-weight: 400; src: url(${a.lato}) format('woff2'); }
@font-face { font-family: 'IG Lato'; font-weight: 700; src: url(${a.latoBold}) format('woff2'); }
* { box-sizing: border-box; }
p { margin: 0; }
.slide { position: relative; width: ${SLIDE_W}px; height: ${SLIDE_H}px; overflow: hidden; background: #fff; color: ${C.ink};
  font-family: 'IG Lato', sans-serif; line-height: 1.2; }
.pat { position: absolute; left: 0; right: 0; background: url(${a.pattern}) repeat 0 -40px; background-size: 1080px; opacity: 0.72; }
.band { position: absolute; left: 0; right: 0; top: 102px; height: 52px; background: ${C.pink}; border-block: 3px solid ${C.ink}; }
.foot { position: absolute; left: 0; right: 0; bottom: 0; height: 70px; background: ${C.purple}; color: #fff; font-size: 29px;
  display: flex; align-items: center; justify-content: center; }
.bebas { font-family: 'IG Bebas', sans-serif; font-weight: 400; line-height: 0.95; text-transform: uppercase; }
.barlow { font-family: 'IG Barlow', sans-serif; font-weight: 600; line-height: 1.08; }
.round { font-family: 'IG Fredoka', sans-serif; font-weight: 600; color: ${C.mint}; line-height: 0.78; letter-spacing: -0.01em;
  -webkit-text-stroke: 0.06em ${C.ink}; paint-order: stroke fill; }
.logo { display: block; border-radius: 50%; }
.tag { position: absolute; top: 72px; left: 50%; width: 182px; height: 104px; margin-left: -91px; border-radius: 50%;
  background: ${C.yellow}; border: 3px solid ${C.ink}; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.tag .round { font-size: 46px; text-shadow: 2px 3px 0 ${C.ink}; }
.tag .round + .round { margin-left: 30px; }
.cover-logo { position: absolute; top: 72px; left: 50%; margin-left: -57px; width: 114px; height: 114px; }
.title { position: absolute; top: 250px; left: 293px; width: 490px; height: 278px; border-radius: 50%; background: ${C.yellow};
  border: 3px solid ${C.ink}; }
.title-text { position: absolute; top: 268px; left: 318px; }
.title-text .round { font-size: 128px; text-shadow: 4px 5px 0 ${C.ink}; display: block; }
.title-text .round + .round { margin: 4px 0 0 128px; }
.sub { position: absolute; top: 500px; left: 440px; width: 330px; font-weight: 700; font-style: italic; font-size: 47px; line-height: 0.98; }
.cal { position: absolute; left: 167px; top: 718px; width: 746px; border: 3px solid ${C.ink}; border-radius: 42px; overflow: hidden; background: #f3f3f5; }
.cal-head { background: ${C.purple}; color: #fff; text-align: center; font-weight: 700; font-style: italic; font-size: 52px; height: 82px;
  line-height: 82px; text-transform: uppercase; border-bottom: 3px solid ${C.ink}; }
.cal table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
.cal th { font-size: 33px; font-weight: 700; height: 52px; }
.cal td { text-align: center; height: 60px; font-size: 32px; }
.cal td span { display: inline-flex; width: 56px; height: 56px; border-radius: 50%; align-items: center; justify-content: center; }
.cal td .ours { background: ${C.yellow}; font-weight: 700; font-size: 35px; }
.cal td .friends { box-shadow: inset 0 0 0 3px ${C.purple}; }
.cal-foot { background: ${C.mint}; border-top: 3px solid ${C.ink}; height: 78px; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-style: italic; font-size: 26px; gap: 18px; }
.events { position: absolute; left: 0; right: 0; top: 196px; bottom: 82px; display: flex; flex-direction: column; justify-content: space-around; }
.ev { display: flex; align-items: center; gap: 30px; padding: 0 70px; justify-content: flex-end; }
.ev.left { flex-direction: row-reverse; }
.ev .txt { width: 585px; text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
.ev.left .txt { text-align: left; align-items: flex-start; }
.ev .date { color: ${C.hot}; font-size: 70px; }
.ev .price { color: ${C.purple}; font-size: 49px; margin-top: 2px; }
.ev .desc { font-size: 25px; line-height: 1.2; margin-top: 6px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.ev .where { display: flex; align-items: center; gap: 16px; margin-top: 16px; color: ${C.purple}; font-size: 30px; }
.ev.left .where { flex-direction: row-reverse; }
.pin { width: 50px; height: 64px; flex: none; }
.pic { position: relative; flex: none; width: 310px; height: 310px; }
.pic img, .pic .noimg { width: 100%; height: 100%; border-radius: 38px; border: 3px solid ${C.ink}; object-fit: cover; display: block; }
.pic .noimg { background: ${C.purple}; color: #fff; padding: 34px 26px; display: flex; align-items: center; font-size: 76px; line-height: 0.92; overflow: hidden; }
.pic .noimg.long { font-size: 58px; }
.burst { position: absolute; top: -58px; left: -50px; width: 130px; height: 130px; }
.burst span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 30px;
  transform: rotate(-14deg); }
.fondo-top { position: absolute; top: 205px; left: 0; right: 0; text-align: center; font-size: 68px; line-height: 1.0; color: ${C.purple}; }
.fondo-top .hot { color: ${C.hot}; }
.fondo-name { position: absolute; top: 552px; left: 70px; display: flex; align-items: center; gap: 12px; }
.fondo-name .big { font-size: 124px; line-height: 1; -webkit-text-stroke: 0.04em ${C.ink}; paint-order: stroke fill; }
.fondo-name .stack { display: flex; flex-direction: column; align-items: center; }
.fondo-name .stack .s { font-size: 72px; line-height: 0.8; -webkit-text-stroke: 0.05em ${C.ink}; paint-order: stroke fill; }
.y { color: ${C.yellow}; } .p { color: ${C.hot}; } .m { color: ${C.mint}; } .v { color: ${C.purple}; }
.fondo-logo { position: absolute; top: 560px; left: 790px; width: 230px; height: 230px; }
.fondo-logo i { position: absolute; border-radius: 48% 52% 45% 55%; }
.fondo-logo img { position: absolute; left: 20px; top: 22px; width: 196px; height: 196px; border: 3px solid ${C.ink}; }
.bar { position: absolute; top: 830px; left: 46px; width: 974px; height: 68px; border-radius: 14px; background: ${C.bar}; overflow: hidden; }
.bar .fill { position: absolute; left: 0; top: 0; bottom: 0; background: ${C.hot}; }
.bar .tick { position: absolute; top: 18px; width: 3px; height: 30px; background: #fff; }
.pct { position: absolute; top: 906px; height: 68px; padding: 0 16px; min-width: 86px; border-radius: 0 0 16px 16px; background: ${C.yellow};
  font-size: 40px; display: flex; align-items: center; justify-content: center; color: ${C.ink}; }
.mecenas { position: absolute; top: 1000px; left: 0; right: 0; text-align: center; color: ${C.purple}; font-size: 60px; line-height: 1.05; }
.btn { position: absolute; top: 1150px; left: 50%; transform: translateX(-50%); padding: 6px 36px 10px; border-radius: 18px; background: ${C.hot};
  border: 3px solid ${C.ink}; color: #fff; font-size: 64px; white-space: nowrap; }
.friends-wrap { position: absolute; left: 0; right: 0; bottom: 70px; background: ${C.grey}; padding: 36px 0 30px; }
.friends-wrap h2 { margin: 0 auto; width: 800px; text-align: center; color: ${C.purple}; font-size: 86px; height: 96px; line-height: 96px;
  border-bottom: 9px solid ${C.purple}; font-weight: 400; box-sizing: content-box; }
.fr { display: flex; align-items: center; gap: 22px; margin-top: 22px; height: 122px; }
.fr .who { width: 300px; text-align: right; font-size: 32px; line-height: 1; padding-right: 4px; }
.fr .thumb { width: 122px; height: 122px; flex: none; border-radius: 18px; border: 2px solid ${C.ink}; object-fit: cover; background: ${C.purple}; display: block; }
.fr .t1 { color: ${C.hot}; font-size: 42px; }
.fr .t2 { color: ${C.purple}; font-size: 31px; margin-top: 4px; }
.fr .txt { width: 580px; }
`;

/**
 * Un evento de KinkyVibe en su placa.
 * @param {SlideRow} r
 * @param {number} i su número entre los de KinkyVibe (la imagen va a la derecha en los pares)
 * @param {SlideAssets} a
 */
function eventHtml(r, i, a) {
	const side = i % 2 ? 'left' : 'right';
	const [p1, p2] = placeLines(r.place, r.place2);
	const img = a.images[r.slug];
	const pic = img
		? `<img src="${xml(img)}" alt=""/>`
		: `<div class="noimg bebas${r.title.length > 26 ? ' long' : ''}">${xml(r.title)}</div>`;
	const burst = r.nuevo ? `<div class="burst">${BURST}<span class="bebas">Nuevo</span></div>` : '';
	const date = slideDateLine(r.start);
	return `<div class="ev ${side}"><div class="txt">
${date ? `<p class="date bebas">${xml(date)}</p>` : ''}
${r.price ? `<p class="price bebas">${xml(r.price)}</p>` : ''}
${r.summary ? `<p class="desc">${xml(r.summary)}</p>` : ''}
${p1 ? `<div class="where barlow"><p>${xml(p1)}${p2 ? `<br/>${xml(p2)}` : ''}</p>${PIN}</div>` : ''}
</div><div class="pic">${pic}${burst}</div></div>`;
}

/** @param {SlideRow} r @param {SlideAssets} a */
function friendHtml(r, a) {
	const img = a.images[r.slug];
	const where = friendPlace(r.place);
	const thumb = img ? `<img class="thumb" src="${xml(img)}" alt=""/>` : '<div class="thumb"></div>';
	return `<div class="fr"><p class="who bebas">${xml(r.organizer)}</p>${thumb}<div class="txt"><p class="t1 bebas">${xml(
		r.title
	)}</p><p class="t2 bebas">${xml(friendDateLine(r.start))}${where ? ` | ${xml(where)}` : ''}</p></div></div>`;
}

const TAG = `<div class="tag"><span class="round">agenda</span><span class="round">kinky</span></div>`;
const TOP = `<div class="pat" style="top:0;height:104px"></div><div class="band"></div>${TAG}`;

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
			return `<td><span class="${cls}">${String(d).padStart(2, '0')}</span></td>`;
		};
		const rows = slide.weeks.map((w) => `<tr>${w.map(cell).join('')}</tr>`).join('');
		const head = ['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d) => `<th>${d}</th>`).join('');
		inner = `<div class="pat" style="top:0;bottom:0"></div><div class="band"></div>${logo('cover-logo')}
<div class="title"></div><div class="title-text"><span class="round">agenda</span><span class="round">kinky</span></div>
${slide.text ? `<p class="sub">${xml(slide.text)}</p>` : ''}
<div class="cal"><div class="cal-head">${xml(slide.month)}</div><table><tr>${head}</tr>${rows}</table>
<div class="cal-foot"><span>Deslizá para ver los eventos que se vienen</span><span>&gt; &gt; &gt;</span></div></div>`;
	} else if (slide.kind === 'events') {
		const evs = slide.rows.map((r, i) => eventHtml(r, slide.first + i, assets)).join('');
		inner = `${TOP}<div class="events">${evs}</div>
${slide.footer ? `<div class="foot">${xml(slide.footer)}</div>` : ''}`;
	} else if (slide.kind === 'fondo') {
		const p = Math.max(0, Math.min(100, Math.round(slide.percent)));
		const ticks = Array.from(
			{ length: 9 },
			(_, i) => `<i class="tick" style="left:${(i + 1) * 10}%"></i>`
		).join('');
		const tagLeft = Math.round(Math.max(46, Math.min(46 + 974 - 100, 46 + (974 * p) / 100)));
		inner = `${TOP}<div class="pat" style="bottom:0;height:80px;background-position:0 -500px"></div>
<div class="fondo-top barlow"><p>este mes</p><p class="hot">el ${p}% del precio</p><p class="hot">de las entradas</p><p>a eventos y talleres</p><p>está cubierto por el</p></div>
<div class="fondo-name barlow"><span class="big y">Fondo</span><span class="stack"><span class="s p">educativo</span><span class="big y">cultural</span><span class="s m">comunitario</span></span><span class="big v">de</span></div>
<div class="fondo-logo"><i style="left:6px;top:0;width:170px;height:150px;background:${C.mint}"></i><i style="left:90px;top:12px;width:140px;height:140px;background:${C.yellow}"></i><i style="left:0;top:90px;width:150px;height:140px;background:${C.pink}"></i>${logo('')}</div>
<div class="bar"><div class="fill" style="width:${p}%"></div>${ticks}</div>
<div class="pct bebas" style="left:${tagLeft}px">${p}%</div>
<p class="mecenas barlow">Volvete nuestre mecenas para<br/>ayudarnos a que todo sea gratis</p>
<p class="btn barlow">${FONDO_HOST}</p>`;
	} else {
		const wrapH = friendsHeight(slide.friends.length);
		const evH = SLIDE_H - 70 - wrapH - 196;
		const ev = slide.row
			? `<div class="events" style="bottom:auto;height:${evH}px">${eventHtml(slide.row, slide.index, assets)}</div>`
			: '';
		inner = `${TOP}${ev}
<div class="friends-wrap"${slide.row ? '' : ' style="top:196px"'}><h2 class="bebas">Otros eventos amigos:</h2>${slide.friends
			.map((r) => friendHtml(r, assets))
			.join('')}</div>
${slide.footer ? `<div class="foot">${xml(slide.footer)}</div>` : ''}`;
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
 * `perSlide`), la del Fondo (si `fondo` no es null) y, si hay eventos amigos, la última con el
 * último evento de KinkyVibe arriba y los amigos abajo (los que no entran, en placas propias).
 * @param {readonly SlideRow[]} rows
 * @param {{ month: string, monthKey: string, perSlide: number, coverText: string, footer: string,
 *   fondo: number | null }} opts `monthKey`: AAAA-MM de la grilla
 * @returns {Slide[]}
 */
export function buildSlides(rows, { month, monthKey, perSlide, coverText, footer, fondo }) {
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
