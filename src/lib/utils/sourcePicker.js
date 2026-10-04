/**
 * Elegir el evento que se duplica al importar la planilla (/admin/eventos/importar): un buscador
 * mientras se escribe, por título, fecha y serie (nombre o etiqueta), con lo más reciente primero.
 *
 * - `sourceSearchText`: todo lo que se puede escribir para encontrar un evento (sin tildes);
 * - `searchSources`: los que coinciden con todas las palabras, más recientes primero; sin
 *   búsqueda, primero los sugeridos (la serie que se encontró para la fila) y después los demás;
 * - `sourceLabel`: «Título · vie 2 oct · 22:00», lo que se ve en la lista y en el elegido.
 *
 * Funciones puras: corren en el navegador y en vitest.
 */
import { dayLabel, foldSearch, listDate } from '$lib/admin/eventFormat.js';
import { parseEventDate } from './eventDraft.js';

const MONTHS = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre setiembre',
	'octubre',
	'noviembre',
	'diciembre'
];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * @typedef {object} ImportSource un evento que se puede duplicar
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} start formato del sitio ('' si no tiene)
 * @prop {string} [end]
 * @prop {string} [series] nombre de la serie ('' si no está en ninguna)
 * @prop {string[]} [tags] etiquetas del evento (también las de serie)
 * @prop {boolean} [hidden] oculto (`force_unpublished`)
 * @prop {boolean} [unlisted] no listado (borrador o a propósito)
 */

/**
 * Todo lo que alguien puede escribir para encontrar el evento, sin tildes ni mayúsculas, en
 * palabras separadas por espacios: título, slug, serie, etiquetas y la fecha de varias formas
 * («vie 2 oct», «viernes», «octubre», «2/10», «2026-10-02», «2026»).
 *
 * @param {ImportSource} e
 */
export function sourceSearchText(e) {
	const parts = [e.title, e.slug.replace(/-/g, ' '), e.series ?? '', ...(e.tags ?? [])];
	const { date, time } = parseEventDate(e.start);
	if (date) {
		const [y, m, d] = date.split('-').map(Number);
		const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
		parts.push(dayLabel(date), WEEKDAYS[wd], MONTHS[m - 1], `${d}/${m}`, date, String(y));
		if (time) parts.push(time);
	}
	return foldSearch(parts.join(' ')).replace(/\s+/g, ' ');
}

/**
 * ¿La palabra está en el texto? Los números tienen que ser una palabra entera («2» no encuentra
 * «2026» ni «22:00»; «2/10» y «2026-10» sí, como comienzo); el resto, en cualquier parte («cante»
 * encuentra «Picantearla»).
 *
 * @param {string} hay de {@link sourceSearchText}
 * @param {string[]} tokens las palabras de `hay`
 * @param {string} word ya sin tildes
 */
function matches(hay, tokens, word) {
	if (/^\d+$/.test(word)) return tokens.includes(word);
	if (/^\d[\d/:-]*$/.test(word)) return tokens.some((t) => t.startsWith(word));
	return hay.includes(word);
}

/**
 * Los eventos que coinciden con la búsqueda (todas las palabras), del más reciente al más viejo.
 * Sin búsqueda: primero los sugeridos (en su orden), después los demás, del más reciente al más
 * viejo. Nunca repite un evento.
 *
 * @param {ImportSource[]} sources
 * @param {string} query
 * @param {{ limit?: number, suggested?: string[] }} [opts]
 * @returns {ImportSource[]}
 */
export function searchSources(sources, query, { limit = 8, suggested = [] } = {}) {
	const words = foldSearch(query).split(/\s+/).filter(Boolean);
	const byRecent = [...sources].sort(
		(a, b) => (b.start || '').localeCompare(a.start || '') || a.slug.localeCompare(b.slug)
	);
	if (!words.length) {
		const bySlug = new Map(sources.map((s) => [s.slug, s]));
		/** @type {ImportSource[]} */
		const first = [];
		for (const slug of suggested) {
			const s = bySlug.get(slug);
			if (s && !first.includes(s)) first.push(s);
		}
		const seen = new Set(first.map((s) => s.slug));
		return [...first, ...byRecent.filter((s) => !seen.has(s.slug))].slice(0, limit);
	}
	/** @type {ImportSource[]} */
	const out = [];
	for (const s of byRecent) {
		if (out.length >= limit) break;
		const hay = sourceSearchText(s);
		const tokens = hay.split(' ');
		if (words.every((w) => matches(hay, tokens, w))) out.push(s);
	}
	return out;
}

/**
 * «vie 2 oct · 22:00 · Serie» (lo que acompaña al título en la lista).
 *
 * @param {ImportSource} e
 * @param {string} [today] YYYY-MM-DD: el año se muestra solo si es otro
 */
export function sourceDetail(e, today = '') {
	const parts = [listDate(e.start, today) || 'sin fecha'];
	if (e.series) parts.push(e.series);
	if (e.hidden) parts.push('oculto');
	else if (e.unlisted) parts.push('no listado');
	return parts.join(' · ');
}

/**
 * «Título · vie 2 oct · 22:00» (el elegido).
 *
 * @param {ImportSource} e
 * @param {string} [today]
 */
export function sourceLabel(e, today = '') {
	const when = listDate(e.start, today);
	return when ? `${e.title} · ${when}` : e.title;
}
