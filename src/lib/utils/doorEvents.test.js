import { describe, expect, it } from 'vitest';
import {
	CHECKIN_LIST_PARAM,
	checkinAutoSlug,
	defaultDoorSlug,
	doorEventWhen,
	onlyTodaySlug
} from './doorEvents.js';

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

describe('onlyTodaySlug', () => {
	it('exactamente uno: ese; ninguno o varios: ninguno', () => {
		expect(onlyTodaySlug([hoy])).toBe('fiesta-inventada');
		expect(onlyTodaySlug([])).toBe('');
		expect(onlyTodaySlug([hoy, otroHoy])).toBe('');
	});
});

describe('checkinAutoSlug (la Puerta del panel entra directo al evento de hoy)', () => {
	const none = new URLSearchParams();
	it('un solo evento hoy: entra a ese', () => {
		expect(checkinAutoSlug([hoy], none)).toBe('fiesta-inventada');
	});

	it('ninguno o varios hoy: muestra la lista', () => {
		expect(checkinAutoSlug([], none)).toBe('');
		expect(checkinAutoSlug([hoy, otroHoy], none)).toBe('');
	});

	it('con ?lista («Otro evento») muestra la lista aunque haya uno solo', () => {
		expect(checkinAutoSlug([hoy], new URLSearchParams(CHECKIN_LIST_PARAM))).toBe('');
		expect(checkinAutoSlug([hoy], new URLSearchParams(`${CHECKIN_LIST_PARAM}=1`))).toBe('');
	});
});

describe('doorEventWhen', () => {
	it('hoy: «Hoy» y la hora de Argentina', () => {
		expect(doorEventWhen(hoy)).toBe('Hoy 23:00');
	});

	it('otro día: como en las listas del sitio', () => {
		expect(doorEventWhen(sabado, at('2031-01-10T12:00:00-03:00'))).toBe('sáb 11 ene · 21:30');
	});

	it('una fecha que no se lee: vacío', () => {
		expect(doorEventWhen({ ...hoy, start: Number.NaN })).toBe('');
	});
});
