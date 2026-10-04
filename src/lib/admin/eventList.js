/**
 * La lista de Panel → Eventos: filtros, búsqueda y columnas del CSV. Puras: las usan la página
 * (filtros al instante sobre lo cargado) y el servidor (cuentas, páginas de eventos anteriores,
 * búsqueda en todos los eventos y el CSV completo), así dan exactamente lo mismo.
 *
 * La página no recibe todos los eventos: los próximos, los borradores y los de los últimos
 * {@link PAST_DAYS} días (ver `firstPage` en $lib/server/eventos/panelList.js). Los anteriores se
 * piden de a {@link OLDER_PAGE} con «Ver anteriores», y buscar busca en el servidor.
 */
import { foldSearch } from './eventFormat.js';
import { goalProgress } from '$lib/utils/salesGoal.js';

/**
 * @typedef {{
 *   slug: string, title: string, start: string, end: string, status: string,
 *   locationName: string, location: string, place: string, unlisted: boolean,
 *   unpublished: boolean, online: boolean, thumb: string, sellsTickets: boolean,
 *   capacity: number | null, goal: string, sold: number, revenue: number, mpFee: number,
 *   transfers: number, i: number
 * }} EventRow
 *   Una fila de la lista. `i`: su lugar en la lista completa (del más nuevo al más viejo), para
 *   mezclar lo que llega después sin desordenar. `goal`: la meta de venta como se guarda
 *   (`'plata:250000'`, '' = sin meta; ver $lib/utils/salesGoal.js); `revenue`: lo recaudado;
 *   `mpFee`: la comisión de Mercado Pago de eso (la meta en plata cuenta lo neto).
 */

/** Cuántos días de eventos pasados manda la página de entrada (unos tres meses). */
export const PAST_DAYS = 90;

/** Cuántos eventos anteriores trae cada «Ver anteriores». */
export const OLDER_PAGE = 40;

export const FILTERS = /** @type {const} */ ([
	{ id: 'proximos', label: 'Próximos' },
	{ id: 'pasados', label: 'Pasados' },
	// Todos los no listados (borradores de la agenda y los no listados a propósito).
	{ id: 'borradores', label: 'No listados' },
	{ id: 'sin-imagen', label: 'Sin imagen' }
]);

/** @typedef {(typeof FILTERS)[number]['id']} FilterId */

/**
 * El filtro de la dirección (`?filtro=`), o «Próximos».
 * @param {string | null | undefined} id
 * @returns {FilterId}
 */
export function filterId(id) {
	return FILTERS.find((f) => f.id === id)?.id ?? 'proximos';
}

/**
 * ¿Es de hoy en adelante (día de Argentina)?
 * @param {{ start: string }} e
 * @param {string} today YYYY-MM-DD
 */
export function isUpcoming(e, today) {
	return !!e.start && e.start.slice(0, 10) >= today;
}

/**
 * Qué eventos entran en cada filtro.
 * @param {string} today YYYY-MM-DD
 * @returns {Record<FilterId, (e: Pick<EventRow, 'start' | 'unpublished' | 'unlisted' | 'thumb'>) => boolean>}
 */
export function filterTests(today) {
	return {
		proximos: (e) => isUpcoming(e, today) && !e.unpublished,
		pasados: (e) => !isUpcoming(e, today),
		borradores: (e) => e.unlisted && !e.unpublished,
		'sin-imagen': (e) => isUpcoming(e, today) && !e.thumb && !e.unpublished
	};
}

/**
 * Los eventos de un filtro, en el orden en que se muestran: «Próximos» y «Sin imagen», del más
 * cercano al más lejano; el resto, del más nuevo al más viejo (el orden de `rows`).
 * @template {Pick<EventRow, 'start' | 'unpublished' | 'unlisted' | 'thumb'>} T
 * @param {T[]} rows del más nuevo al más viejo
 * @param {FilterId} filter
 * @param {string} today
 * @returns {T[]}
 */
export function inFilter(rows, filter, today) {
	const out = rows.filter(filterTests(today)[filter]);
	return filter === 'proximos' || filter === 'sin-imagen' ? out.reverse() : out;
}

/**
 * Las palabras de una búsqueda (sin tildes ni mayúsculas).
 * @param {string} query
 */
export function searchWords(query) {
	return foldSearch(query).split(/\s+/).filter(Boolean);
}

/**
 * ¿El evento tiene todas las palabras (en el título, la dirección o el lugar)?
 * @param {Pick<EventRow, 'title' | 'slug' | 'locationName' | 'location' | 'place'>} e
 * @param {string[]} words ver {@link searchWords}
 */
export function matchesSearch(e, words) {
	const hay = foldSearch(`${e.title} ${e.slug} ${e.locationName} ${e.location} ${e.place}`);
	return words.every((w) => hay.includes(w));
}

/** @type {import('./csv.js').CsvColumn<EventRow>[]} */
export const CSV_COLUMNS = [
	{ label: 'slug', key: 'slug' },
	{ label: 'título', key: 'title' },
	{ label: 'empieza', key: 'start' },
	{ label: 'termina', key: 'end' },
	{ label: 'estado', key: 'status' },
	{ label: 'no listado', value: (e) => (e.unlisted ? 'sí' : '') },
	{ label: 'lugar', key: 'locationName' },
	{ label: 'dirección', key: 'location' },
	{ label: 'región', key: 'place' },
	{ label: 'imagen', value: (e) => (e.thumb ? 'sí' : 'no') },
	{ label: 'vende entradas', value: (e) => (e.sellsTickets ? 'sí' : '') },
	{ label: 'vendidas', value: (e) => (e.sellsTickets ? e.sold : '') },
	{ label: 'cupo', value: (e) => e.capacity ?? '' },
	{ label: 'meta', value: (e) => goalProgress(e.goal, e)?.text ?? '' },
	{ label: 'transferencias pendientes', value: (e) => e.transfers || '' }
];
