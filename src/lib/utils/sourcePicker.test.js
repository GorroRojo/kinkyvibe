import { describe, expect, it } from 'vitest';
import { listDate } from '$lib/admin/eventFormat.js';
import { searchSources, sourceDetail, sourceLabel, sourceSearchText } from './sourcePicker.js';

/** Eventos inventados, en desorden a propósito. */
const SOURCES = [
	{
		slug: 'taller-de-nudos-2026-03',
		title: 'Taller de Nudos Inventados',
		start: '2026-03-14T18:00-03:00',
		tags: ['español', 'taller'],
		series: ''
	},
	{
		slug: 'fiesta-picante-2026-10',
		title: 'Fiesta Picante (62ª Edición)',
		start: '2026-10-02T22:00-03:00',
		tags: ['español', 'fiesta-picante'],
		series: 'Fiesta Picante'
	},
	{
		slug: 'fiesta-picante-2026-09',
		title: 'Fiesta Picante (61ª Edición)',
		start: '2026-09-04T22:00-03:00',
		tags: ['español', 'fiesta-picante'],
		series: 'Fiesta Picante'
	},
	{
		slug: 'charla-sin-fecha',
		title: 'Charla sin fecha',
		start: '',
		tags: []
	},
	{
		slug: 'fiesta-picante-2025-10',
		title: 'Fiesta Picante (50ª Edición)',
		start: '2025-10-03T22:00-03:00',
		tags: ['fiesta-picante'],
		series: 'Fiesta Picante'
	}
];

const slugs = (/** @type {{ slug: string }[]} */ list) => list.map((s) => s.slug);

describe('listDate', () => {
	it('«vie 2 oct · 22:00»: sin ISO ni «hs»', () => {
		expect(listDate('2026-10-02T22:00-03:00', '2026-10-04')).toBe('vie 2 oct · 22:00');
	});
	it('el año solo si no es el de hoy', () => {
		expect(listDate('2025-10-03T22:00-03:00', '2026-10-04')).toBe('vie 3 oct 2025 · 22:00');
		// Sin «hoy», sin año.
		expect(listDate('2026-10-02T22:00-03:00')).toBe('vie 2 oct · 22:00');
	});
	it('sin hora, solo el día; sin fecha, vacío', () => {
		expect(listDate('2026-10-02', '2026-01-01')).toBe('vie 2 oct');
		expect(listDate('', '2026-01-01')).toBe('');
	});
});

describe('searchSources', () => {
	it('sin búsqueda: el más reciente primero', () => {
		expect(slugs(searchSources(SOURCES, '', { limit: 10 }))).toEqual([
			'fiesta-picante-2026-10',
			'fiesta-picante-2026-09',
			'taller-de-nudos-2026-03',
			'fiesta-picante-2025-10',
			'charla-sin-fecha'
		]);
	});

	it('sin búsqueda: primero los sugeridos (la serie de la fila), sin repetir', () => {
		expect(
			slugs(searchSources(SOURCES, '', { limit: 3, suggested: ['taller-de-nudos-2026-03'] }))
		).toEqual(['taller-de-nudos-2026-03', 'fiesta-picante-2026-10', 'fiesta-picante-2026-09']);
	});

	it('por título, sin tildes ni mayúsculas y con pedazos de palabra', () => {
		expect(slugs(searchSources(SOURCES, 'NUDOS'))).toEqual(['taller-de-nudos-2026-03']);
		expect(slugs(searchSources(SOURCES, 'picant', { limit: 2 }))).toEqual([
			'fiesta-picante-2026-10',
			'fiesta-picante-2026-09'
		]);
	});

	it('por fecha: «2 oct», «octubre 2025», «2/10», «2026-09»', () => {
		expect(slugs(searchSources(SOURCES, '2 oct'))).toEqual(['fiesta-picante-2026-10']);
		expect(slugs(searchSources(SOURCES, 'octubre 2025'))).toEqual(['fiesta-picante-2025-10']);
		expect(slugs(searchSources(SOURCES, '2/10'))).toEqual(['fiesta-picante-2026-10']);
		expect(slugs(searchSources(SOURCES, '2026-09'))).toEqual(['fiesta-picante-2026-09']);
		expect(slugs(searchSources(SOURCES, 'sábado'))).toEqual(['taller-de-nudos-2026-03']);
	});

	it('un número suelto es un día o un año entero, no un pedazo («2» no es «2026»)', () => {
		expect(slugs(searchSources(SOURCES, '2'))).toEqual(['fiesta-picante-2026-10']);
	});

	it('por serie (nombre) y por etiqueta', () => {
		expect(slugs(searchSources(SOURCES, 'fiesta picante 2025'))).toEqual([
			'fiesta-picante-2025-10'
		]);
		expect(slugs(searchSources(SOURCES, 'taller'))).toEqual(['taller-de-nudos-2026-03']);
	});

	it('nada coincide: vacío; respeta el límite', () => {
		expect(searchSources(SOURCES, 'inexistente')).toEqual([]);
		expect(searchSources(SOURCES, 'fiesta', { limit: 1 })).toHaveLength(1);
	});

	it('el texto de búsqueda incluye la fecha de varias formas', () => {
		const text = sourceSearchText(SOURCES[1]);
		for (const part of ['vie 2 oct', 'viernes', 'octubre', '2/10', '2026-10-02', '22:00'])
			expect(text).toContain(part);
	});
});

describe('sourceLabel y sourceDetail', () => {
	it('título · fecha de lista; detalle con serie y estado', () => {
		expect(sourceLabel(SOURCES[1], '2026-10-04')).toBe(
			'Fiesta Picante (62ª Edición) · vie 2 oct · 22:00'
		);
		expect(sourceLabel(SOURCES[3], '2026-10-04')).toBe('Charla sin fecha');
		expect(sourceDetail({ ...SOURCES[1], unlisted: true }, '2026-10-04')).toBe(
			'vie 2 oct · 22:00 · Fiesta Picante · no listado'
		);
		expect(sourceDetail({ ...SOURCES[3], hidden: true }, '2026-10-04')).toBe('sin fecha · oculto');
	});
});
