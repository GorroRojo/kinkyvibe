import { describe, expect, it } from 'vitest';
import { detectSeries, seriesKey, seriesNameFromTitle, slugStem } from './seriesDetect.js';

describe('slugStem', () => {
	it.each([
		['picantearla-2026-10', 'picantearla'],
		['cine-para-sucixs-2024-01-montevideo', 'cine-para-sucixs'],
		['cine-para-sucixs-octubre-2023', 'cine-para-sucixs'],
		['cine-para-sucixs', 'cine-para-sucixs'],
		['antipunitivismo-y-afectos-sep-2023', 'antipunitivismo-y-afectos'],
		['aberraciones-2024-09-50-sombras-de-grey', 'aberraciones'],
		['50-sombras-2025-03', '50-sombras'],
		// El primer pedazo nunca se toma como fecha.
		['2024-fiesta', '2024-fiesta']
	])('%s → %s', (slug, stem) => {
		expect(slugStem(slug)).toBe(stem);
	});
});

describe('seriesNameFromTitle', () => {
	it.each([
		['Cine Para Sucixs (8ª Edición)', 'Cine Para Sucixs'],
		['Cine Para Sucixs ¡2da Edición Montevideo!', 'Cine Para Sucixs'],
		['Cine Para Sucixs | Julio 2023', 'Cine Para Sucixs'],
		['Picantearla Deluxe 🔥 (11° Edición)', 'Picantearla Deluxe'],
		['"Picantearla - Edición Protocolar"', 'Picantearla'],
		['¡Córdoba! Someter: cómo dominar eróticamente un cuerpo', 'Someter'],
		['Rancheadita Kinky + Jam de Cuerdas', 'Rancheadita Kinky'],
		['Taller de Mirones (parte 2 de 2)', 'Taller de Mirones'],
		['Grupo de Apoyo y Discusión para Doms*', 'Grupo de Apoyo y Discusión para Doms'],
		['Troles & Tableros (7ª edición)', 'Troles & Tableros'],
		['¡Hablame sucio! (3ª Edición)', 'Hablame sucio'],
		['Taller de Bondage Online', 'Taller de Bondage'],
		['Moretón Vol. I Edición Hierofilia', 'Moretón'],
		['Fiesta #12', 'Fiesta'],
		['', '']
	])('%s → %s', (title, name) => {
		expect(seriesNameFromTitle(title)).toBe(name);
	});
	it('seriesKey compara sin tildes ni mayúsculas', () => {
		expect(seriesKey('Cine Para Súcixs')).toBe(seriesKey('cine para sucixs'));
	});
});

describe('detectSeries', () => {
	/** @param {string} slug @param {string} title @param {string} start @param {string[]} [tags] */
	const ev = (slug, title, start, tags = []) => ({ slug, title, start, tags });

	it('agrupa por nombre del título y por comienzo del slug', () => {
		const out = detectSeries(
			[
				ev('taller-de-humillacion-octubre-2023', 'Taller de Humillación', '2023-10-05T19:00-03:00'),
				ev('taller-humillacion-2024-07', 'Taller de Humillación', '2024-07-05T19:00-03:00'),
				// Mismo comienzo de slug, títulos distintos: se agrupan por el slug.
				ev('fugas-2024-12', 'Vínculos y mandatos', '2024-12-05T19:00-03:00'),
				ev('fugas-2025-02', 'Gestión del tiempo', '2025-02-05T19:00-03:00'),
				ev('suelto', 'Un evento solo', '2025-02-05T19:00-03:00')
			],
			{ seriesIds: [] }
		);
		expect(out).toEqual([
			{ name: 'Fugas', events: ['fugas-2024-12', 'fugas-2025-02'], skip: null },
			{
				name: 'Taller de Humillación',
				events: ['taller-de-humillacion-octubre-2023', 'taller-humillacion-2024-07'],
				skip: null
			}
		]);
	});

	it('descarta lo que ya es serie, las partes de un evento, el mismo mes y los nombres tomados', () => {
		const out = detectSeries(
			[
				ev('pica-2024-01', 'Pica (9° Edición)', '2024-01-10T21:00-03:00', ['Pica']),
				ev('pica-2024-02', 'Pica (10° Edición)', '2024-02-10T21:00-03:00', ['Pica']),
				ev('moral-2024-11', 'Moral (parte 1 de 2)', '2024-11-28T19:00-03:00'),
				ev('moral-2024-11-parte-2', 'Moral (parte 2 de 2)', '2024-12-05T19:00-03:00'),
				ev('festi-2026-07-dia-1', 'Festi - Día 1', '2026-07-01T19:00-03:00'),
				ev('festi-2026-07-dia-2', 'Festi - Día 2', '2026-07-02T19:00-03:00'),
				ev('shibari-2024-01', 'Shibari', '2024-01-01T19:00-03:00'),
				ev('shibari-2024-05', 'Shibari', '2024-05-01T19:00-03:00')
			],
			{ seriesIds: ['Pica'], tagExists: (n) => n === 'Shibari' }
		);
		expect(Object.fromEntries(out.map((c) => [c.name, c.skip]))).toEqual({
			Festi: { reason: 'mismo-mes', detail: '2026-07' },
			Moral: { reason: 'partes', detail: 'moral-2024-11' },
			Pica: { reason: 'ya-es-serie', detail: 'Pica' },
			Shibari: { reason: 'nombre-tomado', detail: 'Shibari' }
		});
	});

	it('el mes es el de la fecha escrita (hora de Argentina), no el de UTC', () => {
		const out = detectSeries(
			[
				ev('x-2024-11', 'X', '2024-11-30T22:00-03:00'),
				ev('x-2024-11-b', 'X', '2024-11-01T19:00-03:00')
			],
			{ seriesIds: [] }
		);
		expect(out[0].skip).toEqual({ reason: 'mismo-mes', detail: '2024-11' });
	});

	it('ignora las plantillas (`_…`)', () => {
		expect(
			detectSeries([ev('_event_template', 'Evento', ''), ev('_otra', 'Evento', '')], {
				seriesIds: []
			})
		).toEqual([]);
	});
});
