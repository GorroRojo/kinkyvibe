/**
 * Orden de la lista de Ventas › Órdenes (tarjetas, no una tabla): un selector «Ordenar» con estas
 * opciones y `?orden=` en la URL. La página trae todas las órdenes del evento (no se pagina), así
 * que se ordenan en el navegador, con el mismo comparador que `Table` (./tableSort.js): texto en
 * castellano, plata como número, vacías al final. Para desempatar, el id (siempre el mismo orden).
 */
import { sortRows } from '$lib/components/ui/tableSort.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   column?: import('$lib/components/ui/tableSort.js').SortableColumn,
 *   dir?: import('$lib/components/ui/tableSort.js').SortDir
 * }} OrderSort
 */

/** La de siempre: como vienen del servidor, la más nueva primero. */
export const DEFAULT_ORDER_SORT = 'recientes';

/** @type {readonly OrderSort[]} */
export const ORDER_SORTS = Object.freeze([
	{ id: DEFAULT_ORDER_SORT, label: 'Más nuevas primero' },
	{
		id: 'viejas',
		label: 'Más viejas primero',
		column: { key: 'createdAt', sort: 'date' },
		dir: 'asc'
	},
	{ id: 'nombre', label: 'Nombre (A → Z)', column: { key: 'name', sort: 'text' }, dir: 'asc' },
	{
		id: 'total',
		label: 'Total (mayor primero)',
		column: { key: 'total', sort: 'number' },
		dir: 'desc'
	},
	{
		id: 'entradas',
		label: 'Entradas (más primero)',
		column: { key: 'quantity', sort: 'number' },
		dir: 'desc'
	}
]);

/**
 * El orden que pide `?orden=` (el de siempre si falta o no es uno de la lista).
 * @param {string | null | undefined} value
 */
export function orderSortOf(value) {
	return ORDER_SORTS.some((s) => s.id === value) ? String(value) : DEFAULT_ORDER_SORT;
}

/**
 * Las órdenes en ese orden (una copia; con el de siempre, las mismas filas tal como vinieron).
 * @template {{ id: string }} T
 * @param {readonly T[]} rows
 * @param {string} id
 * @returns {readonly T[]}
 */
export function sortOrders(rows, id) {
	const option = ORDER_SORTS.find((s) => s.id === id);
	if (!option?.column) return rows;
	// `sortRows` es estable: primero por id (como lo ordena la base, letra por letra), después por
	// la columna; los empates quedan por id.
	const byId = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return sortRows(byId, option.column, option.dir ?? 'asc');
}
