/**
 * Piezas puras de la página de un evento (/calendario/<evento>) y de las listas que lo rodean:
 * si el evento ya pasó, la serie que se puede seguir y cómo se ordenan «Más cosas de…» y
 * «Participa en» (próximos primero, en orden de fecha; los pasados aparte).
 */
import { argDateParts, eventEnd, parseSiteDate } from './dates.js';

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
 * El título de la pestaña (y de los buscadores) de un evento, sin «· Kinky Vibe»: el de siempre
 * con el día de esa fecha, en hora de Argentina («Jamarada Kinky · 24 de febrero de 2026»), para
 * que las ediciones de un evento que se repite (sea o no de una serie, aunque caigan en el mismo
 * mes) no tengan todas el mismo título (docs/seo.md). No mira la serie: sale solo de este evento.
 * Si el título ya dice ese día («Fiesta del 24 de febrero»), o la fecha no se entiende, queda como
 * está.
 *
 * @param {{ title?: string, start?: string | number | Date | null }} meta
 */
export function eventPageTitle(meta) {
	const title = String(meta?.title ?? '');
	if (!meta?.start) return title;
	const parts = argDateParts(parseSiteDate(meta.start));
	if (!parts) return title;
	const day = `${parts.day} de ${parts.monthLong}`;
	if (title.toLocaleLowerCase('es').includes(day)) return title;
	return `${title} · ${day} de ${parts.year}`;
}

/** El largo máximo del `<title>` de un evento: Google muestra unos 60 caracteres. */
export const EVENT_TAB_TITLE_MAX = 65;

/**
 * El `<title>` de un evento: {@link eventPageTitle} con «· Kinky Vibe» si entra en
 * {@link EVENT_TAB_TITLE_MAX} caracteres; si no, sin la marca; y si el título solo ya es más
 * largo, recortado en una palabra con «…», conservando el día. Solo la pestaña y los buscadores:
 * el `h1` y `og:title` llevan el título entero.
 *
 * @param {{ title?: string, start?: string | number | Date | null }} meta
 */
export function eventTabTitle(meta) {
	const base = eventPageTitle(meta);
	const branded = `${base} · Kinky Vibe`;
	if (branded.length <= EVENT_TAB_TITLE_MAX) return branded;
	if (base.length <= EVENT_TAB_TITLE_MAX) return base;
	const title = String(meta?.title ?? '');
	// Lo que agrega eventPageTitle después del título (« · 24 de febrero de 2026», o nada).
	const suffix = base.startsWith(title) ? base.slice(title.length) : '';
	const room = EVENT_TAB_TITLE_MAX - suffix.length - 1;
	if (room < 10) return `${base.slice(0, EVENT_TAB_TITLE_MAX - 1).trimEnd()}…`;
	const cut = title.slice(0, room);
	const space = cut.lastIndexOf(' ');
	const short = (space > room / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:·–—-]+$/, '');
	return `${short}…${suffix}`;
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
