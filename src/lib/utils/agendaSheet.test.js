import { describe, expect, it } from 'vitest';
import {
	EMPTY_SHEET_FILTER,
	agendaCsvRows,
	agendaSheetGroups,
	isFiltering,
	matchesAgendaFilter,
	weekLabel,
	weekStart
} from './agendaSheet.js';

/** @param {Partial<import('./agendaSheet.js').SheetRowLike>} r */
const row = (r) => ({
	slug: 'fiesta',
	date: '2099-12-12',
	title: 'Fiesta',
	locationName: '',
	place: 'AMBA',
	state: 'publicado',
	...r
});

/** @param {Partial<import('./dayNotes.js').DayNote>} n @returns {import('./dayNotes.js').DayNote} */
const note = (n) => ({
	id: 1,
	date: '2099-12-12',
	body: 'Feriado',
	color: 'amarillo',
	updatedAt: 0,
	updatedBy: 'admin-inventade',
	...n
});

describe('semanas', () => {
	it('weekStart da el lunes (2099-12-12 es sábado)', () => {
		expect(weekStart('2099-12-12')).toBe('2099-12-07');
		expect(weekStart('2099-12-07')).toBe('2099-12-07');
		expect(weekStart('2099-12-13')).toBe('2099-12-07');
		expect(weekStart('2099-12-14')).toBe('2099-12-14');
	});

	it('weekLabel', () => {
		expect(weekLabel('2099-12-07')).toBe('Semana del lun 7 dic');
	});
});

describe('filtros', () => {
	const r = row({
		title: 'Fiesta Fetiche',
		locationName: 'Casa Córdoba',
		slug: 'fiesta-fetiche-2099-12'
	});

	it('sin filtros pasa todo', () => {
		expect(isFiltering(EMPTY_SHEET_FILTER)).toBe(false);
		expect(matchesAgendaFilter(r, EMPTY_SHEET_FILTER)).toBe(true);
	});

	it('el texto busca en título, lugar y slug, sin tildes ni mayúsculas, todas las palabras', () => {
		expect(matchesAgendaFilter(r, { ...EMPTY_SHEET_FILTER, q: 'cordoba' })).toBe(true);
		expect(matchesAgendaFilter(r, { ...EMPTY_SHEET_FILTER, q: 'FETICHE casa' })).toBe(true);
		expect(matchesAgendaFilter(r, { ...EMPTY_SHEET_FILTER, q: 'fetiche taller' })).toBe(false);
		expect(isFiltering({ ...EMPTY_SHEET_FILTER, q: '  ' })).toBe(false);
	});

	it('región y estado tienen que coincidir', () => {
		expect(matchesAgendaFilter(r, { ...EMPTY_SHEET_FILTER, place: 'AMBA' })).toBe(true);
		expect(matchesAgendaFilter(r, { ...EMPTY_SHEET_FILTER, place: 'Córdoba' })).toBe(false);
		expect(matchesAgendaFilter(r, { ...EMPTY_SHEET_FILTER, state: 'cancelado' })).toBe(false);
	});
});

describe('agendaSheetGroups', () => {
	const rows = [
		row({ slug: 'a', date: '2099-12-12', title: 'A' }),
		row({ slug: 'b', date: '2099-12-14', title: 'B', place: 'Córdoba' }),
		row({ slug: 'c', date: '2099-12-12', title: 'C' }),
		row({ slug: 'sin', date: '', title: 'Sin fecha' })
	];
	const notes = [
		note({ id: 2, date: '2099-12-12', body: 'Feriado' }),
		note({ id: 1, date: '2099-12-12', body: 'Primera' }),
		note({ id: 3, date: '2099-12-10', body: 'Solo nota' }),
		note({ id: 4, date: '2099-11-30', body: 'Vieja' })
	];

	it('agrupa por semana y día, con las notas (desde `from`) y los días que solo tienen notas', () => {
		const weeks = agendaSheetGroups(rows, notes, { from: '2099-12-01' });
		expect(weeks.map((w) => w.start)).toEqual(['2099-12-07', '2099-12-14', '']);
		expect(weeks[0].days.map((d) => d.date)).toEqual(['2099-12-10', '2099-12-12']);
		expect(weeks[0].days[0].rows).toEqual([]);
		expect(weeks[0].days[0].notes.map((n) => n.body)).toEqual(['Solo nota']);
		expect(weeks[0].days[1].rows.map((r) => r.slug)).toEqual(['a', 'c']);
		expect(weeks[0].days[1].notes.map((n) => n.body)).toEqual(['Primera', 'Feriado']);
		expect(weeks[0].days[1].label).toBe('sáb 12 dic');
		expect(weeks[2]).toMatchObject({
			label: 'Sin fecha',
			days: [{ date: '', label: 'Sin fecha' }]
		});
	});

	it('con filtro solo quedan los días con filas que pasan (y sus notas)', () => {
		const weeks = agendaSheetGroups(rows, notes, {
			from: '2099-12-01',
			filter: { ...EMPTY_SHEET_FILTER, place: 'AMBA' }
		});
		const days = weeks.flatMap((w) => w.days);
		expect(days.map((d) => d.date)).toEqual(['2099-12-12', '']);
		expect(days[0].notes).toHaveLength(2);
	});

	it('sin filas ni notas, vacío', () => {
		expect(agendaSheetGroups([], [], {})).toEqual([]);
	});
});

describe('agendaCsvRows', () => {
	it('una fila por evento, con las notas del día, y una por día que solo tiene notas', () => {
		const weeks = agendaSheetGroups(
			[row({ slug: 'a', date: '2099-12-12' }), row({ slug: 'b', date: '2099-12-12' })],
			[
				note({ id: 1, date: '2099-12-12', body: 'Feriado' }),
				note({ id: 2, date: '2099-12-12', body: 'Viaja alguien' }),
				note({ id: 3, date: '2099-12-10', body: 'No reservar' })
			]
		);
		expect(
			agendaCsvRows(weeks).map((x) => ({ date: x.date, slug: x.row?.slug ?? null, notes: x.notes }))
		).toEqual([
			{ date: '2099-12-10', slug: null, notes: 'No reservar' },
			{ date: '2099-12-12', slug: 'a', notes: 'Feriado · Viaja alguien' },
			{ date: '2099-12-12', slug: 'b', notes: 'Feriado · Viaja alguien' }
		]);
	});
});
