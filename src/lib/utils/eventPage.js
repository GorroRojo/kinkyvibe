/**
 * Piezas puras de la página de un evento (/calendario/<evento>) y de las listas que lo rodean:
 * si el evento ya pasó, la serie que se puede seguir, el menú «Agregar a mi calendario» y cómo se
 * ordenan «Más cosas de…» y «Participa en» (próximos primero, en orden de fecha; los pasados
 * aparte).
 */
import { format } from 'date-fns';
import { eventEnd, toArgentina } from './dates.js';

/**
 * ¿El evento ya terminó? (Sin fin, el que calcula `eventEnd`.) Una fecha que no se entiende
 * cuenta como que no pasó: la página queda como siempre.
 *
 * @param {{ start?: string | number | Date | null, end?: string | number | Date | null }} meta
 * @param {number} [now]
 */
export function isPastEvent(meta, now = Date.now()) {
	if (!meta?.start) return false;
	const end = eventEnd(
		/** @type {any} */ (meta.start),
		/** @type {any} */ (meta.end ?? undefined)
	).getTime();
	return Number.isFinite(end) && end < now;
}

/**
 * @typedef {{ id: string, name: string, href: string, icon?: string,
 *   nextUpcoming?: { path: string, title: string, start: string | number | Date } | null }} SeriesInfo
 */

/**
 * La serie del evento para el botón «Seguir» y el chip de la cabecera: la primera de la lista
 * (`loadSeries`), o `null` si no es parte de ninguna.
 *
 * @param {{ list?: SeriesInfo[] } | null | undefined} series
 * @returns {SeriesInfo | null}
 */
export function mainSeries(series) {
	return series?.list?.[0] ?? null;
}

/**
 * La próxima edición anunciada de alguna de las series del evento (para «Este evento ya pasó»),
 * o `null`.
 *
 * @param {{ list?: SeriesInfo[] } | null | undefined} series
 */
export function nextEdition(series) {
	for (const s of series?.list ?? []) if (s.nextUpcoming) return s.nextUpcoming;
	return null;
}

/**
 * Las opciones del menú «Agregar a mi calendario» (add-to-calendar-button): Google, el archivo
 * .ics (que abre Apple Calendar y el calendario del celu) y Outlook, con nombres claros (la
 * librería decía «iCal Ficha»). `Apple` y no `iCal`: en iPhone la librería suma Apple si ve
 * iCal, y quedaban dos opciones iguales.
 */
export const CALENDAR_OPTIONS = Object.freeze([
	'Google',
	'Apple|Apple / celu (.ics)',
	'Outlook.com|Outlook'
]);

/** @type {Record<string, 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE'>} */
const CALENDAR_STATUS = {
	abierto: 'CONFIRMED',
	cancelado: 'CANCELLED',
	anunciado: 'TENTATIVE',
	agotadas: 'CONFIRMED'
};

/**
 * Los datos de «Agregar a mi calendario» para add-to-calendar-button, en hora argentina. El menú
 * es un diálogo (`listStyle: 'modal'`) con «Cerrar».
 *
 * @param {{ title: string, summary?: string, start: string | number | Date,
 *   end?: string | number | Date | null, status?: string, postID?: string }} meta
 */
export function calendarButtonEvent(meta) {
	const end = eventEnd(/** @type {any} */ (meta.start), /** @type {any} */ (meta.end ?? undefined));
	return {
		name: meta.title,
		description: meta.summary,
		startDate: format(toArgentina(meta.start), 'yyyy-MM-dd'),
		startTime: format(toArgentina(meta.start), 'HH:mm'),
		endDate: format(toArgentina(end), 'yyyy-MM-dd'),
		endTime: format(toArgentina(end), 'HH:mm'),
		status: CALENDAR_STATUS[meta.status ?? ''] ?? 'CONFIRMED',
		timeZone: 'America/Buenos_Aires',
		options: [...CALENDAR_OPTIONS],
		language: /** @type {const} */ ('es'),
		customLabels: { close: 'Cerrar' },
		iCalFileName: meta.postID || meta.title || 'evento',
		listStyle: /** @type {const} */ ('modal'),
		organizer: 'Mel|kinkyvibe@gmail.com'
	};
}

/**
 * @param {string | number | Date | null | undefined} d
 * @returns {number}
 */
const time = (d) => (d ? new Date(d).getTime() : NaN);

/**
 * «Más cosas de…»: los eventos que vienen primero, del más cercano al más lejano, y después lo
 * que no es un evento (en el orden en que vino); los eventos que ya empezaron van aparte, del más
 * reciente al más viejo.
 *
 * @template {{ meta: { category?: string, start?: string | number | Date | null } }} P
 * @param {readonly P[]} posts
 * @param {number} [now]
 * @returns {{ upcoming: P[], past: P[] }}
 */
export function splitUpcomingPast(posts, now = Date.now()) {
	/** @type {P[]} */ const events = [];
	/** @type {P[]} */ const other = [];
	/** @type {P[]} */ const past = [];
	for (const p of posts) {
		if (p.meta.category !== 'calendario') other.push(p);
		else if (time(p.meta.start) > now) events.push(p);
		else past.push(p);
	}
	events.sort((a, b) => time(a.meta.start) - time(b.meta.start));
	past.sort((a, b) => time(b.meta.start) - time(a.meta.start));
	return { upcoming: [...events, ...other], past };
}

/**
 * @typedef {{ title: string, path: string, category: string, date: string | null }} Participation
 * @typedef {{ rol: string, items: Participation[] }} ParticipationGroup
 */

/**
 * «Participa en» de un perfil: por rol, los eventos que vienen (del más cercano al más lejano) y
 * lo que no es un evento; los eventos que ya pasaron, en `past`, con los mismos roles (del más
 * reciente al más viejo). Los roles sin nada en una parte no aparecen en ella.
 *
 * @param {readonly ParticipationGroup[]} groups
 * @param {number} [now]
 * @returns {{ current: ParticipationGroup[], past: ParticipationGroup[] }}
 */
export function splitParticipations(groups, now = Date.now()) {
	/** @type {ParticipationGroup[]} */ const current = [];
	/** @type {ParticipationGroup[]} */ const past = [];
	for (const g of groups) {
		const posts = g.items.map((item) => ({
			item,
			meta: { category: item.category, start: item.date }
		}));
		// Un evento sin fecha no se puede ubicar: queda con lo que viene.
		const dated = posts.filter((p) => p.meta.category !== 'calendario' || p.meta.start);
		const undated = posts.filter((p) => !dated.includes(p));
		const split = splitUpcomingPast(dated, now);
		const up = [...split.upcoming, ...undated].map((p) => p.item);
		const old = split.past.map((p) => p.item);
		if (up.length) current.push({ rol: g.rol, items: up });
		if (old.length) past.push({ rol: g.rol, items: old });
	}
	return { current, past };
}
