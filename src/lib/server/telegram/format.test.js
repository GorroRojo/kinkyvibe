import { describe, expect, it } from 'vitest';
import {
	LIST_MAX,
	escapeHtml,
	eventUrl,
	formatChoices,
	formatEvent,
	formatEventList,
	formatHelp,
	formatWhen
} from './format.js';

const ORIGIN = 'https://ejemplo.test';

/** @param {number} n */
const fake = (n) => ({
	slug: `evento-inventado-${n}`,
	title: `Evento inventado ${n}`,
	start: '2031-01-10T21:00:00-03:00'
});

describe('formatWhen', () => {
	it('da día, fecha y hora en hora de Argentina', () => {
		// 2031-01-10 es viernes.
		expect(formatWhen('2031-01-10T21:00:00-03:00')).toBe('vie 10 ene · 21:00');
		// Mismo instante escrito en UTC: sigue siendo la hora de Argentina.
		expect(formatWhen('2031-01-11T00:00:00Z')).toBe('vie 10 ene · 21:00');
	});

	it('devuelve vacío si la fecha no se puede leer', () => {
		expect(formatWhen('no es una fecha')).toBe('');
	});
});

describe('escapeHtml', () => {
	it('escapa lo que Telegram interpreta como HTML', () => {
		expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
	});

	it('escapa las comillas dobles, para que no cierren un atributo', () => {
		expect(escapeHtml('a" onclick="x')).toBe('a&quot; onclick=&quot;x');
	});

	it('un origen con comillas no puede salirse del href', () => {
		const text = formatEventList(
			[{ slug: 'x', title: 'T', start: '2031-01-10T21:00:00-03:00' }],
			'https://ejemplo.test" onclick="x'
		);
		expect(text).not.toMatch(/href="[^"]*"[^>]*onclick/);
		expect(text).toContain('&quot;');
	});
});

describe('eventUrl', () => {
	it('arma el link al evento en el sitio', () => {
		expect(eventUrl(ORIGIN, 'taller-2031-01')).toBe(
			'https://ejemplo.test/calendario/taller-2031-01'
		);
	});

	it('codifica la dirección', () => {
		expect(eventUrl(ORIGIN, 'a b?c')).toBe('https://ejemplo.test/calendario/a%20b%3Fc');
	});
});

describe('formatEventList', () => {
	it('lista los eventos con link al sitio', () => {
		const text = formatEventList([fake(1), fake(2)], ORIGIN);
		expect(text).toContain('<b>Próximos eventos</b>');
		expect(text).toContain(
			'<a href="https://ejemplo.test/calendario/evento-inventado-1">Evento inventado 1</a>'
		);
		expect(text).toContain('vie 10 ene · 21:00');
		expect(text).toContain('Evento inventado 2');
	});

	it('escapa los títulos', () => {
		const text = formatEventList(
			[{ slug: 'x', title: '<script>alert(1)</script>', start: '2031-01-10T21:00:00-03:00' }],
			ORIGIN
		);
		expect(text).not.toContain('<script>');
		expect(text).toContain('&lt;script&gt;');
	});

	it('si no hay eventos, manda al calendario', () => {
		expect(formatEventList([], ORIGIN)).toContain('https://ejemplo.test/calendario');
	});

	it('muestra hasta LIST_MAX y cuenta el resto', () => {
		const events = Array.from({ length: LIST_MAX + 3 }, (_, i) => fake(i + 1));
		const text = formatEventList(events, ORIGIN);
		expect(text).toContain(`Evento inventado ${LIST_MAX}`);
		expect(text).not.toContain(`Evento inventado ${LIST_MAX + 1}`);
		expect(text).toContain('Hay 3 más');
		expect(text.length).toBeLessThan(4096);
	});
});

describe('formatEvent', () => {
	it('muestra título, fecha y link, sin lugar ni precios', () => {
		const text = formatEvent(fake(1), ORIGIN);
		expect(text).toContain('<b>Evento inventado 1</b>');
		expect(text).toContain('vie 10 ene · 21:00');
		expect(text).toContain('https://ejemplo.test/calendario/evento-inventado-1');
	});
});

describe('formatChoices', () => {
	it('lista los candidatos', () => {
		const text = formatChoices([fake(1), fake(2)], ORIGIN);
		expect(text).toContain('¿Cuál querés ver?');
		expect(text).toContain('Evento inventado 2');
	});
});

describe('formatHelp', () => {
	it('usa voseo, escapa el <nombre> y apunta al sitio', () => {
		const text = formatHelp(ORIGIN);
		expect(text).toContain('Podés pedirme');
		expect(text).toContain('/evento &lt;nombre&gt;');
		expect(text).toContain('https://ejemplo.test');
	});
});
