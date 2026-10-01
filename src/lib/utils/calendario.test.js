import { describe, expect, it } from 'vitest';
import {
	calendarEvent,
	calendarEvents,
	defaultCalendarView,
	eventTone,
	localDateParts,
	movedAgendaValues,
	newEventHref,
	parseCalendarView,
	readNewEventPrefill,
	rescheduleProblem
} from './calendario.js';
import { agendaRowFromMeta, validateAgendaRow } from './agenda.js';
import { eventTagGroups } from './adminTags.js';

const PLACES = eventTagGroups().places;

/** @param {Record<string, unknown>} [meta] */
const row = (meta = {}) =>
	agendaRowFromMeta('fiesta-de-prueba', {
		title: 'Fiesta de prueba',
		start: '2026-12-12T21:00-03:00',
		end: '2026-12-13T02:00-03:00',
		location_name: 'Lugar de prueba',
		tags: ['español', 'AMBA', 'fiesta'],
		status: 'abierto',
		...meta
	});

describe('vistas', () => {
	it('lista en el celu (≤ 640 px), mes en desktop', () => {
		expect(defaultCalendarView(390)).toBe('lista');
		expect(defaultCalendarView(640)).toBe('lista');
		expect(defaultCalendarView(641)).toBe('mes');
		expect(defaultCalendarView(1280)).toBe('mes');
	});

	it('una vista guardada inválida vuelve a la de por defecto', () => {
		expect(parseCalendarView('semana', 'mes')).toBe('semana');
		expect(parseCalendarView('planilla', 'mes')).toBe('planilla');
		expect(parseCalendarView('dayGridMonth', 'lista')).toBe('lista');
		expect(parseCalendarView(null, 'mes')).toBe('mes');
	});
});

describe('calendarEvent', () => {
	it('arma el evento con fechas sin zona, en hora de Argentina', () => {
		expect(calendarEvent(row(), { places: PLACES })).toEqual({
			id: 'fiesta-de-prueba',
			title: 'Fiesta de prueba',
			start: '2026-12-12T21:00',
			end: '2026-12-13T02:00',
			allDay: false,
			startEditable: true,
			durationEditable: false,
			classNames: ['kv-ev', 'kv-ev-ok'],
			extendedProps: {
				slug: 'fiesta-de-prueba',
				tone: 'ok',
				time: '21:00 – 02:00',
				problem: null
			}
		});
	});

	it('termina el mismo día si la hora de fin es posterior', () => {
		const e = calendarEvent(row({ end: '2026-12-12T23:30-03:00' }), { places: PLACES });
		expect(e.end).toBe('2026-12-12T23:30');
	});

	it('los eventos de varios días conservan sus días', () => {
		const e = calendarEvent(row({ end: '2026-12-14T18:00-03:00' }), { places: PLACES });
		expect(e.end).toBe('2026-12-14T18:00');
	});

	it('sin hora de fin dura una hora (solo para dibujarlo), también cerca de medianoche', () => {
		expect(calendarEvent(row({ end: '' }), { places: PLACES })).toMatchObject({
			end: '2026-12-12T22:00',
			extendedProps: { time: '21:00' }
		});
		const late = calendarEvent(row({ start: '2026-12-12T23:30-03:00', end: '' }), {
			places: PLACES
		});
		expect(late.end).toBe('2026-12-13T00:30');
	});

	it('sin hora es de día entero y no se puede arrastrar', () => {
		const e = calendarEvent(row({ start: '2026-12-12', end: '' }), { places: PLACES });
		expect(e).toMatchObject({ start: '2026-12-12', end: '2026-12-13', allDay: true });
		expect(e.startEditable).toBe(false);
		expect(e.extendedProps.problem).toMatch(/hora de inicio/);
	});

	it('cancelado y borrador tienen su color', () => {
		const cancelled = calendarEvent(row({ status: 'cancelado' }), { places: PLACES });
		expect(cancelled.classNames).toEqual(['kv-ev', 'kv-ev-bad', 'kv-ev-cancelado']);
		const draft = calendarEvent(row({ force_unlisted: true }), { places: PLACES });
		expect(draft.classNames).toEqual(['kv-ev', 'kv-ev-warn']);
	});

	it('sin permiso no se puede arrastrar', () => {
		const e = calendarEvent(row(), { places: PLACES, canEdit: false });
		expect(e.startEditable).toBe(false);
		expect(e.extendedProps.problem).toMatch(/permiso/);
	});

	it('una fila con una región que ya no existe no se ofrece para arrastrar', () => {
		const r = { ...row(), place: 'Región que no existe' };
		expect(calendarEvent(r, { places: PLACES }).startEditable).toBe(false);
	});

	it('calendarEvents deja afuera las filas sin fecha', () => {
		const rows = [row(), { ...row(), slug: 'sin-fecha', date: '' }];
		expect(calendarEvents(rows, { places: PLACES }).map((e) => e.id)).toEqual(['fiesta-de-prueba']);
	});
});

