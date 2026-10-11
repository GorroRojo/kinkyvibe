/**
 * Exportar tablas del panel a CSV. Toda tabla/lista del panel ofrece "⬇ CSV" (gorrite): usá
 * `toCsv` + `csvResponse` en un endpoint `+server.js`, o `toCsv` + `downloadCsv` en el navegador
 * (ver `CsvButton.svelte`).
 *
 * Las fechas van en hora de Argentina, `2026-10-02 22:30` (`argDateTimeCsv`): pasá un `Date` y
 * `csvCell` lo escribe así. Nunca ISO en UTC (una compra de las 22:30 salía al día siguiente).
 *
 * @template T
 * @typedef {{ key?: keyof T & string, label: string, value?: (row: T) => unknown }} CsvColumn
 */

import { argDateTimeCsv } from '$lib/utils/dates.js';

/**
 * Celdas que Excel/Sheets interpretarían como fórmula (inyección de CSV): se les antepone `'`.
 * https://owasp.org/www-community/attacks/CSV_Injection
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function csvCell(value) {
	if (value === null || value === undefined) return '';
	let s;
	if (value instanceof Date) s = argDateTimeCsv(value);
	else if (typeof value === 'number') s = Number.isFinite(value) ? String(value) : '';
	else if (typeof value === 'boolean') s = value ? 'sí' : 'no';
	else if (typeof value === 'object') s = JSON.stringify(value);
	else s = String(value);
	// Los números negativos son números, no fórmulas.
	if (FORMULA_START.test(s) && !(typeof value === 'number')) s = "'" + s;
	return /[",\n\r;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * Arma un CSV (separado por comas, filas con CRLF, con BOM para que Excel lea bien los acentos).
 *
 * @template T
 * @param {readonly T[]} rows
 * @param {readonly CsvColumn<T>[]} columns `label` es el encabezado; el valor sale de
 *   `value(row)` o de `row[key]`.
 * @param {{ bom?: boolean }} [opts]
 * @returns {string}
 */
export function toCsv(rows, columns, { bom = true } = {}) {
	const lines = [columns.map((c) => csvCell(c.label)).join(',')];
	for (const row of rows) {
		lines.push(
			columns
				.map((c) =>
					csvCell(
						c.value
							? c.value(row)
							: c.key
								? /** @type {Record<string, unknown>} */ (row)[c.key]
								: ''
					)
				)
				.join(',')
		);
	}
	return (bom ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n';
}

/**
 * Nombre de archivo seguro: `picantearla-2026-10-ordenes.csv`.
 * @param {...(string | number | null | undefined)} parts
 */
export function csvFilename(...parts) {
	const base = parts
		.filter((p) => p !== null && p !== undefined && p !== '')
		.map((p) =>
			String(p)
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '')
		)
		.filter(Boolean)
		.join('-');
	return (base || 'export') + '.csv';
}

/**
 * Respuesta de un endpoint `+server.js` que descarga un CSV. Privada y sin caché (tiene datos de
 * personas).
 * @param {string} csv
 * @param {string} filename
 */
export function csvResponse(csv, filename) {
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename.replace(/["\\\r\n]/g, '')}"`,
			'cache-control': 'private, no-store',
			'referrer-policy': 'no-referrer'
		}
	});
}

/**
 * Descarga un CSV desde el navegador (para tablas que ya están en la página).
 * @param {string} csv
 * @param {string} filename
 */
export function downloadCsv(csv, filename) {
	const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
