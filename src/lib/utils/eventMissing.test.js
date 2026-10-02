import { describe, expect, it } from 'vitest';
import { eventMissing, missingInputFromMeta, missingSummary } from './eventMissing.js';

/** Un evento completo (datos inventados). */
const FULL = {
	title: 'Taller de prueba',
	summary: 'Un taller inventado para los tests.',
	featured: 1,
	location: 'Calle Falsa 123',
	location_name: 'Lugar de prueba',
	tags: ['español', 'pago', 'AMBA', 'taller'],
	authors: ['KinkyVibe'],
	link: 'https://example.com/inscripcion',
	status: 'abierto'
};

/** @param {Record<string, unknown>} [changes] */
const missingOf = (changes = {}) =>
	eventMissing(missingInputFromMeta({ ...FULL, ...changes })).map((m) => m.id);

describe('eventMissing', () => {
	it('un evento completo no tiene nada pendiente', () => {
		expect(missingOf()).toEqual([]);
	});

	it('lista lo que falta, en orden', () => {
		expect(
			missingOf({
				featured: undefined,
				summary: '',
				location: '',
				location_name: '  ',
				tags: ['español'],
				authors: [],
				link: ''
			})
		).toEqual(['imagen', 'resumen', 'donde', 'region', 'precio', 'inscripcion', 'organizan']);
	});

	it('online no necesita dirección (pero sí región)', () => {
		expect(
			missingOf({ location: '', location_name: '', tags: ['español', 'gratis', 'Online'] })
		).toEqual([]);
	});

	it('con entradas en el sitio no hace falta link', () => {
		expect(
			missingOf({ link: '', tickets: [{ id: 'general', name: 'General', price: 1000 }] })
		).toEqual([]);
	});

	it('«anunciado» no muestra el link: cuenta como que falta (salvo que venda entradas)', () => {
		expect(missingOf({ status: 'anunciado' })).toEqual(['inscripcion']);
		expect(missingOf({ status: 'anunciado', tickets: [{ id: 'general' }] })).toEqual([]);
	});

	it('acepta etiquetas y organizadores sueltos (un string)', () => {
		expect(missingOf({ tags: 'AMBA', authors: 'KinkyVibe' })).toEqual(['precio']);
	});

	it('sin frontmatter, falta todo', () => {
		expect(eventMissing(missingInputFromMeta(null))).toHaveLength(7);
	});
});

describe('missingSummary', () => {
	it('arma el texto corto', () => {
		expect(missingSummary([{ label: 'Imagen' }, { label: 'Link o entradas' }])).toBe(
			'Falta: imagen, link o entradas'
		);
		expect(missingSummary([])).toBe('');
	});
});
