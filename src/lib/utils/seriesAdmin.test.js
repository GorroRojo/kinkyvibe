import { describe, expect, it } from 'vitest';
import {
	readSeriesChoice,
	seriesCreateOps,
	seriesEditOps,
	seriesPromptFor
} from './seriesAdmin.js';
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

describe('seriesEditOps', () => {
	const current = {
		id: 'Serie Inventada',
		visible_name: 'Serie Inventada',
		icon: '🎭',
		image: 'vieja.webp'
	};
	it('solo lo que cambió, en una operación «update» de la etiqueta', () => {
		expect(
			seriesEditOps(
				{
					visible_name: '  La Serie  Inventada ',
					icon: '🎭',
					image: 'nueva.webp',
					description: ' Una serie. '
				},
				current
			)
		).toEqual({
			ok: true,
			name: 'Serie Inventada',
			renamed: null,
			ops: [
				{
					type: 'update',
					id: 'Serie Inventada',
					set: {
						visible_name: 'La Serie Inventada',
						image: 'nueva.webp',
						description: 'Una serie.'
					}
				}
			]
		});
	});
	it('vaciar un campo lo saca; el nombre visible igual al de la etiqueta no cuenta', () => {
		const r = seriesEditOps(
			{ visible_name: 'Serie Inventada', icon: '', image: '', description: '' },
			current
		);
		expect(r).toMatchObject({ ok: true, ops: [{ set: { icon: '', image: '' } }] });
	});
	it('errores: sin cambios, imagen de afuera, corchetes, textos largos', () => {
		const same = { visible_name: '', icon: '🎭', image: 'vieja.webp', description: '' };
		expect(seriesEditOps(same, current)).toEqual({ ok: false, error: 'No cambiaste nada.' });
		expect(seriesEditOps({ ...same, image: '../x.webp' }, current).ok).toBe(false);
		expect(seriesEditOps({ ...same, image: 'https://x.test/a.webp' }, current).ok).toBe(false);
		expect(seriesEditOps({ ...same, visible_name: 'Con [[link]]' }, current).ok).toBe(false);
		expect(seriesEditOps({ ...same, icon: '🎭🎭🎭🎭🎭🎭🎭🎭🎭' }, current).ok).toBe(false);
		expect(seriesEditOps({ ...same, description: 'x'.repeat(2001) }, current).ok).toBe(false);
	});
	it('renombrar la etiqueta: primero «rename» (sin alias por defecto), lo demás con el nombre nuevo', () => {
		const same = { visible_name: '', icon: '🎭', image: 'vieja.webp', description: '' };
		expect(seriesEditOps({ ...same, key: '  Serie  Nueva ' }, current)).toEqual({
			ok: true,
			name: 'Serie Nueva',
			renamed: 'Serie Inventada',
			ops: [{ type: 'rename', from: 'Serie Inventada', to: 'Serie Nueva', keepAlias: false }]
		});
		const withAlias = seriesEditOps({ ...same, key: 'Serie Nueva', icon: '🌶' }, current, {
			keepAlias: true
		});
		expect(withAlias).toMatchObject({
			ok: true,
			ops: [
				{ type: 'rename', from: 'Serie Inventada', to: 'Serie Nueva', keepAlias: true },
				{ type: 'update', id: 'Serie Nueva', set: { icon: '🌶' } }
			]
		});
		// El mismo nombre (o vacío) no renombra.
		expect(seriesEditOps({ ...same, key: 'Serie Inventada' }, current)).toEqual({
			ok: false,
			error: 'No cambiaste nada.'
		});
		expect(seriesEditOps({ ...same, key: '' }, current).ok).toBe(false);
	});
	it('renombrar: el nombre nuevo tiene que ser válido y libre', () => {
		const same = { visible_name: '', icon: '🎭', image: 'vieja.webp', description: '' };
		const exists = (/** @type {string} */ n) => n === 'Ocupada';
		expect(seriesEditOps({ ...same, key: 'Ocupada' }, current, { exists })).toMatchObject({
			ok: false,
			error: expect.stringContaining('Ya existe')
		});
		expect(seriesEditOps({ ...same, key: 'Con [corchete]' }, current).ok).toBe(false);
	});
});
