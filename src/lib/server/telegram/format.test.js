import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	FOLLOW_TELEGRAM_LINE,
	escapeHtml,
	eventUrl,
	followedText,
	formatFollowNotice,
	formatHelp,
	formatWhen
} from './format.js';
import { docLine } from './siteScreens.js';

const ORIGIN = 'https://ejemplo.test';

// Las fechas inventadas son de 2031: el reloj va a ese año para que no lleven el año al final
// (`argDateList` lo agrega solo si no es el año en curso).
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2031-01-01T12:00:00-03:00'));
});
afterEach(() => {
	vi.useRealTimers();
});

describe('formatWhen', () => {
	it('da día, fecha y hora en hora de Argentina', () => {
		// 2031-01-10 es viernes.
		expect(formatWhen('2031-01-10T21:00:00-03:00')).toBe('vie 10 ene · 21:00');
		// Mismo instante escrito en UTC: sigue siendo la hora de Argentina.
		expect(formatWhen('2031-01-11T00:00:00Z')).toBe('vie 10 ene · 21:00');
	});

	it('usa las abreviaturas del sitio: «sep», no «sept»', () => {
		// 2031-09-13 es sábado.
		expect(formatWhen('2031-09-13T22:30:00-03:00')).toBe('sáb 13 sep · 22:30');
	});

	it('lleva el año al final si no es el de este año, como las listas del sitio', () => {
		expect(formatWhen('2032-01-09T21:00:00-03:00')).toBe('vie 9 ene 2032 · 21:00');
		expect(formatWhen('2032-01-09T21:00:00-03:00', '2032-01-01T12:00:00-03:00')).toBe(
			'vie 9 ene · 21:00'
		);
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
		// Con la línea de una lista del bot (antes, con `formatEventList`, que ya no está).
		const text = docLine(
			{ c: 'material', h: '/material/x', t: 'T' },
			undefined,
			/** @type {any} */ ({ origin: 'https://ejemplo.test" onclick="x', chat: 'private' })
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

describe('formatHelp', () => {
	it('usa voseo, escapa el <nombre> y apunta al sitio', () => {
		const text = formatHelp(ORIGIN);
		expect(text).toContain('Podés pedirme');
		expect(text).toContain('/evento &lt;nombre&gt;');
		expect(text).toContain('tocá uno');
		expect(text).toContain('https://ejemplo.test');
	});
});

describe('formatFollowNotice', () => {
	it('solo título, fecha y link, escapados', () => {
		const text = formatFollowNotice({
			kind: 'nuevo',
			title: 'Taller <inventado>',
			start: '2031-01-10T21:00:00-03:00',
			url: 'https://ejemplo.test/calendario/taller-inventado'
		});
		expect(text).toBe(
			'🆕 Se anunció algo nuevo\n\n<b>Taller &lt;inventado&gt;</b>\nvie 10 ene · 21:00\nhttps://ejemplo.test/calendario/taller-inventado'
		);
	});

	it('el recordatorio dice que falta poco', () => {
		const text = formatFollowNotice({
			kind: 'recordatorio',
			title: 'Fiesta inventada',
			start: '2031-01-10T21:00:00-03:00',
			url: 'https://ejemplo.test/calendario/fiesta'
		});
		expect(text).toContain('Recordatorio');
		expect(text).toContain('<b>Fiesta inventada</b>');
	});
});

describe('followedText', () => {
	it('sin avisos, solo lo que sigue; con avisos, la línea de cómo apagarlos', () => {
		expect(followedText('🪢 Cuerdas')).toBe('Listo: ahora seguís 🪢 Cuerdas.');
		expect(followedText('🪢 Cuerdas', { telegram: true })).toBe(
			`Listo: ahora seguís 🪢 Cuerdas.\n${FOLLOW_TELEGRAM_LINE}`
		);
		expect(FOLLOW_TELEGRAM_LINE).toContain('Mi rincón');
	});

	it('con un nombre larguísimo corta el nombre, nunca la línea (tope de 200 de Telegram)', () => {
		const long = 'x'.repeat(400);
		expect(followedText(long).length).toBeLessThanOrEqual(200);
		const withLine = followedText(long, { telegram: true });
		expect(withLine.length).toBeLessThanOrEqual(200);
		expect(withLine.endsWith(`\n${FOLLOW_TELEGRAM_LINE}`)).toBe(true);
	});
});
