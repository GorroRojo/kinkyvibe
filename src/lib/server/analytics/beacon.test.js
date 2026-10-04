import { describe, expect, it } from 'vitest';
import { BEACON_STEPS, createWindowLimiter, parseBeacon } from './beacon.js';

describe('parseBeacon: solo { step, slug } de la lista fija', () => {
	it('acepta los pasos de la lista', () => {
		expect(BEACON_STEPS).toEqual(['datos', 'pagar']);
		expect(parseBeacon('{"step":"datos","slug":"fiesta-rara"}')).toEqual({
			ok: true,
			step: 'datos',
			slug: 'fiesta-rara'
		});
		expect(parseBeacon('{"slug":"Fiesta-Rara","step":"pagar"}')).toEqual({
			ok: true,
			step: 'pagar',
			slug: 'fiesta-rara'
		});
	});

	it.each([
		['', 'vacío'],
		['no es json', 'no es JSON'],
		['[]', 'un array'],
		['null', 'null'],
		['{"step":"orden","slug":"fiesta-rara"}', 'un paso del servidor'],
		['{"step":"aprobada","slug":"fiesta-rara"}', 'un paso del servidor'],
		['{"step":"evento","slug":"fiesta-rara"}', 'un paso de las visitas'],
		['{"step":"datos"}', 'sin slug'],
		['{"step":"datos","slug":"../admin"}', 'slug raro'],
		['{"step":"datos","slug":""}', 'slug vacío'],
		['{"step":"datos","slug":5}', 'slug número'],
		['{"step":["datos"],"slug":"fiesta-rara"}', 'paso array'],
		[
			'{"step":"datos","slug":"fiesta-rara","email":"persona.inventada@example.com"}',
			'claves de más'
		],
		[`{"step":"datos","slug":"${'a'.repeat(400)}"}`, 'demasiado largo']
	])('rechaza %s (%s)', (text) => {
		expect(parseBeacon(text)).toEqual({ ok: false });
	});
});

describe('createWindowLimiter', () => {
	it('deja pasar hasta el límite por ventana y después vuelve a arrancar', () => {
		const l = createWindowLimiter({ limit: 3, windowMs: 1000 });
		expect([l.hit(0), l.hit(10), l.hit(20), l.hit(30)]).toEqual([true, true, true, false]);
		expect(l.hit(999)).toBe(false);
		expect(l.hit(1000)).toBe(true);
	});
});
