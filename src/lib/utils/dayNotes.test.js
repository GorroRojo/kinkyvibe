import { describe, expect, it } from 'vitest';
import {
	DAY_NOTE_COLORS,
	DAY_NOTE_MAX,
	DEFAULT_DAY_NOTE_COLOR,
	cleanDayNoteText,
	dayNoteColor,
	dayNoteEvent,
	dayNoteStyles,
	noteIdFromEventId,
	notesByDate,
	removeDayNote,
	upsertDayNote,
	validateDayNote
} from './dayNotes.js';

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

describe('paleta', () => {
	it('tiene entre 5 y 6 colores con id único y el de por defecto adentro', () => {
		expect(DAY_NOTE_COLORS.length).toBeGreaterThanOrEqual(5);
		expect(DAY_NOTE_COLORS.length).toBeLessThanOrEqual(6);
		const ids = DAY_NOTE_COLORS.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain(DEFAULT_DAY_NOTE_COLOR);
	});

	it('un color desconocido cae en el de por defecto', () => {
		expect(dayNoteColor('rosa')).toBe('rosa');
		expect(dayNoteColor('fucsia-chillón')).toBe(DEFAULT_DAY_NOTE_COLOR);
		expect(dayNoteColor(null)).toBe(DEFAULT_DAY_NOTE_COLOR);
	});

	it('cada color usa tokens del panel (anda en claro y oscuro)', () => {
		expect(dayNoteStyles('rosa')).toEqual(['--tone: var(--bad)', '--tone-bg: var(--bad-bg)']);
		expect(dayNoteStyles('gris')).toEqual(['--tone: var(--muted)', '--tone-bg: var(--surface-2)']);
		for (const c of DAY_NOTE_COLORS) {
			for (const s of dayNoteStyles(c.id)) expect(s).toMatch(/^--tone(-bg)?: var\(--[a-z0-9-]+\)$/);
		}
	});
});

describe('validateDayNote', () => {
	it('acepta una nota válida y limpia el texto', () => {
		expect(
			validateDayNote({ date: '2099-12-12', body: '  no   reservar\nel lugar ', color: 'verde' })
		).toEqual({
			ok: true,
			value: { date: '2099-12-12', body: 'no reservar el lugar', color: 'verde' }
		});
	});

	it('marca cada campo que falta o está mal', () => {
		const r = validateDayNote({ date: '2099-02-30', body: '   ', color: 'naranja' });
		expect(r).toEqual({
			ok: false,
			errors: {
				date: 'Elegí un día.',
				body: 'Escribí la nota.',
				color: 'Elegí un color de la lista.'
			}
		});
	});

	it('corta en DAY_NOTE_MAX caracteres', () => {
		expect(
			validateDayNote({ date: '2099-12-12', body: 'a'.repeat(DAY_NOTE_MAX), color: 'gris' }).ok
		).toBe(true);
		const r = validateDayNote({
			date: '2099-12-12',
			body: 'a'.repeat(DAY_NOTE_MAX + 1),
			color: 'gris'
		});
		expect(r.ok).toBe(false);
	});

	it('saca caracteres de control', () => {
		expect(cleanDayNoteText('viaja\u0000 gorrite\u0007')).toBe('viaja gorrite');
	});
});

describe('lista de notas', () => {
	const a = note({ id: 3, date: '2099-12-13' });
	const b = note({ id: 1, date: '2099-12-12' });
	const c = note({ id: 2, date: '2099-12-12', body: 'Viaja alguien' });

	it('notesByDate agrupa por día, la más vieja primero', () => {
		expect(notesByDate([a, c, b])).toEqual({ '2099-12-12': [b, c], '2099-12-13': [a] });
	});

	it('upsertDayNote agrega o reemplaza y deja ordenado', () => {
		expect(upsertDayNote([a, b], c)).toEqual([b, c, a]);
		const changed = { ...b, body: 'Cambiada', date: '2099-12-14' };
		expect(upsertDayNote([b, c, a], changed)).toEqual([c, a, changed]);
	});

	it('removeDayNote saca por id', () => {
		expect(removeDayNote([a, b, c], 1)).toEqual([a, c]);
	});
});

describe('notas en el calendario', () => {
	it('una nota es un evento de todo el día, que no se arrastra, con su color', () => {
		const ev = dayNoteEvent(note({ id: 7, color: 'violeta' }));
		expect(ev).toMatchObject({
			id: 'nota:7',
			title: 'Feriado',
			start: '2099-12-12',
			end: '2099-12-13',
			allDay: true,
			startEditable: false,
			durationEditable: false,
			styles: ['--tone: var(--info)', '--tone-bg: var(--info-bg)'],
			extendedProps: { note: true, pending: false }
		});
		expect(ev.classNames).toContain('kv-nota');
	});

	it('noteIdFromEventId distingue notas de eventos', () => {
		expect(noteIdFromEventId('nota:7')).toBe(7);
		expect(noteIdFromEventId('fiesta-de-prueba')).toBeNull();
		expect(noteIdFromEventId('nota:abc')).toBeNull();
		expect(noteIdFromEventId('nota:0')).toBeNull();
	});
});
