/**
 * La planilla de la agenda (/admin/eventos/agenda, vista Planilla): funciones puras para
 * agrupar las filas por semana y por día, con las notas de cada día, filtrarlas y armar el CSV.
 *
 * - `weekStart` / `weekLabel`: la semana (de lunes a domingo) de un día;
 * - `matchesAgendaFilter` / `isFiltering`: los filtros rápidos (texto, región, estado);
 * - `agendaSheetGroups`: filas + notas → semanas → días;
 * - `agendaCsvRows`: los grupos → filas del CSV (un evento por fila y los días que solo tienen
 *   notas, con las notas del día en su columna).
 */
import { dayLabel } from '$lib/admin/eventFormat.js';
import { addDays, isValidDate } from './eventDraft.js';
import { foldText } from './text.js';

/**
 * @typedef {{ slug: string, date: string, title: string, locationName: string, place: string, state: string }} SheetRowLike
 * @typedef {{ q: string, place: string, state: string }} SheetFilter
 */

/** @type {SheetFilter} */
export const EMPTY_SHEET_FILTER = Object.freeze({ q: '', place: '', state: '' });

/**
 * El lunes de la semana de un día (YYYY-MM-DD).
 * @param {string} date
 */
export function weekStart(date) {
	const [y, m, d] = date.split('-').map(Number);
	const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return addDays(date, -((wd + 6) % 7));
}

/**
 * "Semana del lun 5 oct" (para el lunes de la semana).
 * @param {string} monday
 */
export function weekLabel(monday) {
	return `Semana del ${dayLabel(monday)}`;
}

/** @param {SheetFilter} f */
export function isFiltering(f) {
	return Boolean(f.q.trim() || f.place || f.state);
}

/**
 * Si una fila pasa los filtros: el texto busca en título, lugar y slug (sin tildes ni
 * mayúsculas); región y estado tienen que ser iguales.
 * @param {SheetRowLike} row
 * @param {SheetFilter} f
 */
export function matchesAgendaFilter(row, f) {
	if (f.place && row.place !== f.place) return false;
	if (f.state && row.state !== f.state) return false;
	const q = foldText(f.q);
	if (!q) return true;
	const hay = foldText(`${row.title} ${row.locationName} ${row.slug}`);
	return q.split(' ').every((w) => hay.includes(w));
}

/**
 * @template {SheetRowLike} R
 * @typedef {{ date: string, label: string, rows: R[], notes: import('./dayNotes.js').DayNote[] }} SheetDay
 */
/**
 * @template {SheetRowLike} R
 * @typedef {{ start: string, label: string, days: SheetDay<R>[] }} SheetWeek
 */

/**
 * Agrupa las filas por semana y por día, cada día con sus notas. Los días que solo tienen notas
 * también aparecen (desde `from`), salvo cuando hay un filtro: ahí solo los días con filas que lo
 * pasan. Dentro de un día las filas quedan en el orden en que vinieron; las que no tienen fecha
 * válida van al final, en "Sin fecha".
 * @template {SheetRowLike} R
 * @param {readonly R[]} rows
 * @param {readonly import('./dayNotes.js').DayNote[]} notes
 * @param {{ from?: string, filter?: SheetFilter }} [options]
 * @returns {SheetWeek<R>[]}
 */
export function agendaSheetGroups(rows, notes, { from = '', filter = EMPTY_SHEET_FILTER } = {}) {
	const filtering = isFiltering(filter);
	/** @type {Map<string, SheetDay<R>>} */
	const days = new Map();
	/** @param {string} date */
	const day = (date) => {
		let d = days.get(date);
		if (!d) {
			d = { date, label: date ? dayLabel(date) : 'Sin fecha', rows: [], notes: [] };
			days.set(date, d);
		}
		return d;
	};
	for (const r of rows) {
		if (!matchesAgendaFilter(r, filter)) continue;
		day(isValidDate(r.date) ? r.date : '').rows.push(r);
	}
	for (const n of [...notes].sort((a, b) => a.id - b.id)) {
		if (n.date < from) continue;
		if (filtering && !days.has(n.date)) continue;
		day(n.date).notes.push(n);
	}
	const sorted = [...days.values()].sort((a, b) =>
		a.date === b.date ? 0 : !a.date ? 1 : !b.date ? -1 : a.date < b.date ? -1 : 1
	);
	/** @type {SheetWeek<R>[]} */
	const weeks = [];
	for (const d of sorted) {
		const start = d.date ? weekStart(d.date) : '';
		let w = weeks[weeks.length - 1];
		if (!w || w.start !== start) {
			w = { start, label: start ? weekLabel(start) : 'Sin fecha', days: [] };
			weeks.push(w);
		}
		w.days.push(d);
	}
	return weeks;
}

/**
 * Las filas del CSV de la planilla: una por evento y una por cada día que solo tiene notas
 * (`row: null`). `notes` son las notas del día unidas con " · ".
 * @template {SheetRowLike} R
 * @param {readonly SheetWeek<R>[]} weeks
 * @returns {{ date: string, row: R | null, notes: string }[]}
 */
export function agendaCsvRows(weeks) {
	/** @type {{ date: string, row: R | null, notes: string }[]} */
	const out = [];
	for (const w of weeks) {
		for (const d of w.days) {
			const notes = d.notes.map((n) => n.body).join(' · ');
			if (!d.rows.length) out.push({ date: d.date, row: null, notes });
			for (const row of d.rows) out.push({ date: d.date, row, notes });
		}
	}
	return out;
}
