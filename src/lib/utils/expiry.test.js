/**
 * «Vence en…» con la hora exacta: duraciones, la hora en una zona fija (con el reloj fijo) y el
 * texto de los mails.
 */
import { describe, expect, it } from 'vitest';
import {
	ARGENTINA_TIME_NOTE,
	clockTime,
	durationText,
	expiresInText,
	expiryLabel,
	expiryMoment
} from './expiry.js';

// Viernes 2 de octubre de 2026, 14:25 en Argentina (17:25 UTC).
const NOW = Date.UTC(2026, 9, 2, 17, 25);
const MIN = 60_000;
const AR = { timeZone: 'America/Argentina/Buenos_Aires' };

describe('durationText', () => {
	it('minutos hasta 2 horas, después horas', () => {
		expect(durationText(10 * MIN)).toBe('10 minutos');
		expect(durationText(1 * MIN)).toBe('1 minuto');
		expect(durationText(20_000)).toBe('1 minuto');
		expect(durationText(90 * MIN)).toBe('90 minutos');
		expect(durationText(120 * MIN)).toBe('2 horas');
		expect(durationText(60 * MIN * 48)).toBe('48 horas');
	});
});

describe('clockTime y expiryMoment', () => {
	it('la hora en Argentina, cualquiera sea la zona del entorno', () => {
		expect(clockTime(NOW + 10 * MIN, AR)).toBe('14:35');
		expect(expiryMoment(NOW + 10 * MIN, NOW, AR)).toBe('a las 14:35');
	});

	it('en otra zona, la hora de esa zona (lo que hace el navegador con la suya)', () => {
		expect(clockTime(NOW + 10 * MIN, { timeZone: 'Europe/Madrid' })).toBe('19:35');
		expect(expiryMoment(NOW + 10 * MIN, NOW, { timeZone: 'America/Mexico_City' })).toBe(
			'a las 11:35'
		);
	});

	it('Uruguay tiene la misma hora que Argentina', () => {
		expect(clockTime(NOW, { timeZone: 'America/Montevideo' })).toBe(clockTime(NOW, AR));
	});

	it('otro día: con el día', () => {
		// 23:58 en Argentina + 10 minutos = 00:08 del sábado.
		const late = Date.UTC(2026, 9, 3, 2, 58);
		expect(expiryMoment(late + 10 * MIN, late, AR)).toBe('el sábado 3 de octubre a las 00:08');
		expect(expiryMoment(NOW + 48 * 60 * MIN, NOW, AR)).toBe('el domingo 4 de octubre a las 14:25');
		// En Madrid ya es sábado a esa hora: mismo día.
		expect(expiryMoment(late + 10 * MIN, late, { timeZone: 'Europe/Madrid' })).toBe('a las 05:08');
	});

	it('«hasta…», para las reservas', () => {
		expect(expiryMoment(NOW + 10 * MIN, NOW, { ...AR, until: true })).toBe('hasta las 14:35');
		expect(expiryMoment(NOW + 48 * 60 * MIN, NOW, { ...AR, until: true })).toBe(
			'hasta el domingo 4 de octubre a las 14:25'
		);
	});

	it('sin zona, la del entorno', () => {
		const local = new Intl.DateTimeFormat('es-AR', {
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).format(new Date(NOW));
		expect(clockTime(NOW)).toBe(local);
	});
});

describe('expiryLabel (páginas)', () => {
	it('en el servidor, la hora de Argentina con la aclaración', () => {
		expect(expiryLabel(NOW + 10 * MIN, NOW, { local: false })).toBe(
			'a las 14:35, hora de Argentina y Uruguay'
		);
		expect(expiryLabel(NOW + 48 * 60 * MIN, NOW, { local: false, until: true })).toBe(
			'hasta el domingo 4 de octubre a las 14:25, hora de Argentina y Uruguay'
		);
	});

	it('en el navegador, la hora local sin aclarar', () => {
		expect(expiryLabel(NOW + 10 * MIN, NOW, { local: true })).toBe(
			expiryMoment(NOW + 10 * MIN, NOW)
		);
		expect(expiryLabel(NOW + 10 * MIN, NOW, { local: true })).not.toContain('Argentina');
	});
});

describe('expiresInText (mails)', () => {
	it('con la hora de Argentina y la aclaración', () => {
		expect(expiresInText(NOW + 10 * MIN, NOW)).toBe(
			`Vence en 10 minutos (a las 14:35, ${ARGENTINA_TIME_NOTE})`
		);
		expect(ARGENTINA_TIME_NOTE).toBe('hora de Argentina y Uruguay');
		expect(expiresInText(NOW + 48 * 60 * MIN, NOW, { lowercase: true })).toBe(
			'vence en 48 horas (el domingo 4 de octubre a las 14:25, hora de Argentina y Uruguay)'
		);
	});
});
