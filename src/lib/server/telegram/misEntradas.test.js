/**
 * «🎟 Mis entradas» con un taller en varias partes y una sola entrada (docs/talleres-partes.md):
 * la entrada queda en «próximas» hasta la última parte y muestra la fecha de la parte que toca.
 * Antes de la parte 1, entre partes, después de la última y con una parte cancelada. Datos
 * inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	isPastTicket,
	ticketDate,
	ticketScreen,
	ticketsForView,
	ticketsScreen
} from './misEntradas.js';

/** @typedef {import('./tickets.js').BotTicket} BotTicket */

const ORIGIN = 'https://ejemplo.test';
const P1 = '2031-01-10T21:00:00-03:00';
const P2 = '2031-01-17T21:00:00-03:00';
const P3 = '2031-01-24T21:00:00-03:00';
/** @param {string} iso */
const at = (iso) => Date.parse(iso);
/** @param {string} iso */
const unix = (iso) => `unix="${Math.floor(Date.parse(iso) / 1000)}"`;

/** @type {BotTicket} */
const TALLER = {
	id: 'tk-taller',
	token: 'T'.repeat(43),
	code: 'TAL234',
	holder: 'Persona Inventada',
	pronouns: '',
	type: 'General',
	slug: 'taller-inventado',
	title: 'Taller inventado',
	start: P1,
	end: '2031-01-10T23:00:00-03:00',
	online: false,
	checkedInAt: null,
	parts: [
		{ n: 1, start: P1, end: '2031-01-10T23:00:00-03:00', cancelled: false },
		{ n: 2, start: P2, end: '2031-01-17T23:00:00-03:00', cancelled: false },
		{ n: 3, start: P3, end: '2031-01-24T23:00:00-03:00', cancelled: false }
	]
};

/** @type {BotTicket} */
const SUELTO = {
	...TALLER,
	id: 'tk-suelto',
	token: 'S'.repeat(43),
	code: 'SUE234',
	slug: 'fiesta-inventada',
	title: 'Fiesta inventada',
	start: '2031-01-14T23:00:00-03:00',
	end: null,
	parts: undefined
};

/** @param {number} now */
const ctx = (now) => ({ origin: ORIGIN, now, chat: /** @type {const} */ ('private') });

describe('un taller en varias partes con una sola entrada', () => {
	it('antes de la parte 1: próxima, con la fecha de la parte 1', () => {
		const now = at('2031-01-08T12:00:00-03:00');
		expect(isPastTicket(TALLER, now)).toBe(false);
		expect(ticketDate(TALLER, now)).toMatchObject({ start: P1, n: 1, total: 3 });
		const s = ticketsScreen('u', [TALLER], 0, ctx(now));
		expect(s.text).toContain(unix(P1));
		expect(s.text).toContain('· Parte 1 de 3');
	});

	it('entre partes: sigue en «próximas» (no en «pasadas»), con la fecha de la parte 2', () => {
		const now = at('2031-01-12T12:00:00-03:00');
		expect(isPastTicket(TALLER, now)).toBe(false);
		expect(ticketsForView('u', [TALLER], now).map((t) => t.id)).toEqual(['tk-taller']);
		expect(ticketsForView('o', [TALLER], now)).toEqual([]);
		expect(ticketDate(TALLER, now)).toMatchObject({ start: P2, n: 2, total: 3 });
		const list = ticketsScreen('u', [TALLER], 0, ctx(now));
		expect(list.text).toContain(unix(P2));
		expect(list.text).toContain('· Parte 2 de 3');
		expect(list.text).not.toContain(unix(P1));
		const card = ticketScreen(TALLER, 'u', [TALLER], ctx(now));
		expect(card.text).toContain(`📅 <tg-time ${unix(P2)}`);
		expect(card.text).toContain('· Parte 2 de 3');
	});

	it('entre partes, ordena por la parte que toca (no por la parte 1)', () => {
		const now = at('2031-01-12T12:00:00-03:00');
		// La fiesta (14/1) es antes que la parte 2 del taller (17/1).
		expect(ticketsForView('u', [TALLER, SUELTO], now).map((t) => t.id)).toEqual([
			'tk-suelto',
			'tk-taller'
		]);
	});

	it('la parte que toca sigue siendo esa hasta 12 horas después de que termina', () => {
		expect(ticketDate(TALLER, at('2031-01-18T10:59:00-03:00'))).toMatchObject({ n: 2 });
		expect(ticketDate(TALLER, at('2031-01-18T11:01:00-03:00'))).toMatchObject({ n: 3 });
	});

	it('después de la última parte (más las 12 horas): pasada, con la fecha de la última', () => {
		expect(isPastTicket(TALLER, at('2031-01-25T10:59:00-03:00'))).toBe(false);
		const now = at('2031-01-25T11:01:00-03:00');
		expect(isPastTicket(TALLER, now)).toBe(true);
		expect(ticketsForView('u', [TALLER], now)).toEqual([]);
		expect(ticketsForView('o', [TALLER], now).map((t) => t.id)).toEqual(['tk-taller']);
		const s = ticketsScreen('o', [TALLER], 0, ctx(now));
		expect(s.text).toContain(unix(P3));
		expect(s.text).toContain('· Parte 3 de 3');
	});

	it('una parte cancelada no cuenta: si es la última, pasa después de la anterior', () => {
		const parts = (TALLER.parts ?? []).map((p) => (p.n === 3 ? { ...p, cancelled: true } : p));
		const t = { ...TALLER, parts };
		const now = at('2031-01-19T12:00:00-03:00');
		expect(isPastTicket(t, now)).toBe(true);
		expect(ticketDate(t, now)).toMatchObject({ start: P2, n: 2, total: 3 });
	});

	it('un evento suelto, como siempre: sin «Parte»', () => {
		const now = at('2031-01-08T12:00:00-03:00');
		expect(ticketDate(SUELTO, now)).toEqual({ start: SUELTO.start, end: null });
		expect(ticketsScreen('u', [SUELTO], 0, ctx(now)).text).not.toContain('Parte');
	});
});
