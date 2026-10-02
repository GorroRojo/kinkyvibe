import { describe, expect, it } from 'vitest';
import { duplicateCandidates, quickDraftChoice, searchDuplicates } from './quickDraft.js';

/** Eventos inventados. */
const EVENTS = [
	{
		slug: 'fiesta-de-prueba-2026-09',
		title: 'Fiesta de prueba (3ª Edición)',
		start: '2026-09-12T21:00-03:00',
		end: '2026-09-13T02:00-03:00',
		series: 'Fiesta de prueba'
	},
	{
		slug: 'fiesta-de-prueba-2026-11',
		title: 'Fiesta de prueba (4ª Edición)',
		start: '2026-11-14T21:00-03:00',
		end: '2026-11-15T02:00-03:00'
	},
	{
		slug: 'charla-unica-2026-10',
		title: 'Charla única',
		start: '2026-10-20T19:00-03:00',
		end: ''
	},
	{
		slug: 'taller-de-nudos-2025-05',
		title: 'Taller de nudos',
		start: '2025-05-10T15:00-03:00',
		end: '2025-05-10T18:00-03:00'
	},
	{
		slug: 'taller-de-nudos-2025-08',
		title: 'Taller de nudos',
		start: '2025-08-10T15:00-03:00',
		end: '2025-08-10T18:00-03:00'
	},
	{ slug: 'oculto-2026-10', title: 'Oculto', start: '2026-10-01T20:00-03:00', unpublished: true },
	{ slug: '_plantilla', title: 'Plantilla', start: '' }
];

describe('duplicateCandidates', () => {
	const list = duplicateCandidates(EVENTS);

	it('una por familia, con su edición más reciente (aunque sea próxima)', () => {
		const fiesta = list.find((c) => c.slug.startsWith('fiesta'));
		expect(fiesta).toMatchObject({
			slug: 'fiesta-de-prueba-2026-11',
			title: 'Fiesta de prueba (4ª Edición)',
			date: '2026-11-14',
			series: 'Fiesta de prueba',
			editions: 2
		});
	});

	it('primero las que se repiten (serie o varias ediciones), después el resto; lo reciente primero', () => {
		expect(list.map((c) => c.slug)).toEqual([
			'fiesta-de-prueba-2026-11',
			'taller-de-nudos-2025-08',
			'charla-unica-2026-10'
		]);
	});

	it('sin despublicados ni archivos internos', () => {
		expect(list.some((c) => c.slug.startsWith('oculto') || c.slug.startsWith('_'))).toBe(false);
	});
});

describe('searchDuplicates', () => {
	const list = duplicateCandidates(EVENTS);

	it('busca en título, slug y serie, sin tildes, con todas las palabras', () => {
		expect(searchDuplicates(list, 'charla UNICA').map((c) => c.slug)).toEqual([
			'charla-unica-2026-10'
		]);
		expect(searchDuplicates(list, 'nudos 2025').map((c) => c.slug)).toEqual([
			'taller-de-nudos-2025-08'
		]);
		expect(searchDuplicates(list, 'fiesta nudos')).toEqual([]);
	});

	it('sin búsqueda, los primeros (con límite)', () => {
		expect(searchDuplicates(list, '', 2).map((c) => c.slug)).toEqual([
			'fiesta-de-prueba-2026-11',
			'taller-de-nudos-2025-08'
		]);
	});
});

describe('quickDraftChoice', () => {
	const source = {
		slug: 'fiesta-de-prueba-2026-11',
		title: 'Fiesta de prueba (4ª Edición)',
		start: '2026-11-14T21:00-03:00',
		end: '2026-11-15T02:00-03:00'
	};

	it('duplicando: la edición siguiente y las horas del original en el día nuevo', () => {
		expect(quickDraftChoice({ source, date: '2026-12-12' })).toEqual({
			ok: true,
			choice: {
				title: 'Fiesta de prueba (5ª Edición)',
				date: '2026-12-12',
				startTime: '21:00',
				endTime: '02:00',
				source: 'fiesta-de-prueba-2026-11'
			}
		});
	});

	it('con la hora elegida en la semana: dura lo mismo que el original', () => {
		const r = quickDraftChoice({ source, date: '2026-12-12', startTime: '22:00' });
		expect(r.ok && r.choice).toMatchObject({ startTime: '22:00', endTime: '03:00' });
	});

	it('con un rango elegido: ese', () => {
		const r = quickDraftChoice({
			source,
			date: '2026-12-12',
			startTime: '18:00',
			endTime: '20:00'
		});
		expect(r.ok && r.choice).toMatchObject({ startTime: '18:00', endTime: '20:00' });
	});

	it('un título propio gana', () => {
		const r = quickDraftChoice({ source, title: 'Fiesta especial', date: '2026-12-12' });
		expect(r.ok && r.choice.title).toBe('Fiesta especial');
	});

	it('de cero: hace falta el título; sin hora, 20:00 sin fin', () => {
		expect(quickDraftChoice({ source: null, date: '2026-12-12' })).toEqual({
			ok: false,
			error: 'Escribí el título.'
		});
		expect(quickDraftChoice({ source: null, title: ' Nuevo ', date: '2026-12-12' })).toEqual({
			ok: true,
			choice: { title: 'Nuevo', date: '2026-12-12', startTime: '20:00', endTime: '', source: '' }
		});
	});

	it('rechaza día inválido y títulos raros', () => {
		expect(quickDraftChoice({ source, date: '2026-02-30' }).ok).toBe(false);
		expect(quickDraftChoice({ source: null, title: 'a\nb', date: '2026-12-12' }).ok).toBe(false);
		expect(quickDraftChoice({ source: null, title: 'x'.repeat(201), date: '2026-12-12' }).ok).toBe(
			false
		);
	});
});
