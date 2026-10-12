/**
 * Orden de las columnas de `Table.svelte` (docs/estilo.md, «Componentes»), puro para probarlo
 * sin navegador. Solo ordena las filas que ya están en la página: una lista que se pagina en el
 * servidor no se ordena acá (sería un orden falso).
 *
 * Una columna se puede ordenar si declara `sort`:
 * - 'text' (o `true`): texto, en castellano, sin distinguir mayúsculas ni tildes y con los
 *   números adentro en orden de número («KV-2» antes que «KV-10»);
 * - 'number': número (plata, cantidades), nunca como texto («$ 9.000» antes que «$ 24.000»);
 * - 'date': fecha (`Date`, milisegundos o texto ISO).
 * `sortValue(row)` dice qué valor ordenar (por defecto `row[key]`): por ejemplo el número de la
 * plata, no el texto «$ 24.000». Las celdas vacías (null, '', una fecha o un número inválidos)
 * van siempre al final, en los dos sentidos. El orden es estable: las filas con el mismo valor
 * quedan como venían.
 */

/** @typedef {'asc' | 'desc'} SortDir */
/** @typedef {'text' | 'number' | 'date'} SortType */
/**
 * @typedef {{
 *   key: string,
 *   sort?: SortType | boolean,
 *   sortValue?: (row: any) => unknown
 * }} SortableColumn
 */
/** @typedef {{ key: string, dir: SortDir }} SortState */
/**
 * Una columna de `Table.svelte` (ver sus props).
 * @typedef {{
 *   key: string,
 *   label: string,
 *   align?: 'left' | 'right',
 *   sort?: SortType | boolean,
 *   sortValue?: (row: any) => unknown,
 *   width?: string,
 *   nowrap?: boolean,
 *   class?: string,
 *   title?: string,
 *   hideLabel?: boolean
 * }} TableColumn
 */

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/**
 * El tipo de orden de una columna, o null si no se ordena.
 * @param {SortableColumn} column
 * @returns {SortType | null}
 */
export function sortType(column) {
	if (!column.sort) return null;
	return column.sort === true ? 'text' : column.sort;
}

/**
 * El valor comparable de una celda, o null si está vacía.
 * @param {unknown} value
 * @param {SortType} type
 * @returns {string | number | null}
 */
export function sortKey(value, type) {
	if (value === null || value === undefined || value === '') return null;
	if (type === 'number') {
		const n = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(n) ? n : null;
	}
	if (type === 'date') {
		const ms =
			value instanceof Date
				? value.getTime()
				: typeof value === 'number'
					? value
					: Date.parse(String(value));
		return Number.isFinite(ms) ? ms : null;
	}
	return String(value);
}

/**
 * Las filas ordenadas por una columna (una copia; `rows` no cambia).
 * @template {Record<string, any>} T
 * @param {readonly T[]} rows
 * @param {SortableColumn} column
 * @param {SortDir} dir
 * @returns {T[]}
 */
export function sortRows(rows, column, dir) {
	const type = sortType(column);
	if (!type) return [...rows];
	const read = column.sortValue ?? ((/** @type {any} */ row) => row[column.key]);
	const sign = dir === 'desc' ? -1 : 1;
	return rows
		.map((row, i) => ({ row, i, k: sortKey(read(row), type) }))
		.sort((a, b) => {
			if (a.k === null || b.k === null) {
				// vacías al final, en los dos sentidos
				if (a.k === b.k) return a.i - b.i;
				return a.k === null ? 1 : -1;
			}
			const c =
				typeof a.k === 'number' && typeof b.k === 'number'
					? a.k - b.k
					: collator.compare(String(a.k), String(b.k));
			return c === 0 ? a.i - b.i : sign * c;
		})
		.map((x) => x.row);
}

/**
 * El orden después de tocar el encabezado de una columna: si ya era esa, da vuelta el sentido;
 * si no, la ordena de menor a mayor (A → Z, lo más viejo primero).
 * @param {SortState | null | undefined} current
 * @param {SortableColumn} column
 * @returns {SortState}
 */
export function nextSort(current, column) {
	if (current?.key === column.key) {
		return { key: column.key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
	}
	return { key: column.key, dir: 'asc' };
}

/**
 * El `aria-sort` del encabezado de una columna (undefined si no se puede ordenar o si la tabla
 * está ordenada por otra).
 * @param {SortState | null | undefined} current
 * @param {SortableColumn} column
 * @returns {'ascending' | 'descending' | undefined}
 */
export function ariaSort(current, column) {
	if (!sortType(column) || current?.key !== column.key) return undefined;
	return current.dir === 'asc' ? 'ascending' : 'descending';
}
