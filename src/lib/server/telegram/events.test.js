import { describe, expect, it } from 'vitest';
import { toUpcomingEvents } from './events.js';

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
