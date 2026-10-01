import { describe, expect, it } from 'vitest';
import { readSeriesChoice, seriesCreateOps, seriesPromptFor } from './seriesAdmin.js';
import { SERIES_PARENT } from './series.js';

describe('seriesCreateOps', () => {
	it('una etiqueta hija de «evento recurrente», con imagen y descripción si las hay', () => {
		expect(seriesCreateOps({ name: '  Fiesta   Rara ', image: '', description: '' })).toEqual({
			ok: true,
			name: 'Fiesta Rara',
			ops: [{ type: 'create', id: 'Fiesta Rara', parent: SERIES_PARENT }]
		});
		expect(
			seriesCreateOps({ name: 'Fiesta Rara', image: 'fiesta.webp', description: 'Una fiesta.' })
		).toEqual({
			ok: true,
			name: 'Fiesta Rara',
			ops: [
				{ type: 'create', id: 'Fiesta Rara', parent: SERIES_PARENT, description: 'Una fiesta.' },
				{ type: 'update', id: 'Fiesta Rara', set: { image: 'fiesta.webp' } }
			]
		});
	});
	it('errores: sin nombre, nombre tomado, imagen que no es de assets', () => {
		expect(seriesCreateOps({ name: '' })).toMatchObject({ ok: false });
		expect(seriesCreateOps({ name: 'Tomada' }, { exists: (n) => n === 'Tomada' })).toEqual({
			ok: false,
			error: 'Ya existe una etiqueta «Tomada».'
		});
		expect(seriesCreateOps({ name: 'X', image: '../secreto.webp' })).toMatchObject({ ok: false });
	});
});

describe('seriesPromptFor', () => {
	it('sin serie: sugiere el nombre del título y lista las series', () => {
		expect(
			seriesPromptFor({ title: 'Fiesta Rara (3ª Edición)', tags: ['fiesta'] }, ['Serie A'])
		).toEqual({ suggested: 'Fiesta Rara', existing: ['Serie A'] });
	});
	it('si el original ya está en una serie, no pregunta', () => {
		expect(seriesPromptFor({ title: 'X', tags: ['Serie A'] }, ['Serie A'])).toBeNull();
	});
});

describe('readSeriesChoice', () => {
	const opts = { seriesIds: ['Serie A'], exists: (/** @type {string} */ n) => n === 'taller' };
	it('sin respuesta o «No»: nada', () => {
		expect(readSeriesChoice({}, opts)).toEqual({ ok: true, choice: { type: 'none' } });
		expect(readSeriesChoice({ choice: 'no', markSource: 'on' }, opts)).toEqual({
			ok: true,
			choice: { type: 'none' }
		});
	});
	it('crear: nombre válido y que no exista', () => {
		expect(readSeriesChoice({ choice: 'crear', name: ' Nueva ', markSource: 'on' }, opts)).toEqual({
			ok: true,
			choice: { type: 'create', name: 'Nueva', markSource: true }
		});
		expect(readSeriesChoice({ choice: 'crear', name: 'Nueva' }, opts)).toEqual({
			ok: true,
			choice: { type: 'create', name: 'Nueva', markSource: false }
		});
		expect(readSeriesChoice({ choice: 'crear', name: 'Serie A' }, opts)).toMatchObject({
			ok: false
		});
		expect(readSeriesChoice({ choice: 'crear', name: 'taller' }, opts)).toMatchObject({
			ok: false
		});
		expect(readSeriesChoice({ choice: 'crear', name: '' }, opts)).toMatchObject({ ok: false });
	});
	it('agregar: solo a una serie que existe', () => {
		expect(readSeriesChoice({ choice: 'agregar', existing: 'Serie A' }, opts)).toEqual({
			ok: true,
			choice: { type: 'add', name: 'Serie A', markSource: false }
		});
		expect(readSeriesChoice({ choice: 'agregar', existing: 'taller' }, opts)).toMatchObject({
			ok: false
		});
		expect(readSeriesChoice({ choice: 'otra' }, opts)).toMatchObject({ ok: false });
	});
});
