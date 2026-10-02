import { describe, expect, it } from 'vitest';
import {
	CALLBACK_DATA_MAX_BYTES,
	KEYBOARD_MAX,
	eventCallbackData,
	eventListKeyboard,
	eventToken,
	findByToken,
	parseCallbackData,
	truncate
} from './keyboards.js';

/** @param {number} n */
const fake = (n) => ({
	slug: `evento-inventado-${n}`,
	title: `Evento inventado ${n}`,
	start: '2031-01-10T21:00:00-03:00'
});

const bytes = (/** @type {string} */ s) => new TextEncoder().encode(s).length;

describe('eventToken', () => {
	it('usa la dirección si entra y es simple', () => {
		expect(eventToken('taller-2031-01')).toBe('taller-2031-01');
		expect(eventCallbackData('taller-2031-01')).toBe('ev:taller-2031-01');
	});

	it('con una dirección larga o con caracteres raros usa un hash corto y estable', () => {
		const long = 'x'.repeat(80);
		expect(eventToken(long)).toMatch(/^#[0-9a-z]{1,7}$/);
		expect(eventToken(long)).toBe(eventToken(long));
		expect(eventToken('café con ñ')).toMatch(/^#/);
		expect(eventToken('a'.repeat(80))).not.toBe(eventToken('b'.repeat(80)));
	});

	it('el callback_data nunca pasa de 64 bytes', () => {
		for (const slug of ['a', 'x'.repeat(61), 'x'.repeat(62), 'ñ'.repeat(40), 'a b']) {
			expect(bytes(eventCallbackData(slug))).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES);
		}
	});

	it('lo que arma se puede leer y encontrar', () => {
		const events = [fake(1), { ...fake(2), slug: 'z'.repeat(90) }];
		for (const e of events) {
			const parsed = parseCallbackData(eventCallbackData(e.slug));
			expect(parsed?.kind).toBe('event');
			expect(findByToken(events, /** @type {any} */ (parsed).token)).toBe(e);
		}
	});
});

describe('parseCallbackData', () => {
	it('reconoce la vuelta a la lista', () => {
		expect(parseCallbackData('ls')).toEqual({ kind: 'list' });
	});

	it('rechaza lo que no es nuestro', () => {
		for (const d of [
			'',
			'ev:',
			'ev:a b',
			'ev:<b>',
			'#abc',
			'ev:#ZZZ',
			'ev:' + 'a'.repeat(62),
			42,
			null
		]) {
			expect(parseCallbackData(d)).toBeNull();
		}
	});
});

describe('eventListKeyboard', () => {
	it('un botón por evento, hasta KEYBOARD_MAX', () => {
		const events = Array.from({ length: KEYBOARD_MAX + 2 }, (_, i) => fake(i + 1));
		const kb = eventListKeyboard(events);
		expect(kb.inline_keyboard).toHaveLength(KEYBOARD_MAX);
		expect(kb.inline_keyboard[0]).toEqual([
			{ text: 'Ver: Evento inventado 1', callback_data: 'ev:evento-inventado-1' }
		]);
	});

	it('acorta los títulos largos', () => {
		const kb = eventListKeyboard([
			{ ...fake(1), title: 'Un título larguísimo inventado para la prueba' }
		]);
		expect(kb.inline_keyboard[0][0].text).toBe('Ver: Un título larguísimo inventado…');
	});
});

describe('truncate', () => {
	it('no corta lo corto y cuenta caracteres, no bytes', () => {
		expect(truncate('ñandú', 5)).toBe('ñandú');
		expect(truncate('ñandúes', 5)).toBe('ñand…');
	});
});
