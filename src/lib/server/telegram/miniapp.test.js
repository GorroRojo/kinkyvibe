/**
 * La Mini App del calendario: los próximos eventos por día, con lo público y links al sitio.
 * Eventos inventados.
 */
import { describe, expect, it } from 'vitest';
import { APP_MAX_EVENTS, groupByDay } from './miniapp.js';

const ORIGIN = 'https://ejemplo.test';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');

/** @param {string} postID @param {string} start @param {object} [extra] */
const post = (postID, start, extra = {}) => ({
	meta: { postID, title: `Evento inventado ${postID}`, start, category: 'calendario', ...extra }
});

describe('groupByDay', () => {
	it('agrupa por día en hora de Argentina, en orden, sin lo pasado', () => {
		const days = groupByDay(
			[
				post('b', '2031-01-09T21:00:00-03:00'),
				post('pasado', '2031-01-01T21:00:00-03:00'),
				post('a', '2031-01-09T19:00:00-03:00'),
				// 00:30 del 10 en Argentina, aunque en UTC sea otro día.
				post('c', '2031-01-10T00:30:00-03:00', { status: 'cancelado' })
			],
			null,
			{ now: NOW, origin: ORIGIN }
		);
		expect(days.map((d) => [d.day, d.events.map((e) => e.slug)])).toEqual([
			['jueves 9 de enero', ['a', 'b']],
			['viernes 10 de enero', ['c']]
		]);
		expect(days[0].events[0]).toMatchObject({
			time: '19:00',
			href: `${ORIGIN}/calendario/a`,
			image: null,
			ticket: null
		});
		expect(days[1].events[0].cancelled).toBe(true);
	});

	it('lugar público, imagen absoluta y comprar en el sitio', () => {
		const [day] = groupByDay(
			[
				post('x', '2031-01-09T19:00:00-03:00', {
					location_name: 'Lugar de Prueba',
					featured: '/media/afiche.jpg',
					tickets: [{ name: 'General' }]
				})
			],
			null,
			{ now: NOW, origin: ORIGIN }
		);
		expect(day.events[0]).toMatchObject({
			place: 'Lugar de Prueba',
			image: `${ORIGIN}/media/afiche.jpg`,
			ticket: { text: 'Comprar en el sitio', href: `${ORIGIN}/calendario/x/entradas` }
		});
	});

	it('agotadas: aviso sin link', () => {
		const [day] = groupByDay(
			[post('x', '2031-01-09T19:00:00-03:00', { tickets: [{ name: 'General' }] })],
			{ x: { open: false, reason: 'soldout', opensAt: null } },
			{ now: NOW, origin: ORIGIN }
		);
		expect(day.events[0].ticket).toEqual({ text: 'Agotadas', href: null });
	});

	it('no más de APP_MAX_EVENTS', () => {
		const many = Array.from({ length: APP_MAX_EVENTS + 5 }, (_, i) =>
			post(`e${i}`, new Date(NOW + (i + 1) * 3600e3).toISOString())
		);
		const total = groupByDay(many, null, { now: NOW, origin: ORIGIN }).flatMap((d) => d.events);
		expect(total).toHaveLength(APP_MAX_EVENTS);
	});
});
