import { describe, expect, it } from 'vitest';
import {
	agendaRowFromMeta,
	agendaSchedule,
	applyAgendaChange,
	changedAgendaFields,
	readAgendaValues,
	replacePlaceTag,
	validateAgendaRow
} from './agenda.js';
import { eventTagGroups } from './adminTags.js';

const PLACES = eventTagGroups().places;

const RAW = `---
title: 'Evento de ejemplo'
tags:
  - español
  - KinkyVibe # etiqueta especial #
  - pago # pago | gratis | a la gorra #
  - AMBA # online | AMBA | Córdoba #
  - fiesta
category: calendario
status: abierto # anunciado | abierto | agotadas | cancelado #
start: 2026-12-12T21:00-03:00
end: 2026-12-13T02:00-03:00
location_name: Lugar de prueba
---
## Texto

No se toca.
`;

/** @param {string} raw */
const row = (raw) => {
	const r = agendaRowFromMeta('ejemplo', {
		title: 'Evento de ejemplo',
		start: '2026-12-12T21:00-03:00',
		end: '2026-12-13T02:00-03:00',
		location_name: 'Lugar de prueba',
		tags: ['español', 'KinkyVibe', 'pago', 'AMBA', 'fiesta'],
		status: 'abierto'
	});
	return raw ? r : r;
};

/** @param {ReturnType<typeof row>} r */
const values = (r) => ({
	date: r.date,
	startTime: r.startTime,
	endTime: r.endTime,
	title: r.title,
	locationName: r.locationName,
	place: r.place,
	state: r.state
});

describe('agendaRowFromMeta', () => {
	it('arma la fila con fecha, horas, región y estado', () => {
		expect(row('x')).toEqual({
			slug: 'ejemplo',
			title: 'Evento de ejemplo',
			date: '2026-12-12',
			startTime: '21:00',
			endTime: '02:00',
			endDays: 1,
			locationName: 'Lugar de prueba',
			place: 'AMBA',
			state: 'publicado',
			status: 'abierto'
		});
	});

	it('estado: cancelado gana a no listado', () => {
		expect(agendaRowFromMeta('a', { status: 'cancelado', force_unlisted: true }).state).toBe(
			'cancelado'
		);
		expect(agendaRowFromMeta('a', { status: 'abierto', force_unlisted: true }).state).toBe(
			'no-listado'
		);
	});
});

describe('agendaSchedule', () => {
	it('termina al día siguiente si la hora de fin no es posterior', () => {
		expect(agendaSchedule({ date: '2026-12-12', startTime: '21:00', endTime: '02:00' })).toEqual({
			start: '2026-12-12T21:00-03:00',
			end: '2026-12-13T02:00-03:00'
		});
		expect(agendaSchedule({ date: '2026-12-12', startTime: '15:00', endTime: '19:00' }).end).toBe(
			'2026-12-12T19:00-03:00'
		);
		expect(agendaSchedule({ date: '2026-12-12', startTime: '15:00', endTime: '' }).end).toBe('');
	});

	it('los eventos de varios días conservan la cantidad de días', () => {
		expect(
			agendaSchedule({ date: '2026-12-12', startTime: '10:00', endTime: '18:00', endDays: 2 }).end
		).toBe('2026-12-14T18:00-03:00');
	});
});

describe('validateAgendaRow', () => {
	const ok = values(row('x'));

	it('una fila bien no tiene errores', () => {
		expect(validateAgendaRow(ok, { places: PLACES })).toEqual({});
	});

	it('marca cada campo mal', () => {
		const errors = validateAgendaRow(
			{
				date: '2026-02-30',
				startTime: '25:00',
				endTime: '9:5',
				title: ' ',
				locationName: 'x'.repeat(201),
				place: 'Marte',
				// @ts-expect-error estado inválido a propósito
				state: 'borrado'
			},
			{ places: PLACES }
		);
		expect(Object.keys(errors).sort()).toEqual(
			['date', 'endTime', 'locationName', 'place', 'startTime', 'state', 'title'].sort()
		);
	});

	it('título en una línea y con largo máximo', () => {
		expect(validateAgendaRow({ ...ok, title: 'a\nb' }, { places: PLACES }).title).toMatch(/línea/);
		expect(validateAgendaRow({ ...ok, title: 'a'.repeat(201) }, { places: PLACES }).title).toMatch(
			/200/
		);
	});

	it('la región vacía solo se acepta si el evento ya no tenía', () => {
		expect(validateAgendaRow({ ...ok, place: '' }, { places: PLACES }).place).toBeTruthy();
		expect(
			validateAgendaRow({ ...ok, place: '' }, { places: PLACES, allowEmptyPlace: true }).place
		).toBeUndefined();
	});

	it('un evento de varios días que termina antes de empezar es un error', () => {
		// Con endDays 0 y fin <= inicio, pasa al día siguiente (válido); con fin igual a inicio el
		// mismo día no se puede, así que se prueba con un final explícitamente anterior.
		expect(
			validateAgendaRow({ ...ok, startTime: '10:00', endTime: '10:00' }, { places: PLACES })
		).toEqual({});
	});
});

