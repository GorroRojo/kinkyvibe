import { describe, expect, it } from 'vitest';
import {
	applyNewEventPrefill,
	calendarEvent,
	calendarEvents,
	draftRows,
	defaultCalendarView,
	dragSnapDuration,
	dropTarget,
	eventTone,
	isDraftRow,
	localDateParts,
	movedAgendaValues,
	newEventHref,
	newEventQuestion,
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
			end: '2026-12-12T23:59',
			allDay: false,
			startEditable: true,
			durationEditable: false,
			classNames: ['kv-ev', 'kv-ev-ok'],
			extendedProps: {
				slug: 'fiesta-de-prueba',
				tone: 'ok',
				time: '21:00 – 02:00',
				problem: null,
				pending: false
			}
		});
	});

	it('termina el mismo día si la hora de fin es posterior', () => {
		const e = calendarEvent(row({ end: '2026-12-12T23:30-03:00' }), { places: PLACES });
		expect(e.end).toBe('2026-12-12T23:30');
	});

	it('lo que termina a la madrugada se dibuja en su día; más tarde, ocupa los dos', () => {
		const late = calendarEvent(row({ end: '2026-12-13T09:00-03:00' }), { places: PLACES });
		expect(late.end).toBe('2026-12-12T23:59');
		const morning = calendarEvent(row({ end: '2026-12-13T10:00-03:00' }), { places: PLACES });
		expect(morning.end).toBe('2026-12-13T10:00');
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

	it('una fila movida sin guardar se marca como pendiente (y se puede volver a arrastrar)', () => {
		const e = calendarEvent({ ...row(), pending: true }, { places: PLACES });
		expect(e.classNames).toEqual(['kv-ev', 'kv-ev-ok', 'kv-ev-pendiente']);
		expect(e.extendedProps.pending).toBe(true);
		expect(e.startEditable).toBe(true);
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

describe('dropTarget', () => {
	const from = { date: '2026-12-12', time: '21:00' };

	it('en la vista semana cambia solo el día: la hora de la franja donde lo sueltan no cuenta', () => {
		expect(dropTarget('timeGridWeek', from, { date: '2026-12-15', time: '09:00' })).toEqual({
			date: '2026-12-15'
		});
		// soltado en "Todo el día" (la librería lo da a las 00:00)
		expect(dropTarget('timeGridWeek', from, { date: '2026-12-14', time: '00:00' })).toEqual({
			date: '2026-12-14'
		});
	});

	it('en la vista semana, soltarlo en el mismo día (aunque sea otra hora) no cambia nada', () => {
		expect(dropTarget('timeGridWeek', from, { date: '2026-12-12', time: '18:00' })).toBeNull();
		expect(dropTarget('timeGridWeek', from, from)).toBeNull();
	});

	it('en el mes queda como antes: día y hora tal cual los da la librería', () => {
		expect(dropTarget('dayGridMonth', from, { date: '2026-12-19', time: '21:00' })).toEqual({
			date: '2026-12-19',
			time: '21:00'
		});
		expect(dropTarget('dayGridMonth', from, from)).toBeNull();
	});

	it('soltado en otra franja de la semana, la fila conserva sus horas de inicio y fin', () => {
		const to = dropTarget('timeGridWeek', from, { date: '2026-12-16', time: '10:00' });
		expect(to).not.toBeNull();
		expect(movedAgendaValues(row(), /** @type {{ date: string }} */ (to))).toMatchObject({
			date: '2026-12-16',
			startTime: '21:00',
			endTime: '02:00'
		});
	});
});

describe('dragSnapDuration', () => {
	it('en la vista semana el arrastre va de a un día entero (la vista previa no cambia de hora)', () => {
		expect(dragSnapDuration('timeGridWeek')).toBe('24:00');
	});

	it('en el mes y la lista queda el paso de siempre', () => {
		expect(dragSnapDuration('dayGridMonth')).toBeUndefined();
		expect(dragSnapDuration('listMonth')).toBeUndefined();
	});

	it('lo que se ve al arrastrar en la semana es lo que queda al soltar (y lo que lista el aviso)', () => {
		// Con el paso de un día, la vista previa queda en el día de destino a la misma hora.
		const from = { date: '2026-12-12', time: '21:00' };
		const preview = { date: '2026-12-15', time: from.time };
		const to = dropTarget('timeGridWeek', from, preview);
		expect(to).toEqual({ date: '2026-12-15' });
		expect(movedAgendaValues(row(), /** @type {{ date: string }} */ (to))).toMatchObject({
			date: preview.date,
			startTime: preview.time
		});
	});
});

describe('newEventQuestion', () => {
	it('pregunta con el día escrito', () => {
		expect(newEventQuestion({ date: '2026-12-12' })).toBe(
			'¿Cargar un evento el sábado 12 de diciembre de 2026?'
		);
	});

	it('con la hora si eligieron una (rango en la vista semana)', () => {
		expect(newEventQuestion({ date: '2026-12-12', startTime: '20:00' })).toBe(
			'¿Cargar un evento el sábado 12 de diciembre de 2026 a las 20:00?'
		);
		expect(newEventQuestion({ date: '2026-12-12', startTime: '8pm' })).toBe(
			'¿Cargar un evento el sábado 12 de diciembre de 2026?'
		);
	});

	it('sin un día válido, una pregunta genérica', () => {
		expect(newEventQuestion({ date: 'mañana' })).toBe('¿Cargar un evento nuevo?');
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

describe('duplicar en el día elegido (desde + fecha)', () => {
	it('el link lleva el evento a duplicar y el día', () => {
		expect(newEventHref({ date: '2026-12-12', from: 'picantearla-2026-11' })).toBe(
			'/admin/eventos/nuevo?desde=picantearla-2026-11&fecha=2026-12-12'
		);
		expect(newEventHref({ from: 'picantearla-2026-11' })).toBe(
			'/admin/eventos/nuevo?desde=picantearla-2026-11'
		);
		// un slug inválido no va
		expect(newEventHref({ date: '2026-12-12', from: '../x' })).toBe(
			'/admin/eventos/nuevo?fecha=2026-12-12'
		);
	});

	const copy = {
		startDate: '',
		startTime: '21:00',
		endDate: '',
		endTime: '02:00',
		hasEnd: true,
		title: 'Fiesta'
	};

	it('el día elegido manda y se conservan las horas del original (y que termina al día siguiente)', () => {
		const r = applyNewEventPrefill(copy, 1, { date: '2026-12-12', startTime: '', endTime: '' });
		expect(r.values).toMatchObject({
			startDate: '2026-12-12',
			startTime: '21:00',
			endDate: '2026-12-13',
			endTime: '02:00',
			hasEnd: true,
			title: 'Fiesta'
		});
		expect(r.span).toBe(1);
		// no cambia el formulario original
		expect(copy.startDate).toBe('');
	});

	it('con horas elegidas (rango de la semana), van esas y se recalcula el día de fin', () => {
		const r = applyNewEventPrefill(copy, 1, {
			date: '2026-12-12',
			startTime: '18:00',
			endTime: '20:00'
		});
		expect(r.values).toMatchObject({
			startDate: '2026-12-12',
			startTime: '18:00',
			endTime: '20:00',
			endDate: '2026-12-12'
		});
		expect(r.span).toBe(0);
	});

	it('solo la hora de inicio: conserva el fin del original y ve si cruza la medianoche', () => {
		const sameDay = { ...copy, startTime: '20:00', endTime: '23:00' };
		const r = applyNewEventPrefill(sameDay, 0, {
			date: '2026-12-12',
			startTime: '23:30',
			endTime: ''
		});
		expect(r.values).toMatchObject({ startTime: '23:30', endTime: '23:00', endDate: '2026-12-13' });
		expect(r.span).toBe(1);
	});

	it('los eventos de varios días conservan sus días', () => {
		const retreat = { ...copy, startTime: '10:00', endTime: '18:00' };
		const r = applyNewEventPrefill(retreat, 2, {
			date: '2026-12-12',
			startTime: '11:00',
			endTime: '17:00'
		});
		expect(r.values.endDate).toBe('2026-12-14');
		expect(r.span).toBe(2);
	});

	it('sin día no toca nada', () => {
		const r = applyNewEventPrefill(copy, 1, { date: '', startTime: '', endTime: '' });
		expect(r.values).toEqual(copy);
		expect(r.span).toBe(1);
	});
});

describe('borradores en el calendario', () => {
	it('un borrador lleva «draft» y lo que le falta', () => {
		const draft = {
			...row({ force_unlisted: true }),
			draft: true,
			missing: [{ label: 'Imagen' }, { label: 'Precio' }]
		};
		const e = calendarEvent(draft, { places: PLACES });
		expect(e.extendedProps).toMatchObject({ draft: true, missing: ['Imagen', 'Precio'] });
	});

	it('uno publicado no', () => {
		const e = calendarEvent({ ...row(), missing: [{ label: 'Imagen' }] }, { places: PLACES });
		expect(e.extendedProps.draft).toBeUndefined();
		expect(e.extendedProps.missing).toBeUndefined();
	});

	it('un no listado a propósito (sin la marca de borrador) no es borrador', () => {
		const e = calendarEvent(
			{ ...row({ force_unlisted: true }), missing: [{ label: 'Imagen' }] },
			{ places: PLACES }
		);
		expect(e.extendedProps.draft).toBeUndefined();
		expect(isDraftRow({ ...row({ force_unlisted: true }), draft: true })).toBe(true);
		expect(isDraftRow({ ...row({ force_unlisted: true }) })).toBe(false);
		// confirmado (publicado) aunque la fila todavía diga draft
		expect(isDraftRow({ ...row(), draft: true })).toBe(false);
	});

	it('filtro «a confirmar»: solo los borradores (marca + no listado)', () => {
		const rows = [
			row(),
			{ ...row({ force_unlisted: true }), slug: 'borrador', draft: true },
			{ ...row({ force_unlisted: true }), slug: 'privado' },
			{ ...row({ status: 'cancelado' }), slug: 'cancelado', draft: true }
		];
		expect(draftRows(rows, true).map((r) => r.slug)).toEqual(['borrador']);
		expect(draftRows(rows, false)).toHaveLength(4);
	});
});
