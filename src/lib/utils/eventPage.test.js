/**
 * La página de un evento y sus listas (pedido de gorrite, revisión de UX del sitio): si ya pasó,
 * la serie para seguir y el orden de «Más cosas de…» y «Participa en». Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	eventPageTitle,
	isPastEvent,
	mainSeries,
	nextEdition,
	splitParticipations,
	splitUpcomingPast
} from './eventPage.js';

const NOW = Date.parse('2026-10-04T12:00:00-03:00');

describe('isPastEvent', () => {
	it('pasó cuando terminó, no cuando empezó', () => {
		const meta = { start: '2026-10-04T10:00:00-03:00', end: '2026-10-04T13:00:00-03:00' };
		expect(isPastEvent(meta, NOW)).toBe(false);
		expect(isPastEvent(meta, Date.parse('2026-10-04T13:01:00-03:00'))).toBe(true);
	});

	it('un fin pasada la medianoche escrito con la fecha del principio cuenta al día siguiente', () => {
		const meta = { start: '2026-10-03T22:00:00-03:00', end: '2026-10-03T04:00:00-03:00' };
		expect(isPastEvent(meta, Date.parse('2026-10-04T03:00:00-03:00'))).toBe(false);
	});

	it('sin fecha (o con una que no se entiende) no pasó', () => {
		expect(isPastEvent({}, NOW)).toBe(false);
		expect(isPastEvent({ start: 'cualquier cosa' }, NOW)).toBe(false);
	});
});

describe('la serie del evento', () => {
	const next = {
		path: '/calendario/noche-inventada-11',
		title: 'Noche Inventada',
		start: '2026-11-01'
	};
	const series = {
		list: [
			{ id: 'Serie Uno', name: 'Serie Uno', href: '/wiki/Serie-Uno', nextUpcoming: null },
			{ id: 'Serie Dos', name: 'Serie Dos', href: '/wiki/Serie-Dos', nextUpcoming: next }
		]
	};

	it('la primera es la que se sigue y va de chip', () => {
		expect(mainSeries(series)?.id).toBe('Serie Uno');
		expect(mainSeries(null)).toBeNull();
		expect(mainSeries({ list: [] })).toBeNull();
	});

	it('la próxima edición anunciada de cualquiera de sus series', () => {
		expect(nextEdition(series)).toBe(next);
		expect(nextEdition({ list: [series.list[0]] })).toBeNull();
		expect(nextEdition(null)).toBeNull();
	});
});

describe('eventPageTitle', () => {
	const series = { list: [{ id: 'Serie Uno', name: 'Serie Uno', href: '/wiki/Serie-Uno' }] };

	it('en una serie suma el mes y el año de la edición (en hora de Argentina)', () => {
		const meta = { title: 'Noche Inventada', start: '2026-10-02T22:00-03:00' };
		expect(eventPageTitle(meta, series)).toBe('Noche Inventada · octubre 2026');
		// 31/12 a las 23:00 en Argentina ya es 1/1 en UTC: sigue siendo diciembre.
		const fin = { title: 'Noche Inventada', start: '2026-12-31T23:00-03:00' };
		expect(eventPageTitle(fin, series)).toBe('Noche Inventada · diciembre 2026');
	});

	it('sin serie, sin fecha o si el título ya dice el mes, queda igual', () => {
		const meta = { title: 'Noche Inventada', start: '2026-10-02T22:00-03:00' };
		expect(eventPageTitle(meta, null)).toBe('Noche Inventada');
		expect(eventPageTitle(meta, { list: [] })).toBe('Noche Inventada');
		expect(eventPageTitle({ title: 'Noche Inventada' }, series)).toBe('Noche Inventada');
		expect(eventPageTitle({ ...meta, start: 'cualquier cosa' }, series)).toBe('Noche Inventada');
		expect(eventPageTitle({ ...meta, title: 'Noche de Octubre' }, series)).toBe('Noche de Octubre');
	});
});

/** @param {string} path @param {string} category @param {string | null} start */
const post = (path, category, start) => ({ path, meta: { category, start } });

describe('«Más cosas de…»: lo que viene en orden y lo pasado aparte', () => {
	it('próximos del más cercano al más lejano, después lo que no es un evento; pasados al revés', () => {
		const posts = [
			post('/calendario/lejos', 'calendario', '2026-12-01T20:00:00-03:00'),
			post('/material/guia', 'material', '2025-01-01'),
			post('/calendario/viejo', 'calendario', '2025-03-01T20:00:00-03:00'),
			post('/calendario/cerca', 'calendario', '2026-10-10T20:00:00-03:00'),
			post('/calendario/reciente', 'calendario', '2026-09-20T20:00:00-03:00')
		];
		const { upcoming, past } = splitUpcomingPast(posts, NOW);
		expect(upcoming.map((p) => p.path)).toEqual([
			'/calendario/cerca',
			'/calendario/lejos',
			'/material/guia'
		]);
		expect(past.map((p) => p.path)).toEqual(['/calendario/reciente', '/calendario/viejo']);
	});
});

describe('«Participa en» de un perfil', () => {
	/** @param {string} title @param {string} category @param {string | null} date */
	const item = (title, category, date) => ({ title, path: `/x/${title}`, category, date });

	it('por rol: lo que viene en orden de fecha; los eventos pasados en «Pasados», con su rol', () => {
		const { current, past } = splitParticipations(
			[
				{
					rol: 'Organiza',
					items: [
						item('pasado-viejo', 'calendario', '2024-05-01'),
						item('lejos', 'calendario', '2027-01-10'),
						item('cerca', 'calendario', '2026-10-20'),
						item('pasado-reciente', 'calendario', '2026-09-01')
					]
				},
				{ rol: 'Escribe', items: [item('guia', 'material', '2025-01-01')] },
				{ rol: 'Da el taller', items: [item('solo-pasado', 'calendario', '2025-02-01')] }
			],
			NOW
		);
		expect(current).toEqual([
			{
				rol: 'Organiza',
				items: [
					item('cerca', 'calendario', '2026-10-20'),
					item('lejos', 'calendario', '2027-01-10')
				]
			},
			{ rol: 'Escribe', items: [item('guia', 'material', '2025-01-01')] }
		]);
		expect(past.map((g) => [g.rol, g.items.map((i) => i.title)])).toEqual([
			['Organiza', ['pasado-reciente', 'pasado-viejo']],
			['Da el taller', ['solo-pasado']]
		]);
	});

	it('un evento sin fecha queda con lo que viene', () => {
		const { current, past } = splitParticipations(
			[{ rol: 'Organiza', items: [item('sin-fecha', 'calendario', null)] }],
			NOW
		);
		expect(current[0].items.map((i) => i.title)).toEqual(['sin-fecha']);
		expect(past).toEqual([]);
	});
});