describe('readAgendaValues / changedAgendaFields', () => {
	it('recorta y detecta los cambios', () => {
		const a = values(row('x'));
		const b = readAgendaValues({ ...a, title: '  Otro título ', extra: 'no' });
		expect(b.title).toBe('Otro título');
		expect(b).not.toHaveProperty('extra');
		expect(changedAgendaFields(a, b)).toEqual(['title']);
	});
});

describe('replacePlaceTag', () => {
	it('reemplaza la región en su lugar y deja las demás etiquetas', () => {
		expect(replacePlaceTag(['español', 'AMBA', 'fiesta'], 'Córdoba')).toEqual([
			'español',
			'Córdoba',
			'fiesta'
		]);
		expect(replacePlaceTag(['español', 'fiesta'], 'AMBA')).toEqual(['español', 'fiesta', 'AMBA']);
		expect(replacePlaceTag(['online', 'AMBA', 'x'], 'Córdoba')).toEqual(['Córdoba', 'x']);
	});
});

describe('applyAgendaChange', () => {
	const before = values(row('x'));

	it('cambia solo los campos editados y conserva comentarios y texto', () => {
		const r = applyAgendaChange(RAW, {
			before,
			after: { ...before, date: '2026-12-19', title: 'Evento nuevo', place: 'Córdoba' }
		});
		expect(r.conflicts).toEqual([]);
		expect(r.changed.sort()).toEqual(['date', 'place', 'title']);
		expect(r.content).toContain("title: 'Evento nuevo'");
		expect(r.content).toContain('start: 2026-12-19T21:00-03:00');
		// Termina al día siguiente del nuevo día.
		expect(r.content).toContain('end: 2026-12-20T02:00-03:00');
		expect(r.content).toContain('  - Córdoba\n');
		expect(r.content).not.toContain('- AMBA');
		expect(r.content).toContain('status: abierto # anunciado | abierto | agotadas | cancelado #');
		expect(r.content).toContain('## Texto\n\nNo se toca.\n');
	});

	it('sin hora de fin, comenta `end`', () => {
		const r = applyAgendaChange(RAW, { before, after: { ...before, endTime: '' } });
		expect(r.content).toContain('#end: 2026-12-13T02:00-03:00');
	});

	it('estados: no listado, cancelado y de vuelta a publicado', () => {
		const unlisted = applyAgendaChange(RAW, { before, after: { ...before, state: 'no-listado' } });
		expect(unlisted.content).toContain('force_unlisted: true');

		const cancelled = applyAgendaChange(RAW, { before, after: { ...before, state: 'cancelado' } });
		expect(cancelled.content).toMatch(/^status: cancelado/m);

		const back = applyAgendaChange(unlisted.content, {
			before: { ...before, state: 'no-listado' },
			after: { ...before, state: 'publicado' }
		});
		expect(back.content).not.toContain('force_unlisted');

		const uncancel = applyAgendaChange(cancelled.content, {
			before: { ...before, state: 'cancelado' },
			after: { ...before, state: 'publicado' }
		});
		expect(uncancel.content).toMatch(/^status: anunciado/m);
	});

	it('conflicto si alguien cambió el mismo campo mientras tanto', () => {
		const changed = RAW.replace("title: 'Evento de ejemplo'", "title: 'Lo cambió otra persona'");
		const r = applyAgendaChange(changed, { before, after: { ...before, title: 'Mi cambio' } });
		expect(r.conflicts).toEqual(['title']);
		expect(r.content).toBe(changed);
		expect(r.current.title).toBe('Lo cambió otra persona');
	});

	it('otros campos cambiados por otra persona no molestan', () => {
		const changed = RAW.replace('location_name: Lugar de prueba', 'location_name: Otro lugar');
		const r = applyAgendaChange(changed, { before, after: { ...before, title: 'Mi cambio' } });
		expect(r.conflicts).toEqual([]);
		expect(r.content).toContain('location_name: Otro lugar');
		expect(r.content).toContain("title: 'Mi cambio'");
	});

	it('si el archivo ya tiene el valor nuevo, no hay nada que cambiar', () => {
		const r = applyAgendaChange(RAW, { before: { ...before, title: 'Viejo' }, after: before });
		expect(r.conflicts).toEqual([]);
		expect(r.changed).toEqual([]);
		expect(r.content).toBe(RAW);
	});
});
