import { describe, expect, it } from 'vitest';
import { fromInput, postFields, toInput } from './postFields.js';

/** @param {string} key */
const field = (key, category = 'calendario') => {
	const f = postFields(category).find((x) => x.key === key);
	if (!f) throw new Error(`sin campo ${key}`);
	return f;
};

describe('postFields', () => {
	it('los comunes, los de la categoría y «No listado» al final', () => {
		const keys = postFields('calendario').map((f) => f.key);
		expect(keys.slice(0, 4)).toEqual(['title', 'summary', 'published_date', 'updated_date']);
		expect(keys).toContain('start');
		expect(keys).toContain('location_name');
		expect(keys.at(-1)).toBe('force_unlisted');
	});
	it('wiki y categorías desconocidas: solo los comunes y el final', () => {
		expect(postFields('wiki').map((f) => f.key)).toEqual([
			'title',
			'summary',
			'published_date',
			'updated_date',
			'force_unlisted'
		]);
		expect(postFields('otra')).toEqual(postFields('wiki'));
	});
	it('cada categoría tiene sus campos', () => {
		expect(postFields('amigues').map((f) => f.key)).toContain('pronoun');
		expect(postFields('material').map((f) => f.key)).toContain('redirect');
		expect(postFields('material').map((f) => f.key)).not.toContain('start');
	});
});

describe('toInput', () => {
	it('checkbox, vacío, fecha y fecha con hora', () => {
		expect(toInput(field('force_unlisted'), true)).toBe(true);
		expect(toInput(field('force_unlisted'), 'true')).toBe(false);
		expect(toInput(field('title'), undefined)).toBe('');
		expect(toInput(field('published_date'), '2026-09-29Z-03:00')).toBe('2026-09-29');
		expect(toInput(field('start'), '2026-12-19T21:00-03:00')).toBe('2026-12-19T21:00');
		expect(toInput(field('start'), '2026-12-19')).toBe('2026-12-19T00:00');
		expect(toInput(field('start'), 'cualquier cosa')).toBe('');
		expect(toInput(field('title'), 42)).toBe('42');
	});
});

describe('fromInput', () => {
	it('vacío o checkbox apagado sacan la propiedad', () => {
		expect(fromInput(field('title'), '')).toBe(null);
		expect(fromInput(field('force_unlisted'), false)).toBe(null);
		expect(fromInput(field('force_unlisted'), true)).toBe(true);
	});
	it('fechas con el formato del sitio; inválidas tal cual', () => {
		expect(fromInput(field('published_date'), '2026-09-29')).toBe('2026-09-29Z-03:00');
		expect(fromInput(field('start'), '2026-12-19T21:00')).toBe('2026-12-19T21:00-03:00');
		expect(fromInput(field('start'), '2026-12-19T')).toBe('2026-12-19T');
	});
	it('el resumen queda en una línea; el texto sin espacios de más', () => {
		expect(fromInput(field('summary'), ' Una fiesta \n  de prueba \n')).toBe(
			'Una fiesta de prueba'
		);
		expect(fromInput(field('title'), '  Fiesta  ')).toBe('Fiesta');
	});
	it('ida y vuelta conserva el valor', () => {
		const f = field('start');
		expect(fromInput(f, toInput(f, '2026-12-19T21:00-03:00'))).toBe('2026-12-19T21:00-03:00');
	});
});
