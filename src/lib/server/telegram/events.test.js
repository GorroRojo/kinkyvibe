import { describe, expect, it } from 'vitest';
import { toCardInfo, toUpcomingEvents } from './events.js';

const NOW = Date.parse('2031-01-01T00:00:00Z');

/**
 * @param {string} postID
 * @param {string} start
 * @param {string} [category]
 */
const post = (postID, start, category = 'calendario') =>
	/** @type {ProcessedPost} */ (
		/** @type {unknown} */ ({
			path: `/${category}/${postID}`,
			meta: { postID, title: `Título ${postID}`, start, category }
		})
	);

describe('toUpcomingEvents', () => {
	it('deja solo eventos que todavía no empezaron, del más cercano al más lejano', () => {
		const out = toUpcomingEvents(
			[
				post('lejano', '2031-06-01T20:00:00-03:00'),
				post('pasado', '2030-06-01T20:00:00-03:00'),
				post('cercano', '2031-02-01T20:00:00-03:00')
			],
			NOW
		);
		expect(out.map((e) => e.slug)).toEqual(['cercano', 'lejano']);
	});

	it('ignora lo que no es del calendario', () => {
		const out = toUpcomingEvents(
			[
				post('nota', '2031-02-01T20:00:00-03:00', 'material'),
				post('ev', '2031-02-02T20:00:00-03:00')
			],
			NOW
		);
		expect(out.map((e) => e.slug)).toEqual(['ev']);
	});

	it('solo pasa slug, título y fechas', () => {
		const withExtras = post('ev', '2031-02-02T20:00:00-03:00');
		Object.assign(withExtras.meta, { end: '2031-02-03T01:00:00-03:00', tickets: { price: 1 } });
		expect(toUpcomingEvents([withExtras], NOW)).toEqual([
			{
				slug: 'ev',
				title: 'Título ev',
				start: '2031-02-02T20:00:00-03:00',
				end: '2031-02-03T01:00:00-03:00'
			}
		]);
	});
});

describe('toCardInfo (lo que la página pública muestra)', () => {
	const ORIGIN = 'https://ejemplo.test';
	const meta = {
		postID: 'ev',
		category: 'calendario',
		featured: '/media/afiche-inventado.jpg',
		location_name: 'Lugar de Prueba',
		location: 'Calle Falsa 123',
		location_map: 'https://www.openstreetmap.org/#map=18/-34.6/-58.4'
	};

	it('sin lugar vinculado: el «Dónde» del .md y su mapa; la imagen como URL absoluta', () => {
		expect(toCardInfo(meta, { origin: ORIGIN })).toEqual({
			image: 'https://ejemplo.test/media/afiche-inventado.jpg',
			place: 'Lugar de Prueba · Calle Falsa 123',
			mapUrl: 'https://www.openstreetmap.org/#map=18/-34.6/-58.4',
			ticket: null
		});
	});

	it('un lugar oculto manda: ni la dirección del .md ni el mapa', () => {
		const info = toCardInfo(meta, { origin: ORIGIN, venue: { level: 'hidden' } });
		expect(info.place).toBe('Lugar a confirmar');
		expect(JSON.stringify(info)).not.toContain('Calle Falsa');
		expect(info.mapUrl).toBeUndefined();
	});

	it('nivel «Sólo Nombre»: el nombre, sin mapa', () => {
		const info = toCardInfo(meta, {
			origin: ORIGIN,
			venue: { level: 'name', name: 'Lugar Inventado', href: '/amigues/x' }
		});
		expect(info.place).toBe('Lugar Inventado');
		expect(info.mapUrl).toBeUndefined();
	});

	it('si no se pudo leer el lugar, no va ningún lugar', () => {
		const info = toCardInfo(meta, { origin: ORIGIN, venueFailed: true });
		expect(info.place).toBeUndefined();
		expect(info.mapUrl).toBeUndefined();
	});

	it('con entradas: el mismo estado que las tarjetas del calendario', () => {
		const withTickets = { ...meta, tickets: [{ name: 'General' }] };
		expect(toCardInfo(withTickets, { origin: ORIGIN, states: null }).ticket).toEqual({
			kind: 'buy',
			href: '/calendario/ev/entradas',
			text: 'Comprar entradas'
		});
		expect(
			toCardInfo(withTickets, {
				origin: ORIGIN,
				states: { ev: { open: false, reason: 'soldout', opensAt: null } }
			}).ticket
		).toEqual({ kind: 'note', text: 'Agotadas' });
	});
});
