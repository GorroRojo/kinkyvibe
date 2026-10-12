// Kept apart from $lib/utils/index.js so list pages can import it without
// pulling in that module's lookup tables for every post and image.
import '$lib/types.d.js';
import { argDate, startsAfter, toArgentina } from './dates.js';

/**
 * false for calendar events that already started (PostList hides them unless
 * "show past events" is on), true for everything else.
 * @param {ProcessedPost} post
 * @param {number} [now]
 */
export const isCurrent = (post, now = Date.now()) =>
	post.meta.category != 'calendario' || startsAfter(post.meta.start, now);

/**
 * true if some calendar event of `month` (yyyy-MM, Argentina time) already started: /calendario
 * only offers "Mostrar/Ocultar eventos pasados" when there is something to show or hide.
 * @param {ProcessedPost[]} posts
 * @param {string} month yyyy-MM
 * @param {number} [now]
 */
export function monthHasPastEvents(posts, month, now = Date.now()) {
	return posts.some((post) => {
		if (post.meta.category != 'calendario') return false;
		const start = new Date(post.meta.start);
		if (isNaN(start.getTime()) || start.getTime() > now) return false;
		const local = toArgentina(start);
		const m = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}`;
		return m == month;
	});
}

/**
 * «Hoy» de la grilla de /calendario, siempre en hora de Argentina: ni la del servidor (UTC) ni la
 * del navegador de quien mira. `today`: es el día de hoy; `past`: ya terminó (un día anterior).
 * @param {string} date yyyy-MM-dd (un día de la grilla)
 * @param {number} [now]
 */
export function calendarDayFlags(date, now = Date.now()) {
	const today = argDate(now);
	return { today: date === today, past: date < today };
}

/** El mes de hoy en Argentina, yyyy-MM. @param {number} [now] */
export const currentMonth = (now = Date.now()) => argDate(now).slice(0, 7);

/**
 * true si `m` es un mes del calendario, yyyy-MM (como `?viewdate=` de /calendario).
 * @param {string | null | undefined} m
 * @returns {m is string}
 */
export const isCalendarMonth = (m) =>
	!!m && /^\d{4}-\d{2}$/.test(m) && !isNaN(new Date(m + '-01T00:00').getTime());

/** @param {string} month yyyy-MM @param {number} n meses (pueden ser negativos) */
export function shiftCalendarMonth(month, n) {
	const [y, m] = month.split('-').map(Number);
	const total = y * 12 + (m - 1) + n;
	return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * El mes con el que abre /calendario sin `?viewdate`: el de hoy (en Argentina), o el siguiente si
 * todos los eventos de este mes ya empezaron.
 * @param {Record<string, ProcessedPost[]>} days eventos por día de inicio (yyyy-MM-dd, Argentina)
 * @param {number} [now]
 */
export function defaultCalendarMonth(days, now = Date.now()) {
	const month = currentMonth(now);
	const hasUpcoming = Object.entries(days).some(
		([date, posts]) =>
			date.slice(0, 7) === month && posts.some((p) => new Date(p.meta.start).getTime() >= now)
	);
	return hasUpcoming ? month : shiftCalendarMonth(month, 1);
}

/**
 * Encabezado de la lista de /calendario: el mes que se ve y cuántos eventos tiene, «Octubre · 7
 * eventos» (con el año si no es este: «Enero 2027 · 1 evento»).
 * @param {string} month yyyy-MM
 * @param {number} count
 * @param {number} [now]
 */
export function monthCountLabel(month, count, now = Date.now()) {
	const [y, m] = month.split('-').map(Number);
	const names = [
		'Enero',
		'Febrero',
		'Marzo',
		'Abril',
		'Mayo',
		'Junio',
		'Julio',
		'Agosto',
		'Septiembre',
		'Octubre',
		'Noviembre',
		'Diciembre'
	];
	const name = names[m - 1] ?? month;
	const year = y === toArgentina(now).getFullYear() ? '' : ` ${y}`;
	return `${name}${year} · ${count} ${count === 1 ? 'evento' : 'eventos'}`;
}

/** @type {Promise<ProcessedPost[]>|undefined} */
let allPosts;
/**
 * Browser only: every listed post, including past events, from /api/posts (server-rendered and
 * cached a few minutes: its tags come from the database). Pages call this once the
 * viewer turns on "show past events".
 * @return {Promise<ProcessedPost[]>}
 */
export const fetchAllPostsClient = () =>
	(allPosts ??= fetch('/api/posts')
		.then((r) => {
			if (!r.ok) throw new Error('Could not load /api/posts: ' + r.status);
			return r.json();
		})
		.catch((e) => {
			allPosts = undefined;
			throw e;
		}));

/**
 * Posts shown under "Más cosas de…" on calendario/material/amigues pages.
 * @param {AnyPostData} meta - metadata of the post being viewed
 * @param {ProcessedPost[]} posts
 * @return {ProcessedPost[]}
 */
export const relatedPostsFor = (meta, posts) =>
	posts.filter(
		(p) =>
			meta.authors?.some(
				(/**@type string */ a) => p.meta.authors.includes(a) && p.meta.title !== meta.title
			) ||
			(meta.wiki && p.meta.tags.includes(meta.wiki)) ||
			(meta.category == 'wiki' && p.meta.tags.includes(meta.postID)) ||
			(meta.category == 'amigues' &&
				p.meta.authors.includes(meta.postID) &&
				p.meta.postID != meta.postID)
	);
