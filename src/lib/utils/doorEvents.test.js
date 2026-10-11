import { describe, expect, it } from 'vitest';
import { defaultDoorSlug, doorEventWhen } from './doorEvents.js';

const at = (/** @type {string} */ iso) => Date.parse(iso);
const hoy = {
	slug: 'fiesta-inventada',
	title: 'Fiesta inventada',
	start: at('2031-01-10T23:00:00-03:00'),
	today: true
};
const otroHoy = {
	slug: 'taller-inventado',
	title: 'Taller inventado',
	start: at('2031-01-10T19:00:00-03:00'),
	today: true
};
const sabado = {
	slug: 'feria-inventada',
	title: 'Feria inventada',
	start: at('2031-01-11T21:30:00-03:00'),
	today: false
};

describe('defaultDoorSlug', () => {
	it('un solo evento hoy: queda elegido', () => {
		expect(defaultDoorSlug([hoy, sabado])).toBe('fiesta-inventada');
	});

	it('varios hoy o ninguno: ninguno elegido', () => {
		expect(defaultDoorSlug([otroHoy, hoy, sabado])).toBe('');
		expect(defaultDoorSlug([sabado])).toBe('');
		expect(defaultDoorSlug([])).toBe('');
	});

	it('?evento= gana siempre, aunque no esté en la lista', () => {
		expect(defaultDoorSlug([hoy], 'feria-inventada')).toBe('feria-inventada');
		expect(defaultDoorSlug([], 'evento-privado-inventado')).toBe('evento-privado-inventado');
	});
});

describe('doorEventWhen', () => {
	it('hoy: «Hoy» y la hora de Argentina', () => {
		expect(doorEventWhen(hoy)).toBe('Hoy 23:00');
	});

	it('otro día: el día de la semana, la fecha y la hora', () => {
		const text = doorEventWhen(sabado);
		expect(text).toContain('11/1');
		expect(text).toMatch(/s[aá]b/);
		expect(text.endsWith('21:30')).toBe(true);
	});

	it('una fecha que no se lee: vacío', () => {
		expect(doorEventWhen({ ...hoy, start: Number.NaN })).toBe('');
	});
});