describe('eventTone', () => {
	it('sigue el estado de la planilla aunque el archivo diga otra cosa', () => {
		expect(eventTone({ state: 'publicado', status: 'anunciado' })).toBe('info');
		expect(eventTone({ state: 'cancelado', status: 'abierto' })).toBe('bad');
		expect(eventTone({ state: 'publicado', status: 'cancelado' })).toBe('info');
		expect(eventTone({ state: 'no-listado', status: 'abierto' })).toBe('warn');
		expect(eventTone({ state: 'publicado', status: '' })).toBe('neutral');
	});
});

describe('rescheduleProblem', () => {
	it('null si la fila pasa la validación de la planilla', () => {
		expect(rescheduleProblem(row(), PLACES)).toBeNull();
	});
	it('la región vacía se acepta (como en la planilla) si ya estaba vacía', () => {
		expect(rescheduleProblem({ ...row(), place: '' }, PLACES)).toBeNull();
	});
});

describe('movedAgendaValues', () => {
	it('en la vista mes cambia solo el día', () => {
		const r = row();
		expect(movedAgendaValues(r, { date: '2026-12-19', time: '21:00' })).toMatchObject({
			date: '2026-12-19',
			startTime: '21:00',
			endTime: '02:00',
			title: 'Fiesta de prueba',
			place: 'AMBA'
		});
	});

	it('en la vista semana corre las dos horas lo mismo (el evento dura lo mismo)', () => {
		const moved = movedAgendaValues(row(), { date: '2026-12-13', time: '22:30' });
		expect(moved).toMatchObject({ date: '2026-12-13', startTime: '22:30', endTime: '03:30' });
		const earlier = movedAgendaValues(row({ end: '2026-12-12T23:00-03:00' }), {
			date: '2026-12-12',
			time: '19:00'
		});
		expect(earlier.endTime).toBe('21:00');
	});

	it('sin hora de fin sigue sin hora de fin', () => {
		const moved = movedAgendaValues(row({ end: '' }), { date: '2026-12-20', time: '20:00' });
		expect(moved).toMatchObject({ startTime: '20:00', endTime: '' });
	});

	it('el resultado pasa la misma validación que la planilla', () => {
		const moved = movedAgendaValues(row(), { date: '2026-12-31', time: '23:45' });
		expect(validateAgendaRow(moved, { places: PLACES })).toEqual({});
	});

	it('una hora inválida deja la hora como estaba', () => {
		expect(movedAgendaValues(row(), { date: '2026-12-19', time: '25:00' }).startTime).toBe('21:00');
	});
});

describe('localDateParts', () => {
	it('lee día y hora locales del Date', () => {
		expect(localDateParts(new Date(2026, 11, 5, 9, 7))).toEqual({
			date: '2026-12-05',
			time: '09:07'
		});
	});
});

describe('evento nuevo con fecha', () => {
	it('arma el link con día y horas', () => {
		expect(newEventHref({ date: '2026-12-12' })).toBe('/admin/eventos/nuevo?fecha=2026-12-12');
		expect(newEventHref({ date: '2026-12-12', startTime: '20:00', endTime: '23:00' })).toBe(
			'/admin/eventos/nuevo?fecha=2026-12-12&hora=20%3A00&hasta=23%3A00'
		);
		expect(newEventHref({ date: 'mañana' })).toBe('/admin/eventos/nuevo');
	});

	it('lee el link y descarta lo inválido', () => {
		const read = (/** @type {string} */ q) => readNewEventPrefill(new URLSearchParams(q));
		expect(read('fecha=2026-12-12&hora=20:00&hasta=23:00')).toEqual({
			date: '2026-12-12',
			startTime: '20:00',
			endTime: '23:00'
		});
		expect(read('fecha=2026-02-30&hora=20:00')).toEqual({ date: '', startTime: '', endTime: '' });
		expect(read('fecha=2026-12-12&hora=8pm&hasta=23:00')).toEqual({
			date: '2026-12-12',
			startTime: '',
			endTime: ''
		});
		expect(read('')).toEqual({ date: '', startTime: '', endTime: '' });
	});
});
