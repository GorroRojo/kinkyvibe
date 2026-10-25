/**
 * Los eventos pasados de /calendario de a un mes (pasados.js): solo los que ya empezaron en ese
 * mes (en hora de Argentina), con solo los campos de la grilla (nunca el lugar). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	PAST_EVENT_FIELDS,
	firstEventMonth,
	fullPastEventsOf,
	isPastIn,
	pastEventsOf,
	slimPastMeta
} from './pasados.js';

const NOW = Date.parse('2026-10-12T15:00:00-03:00');

/** @param {string} slug @param {string} start */
const event = (slug, start) =>
	/** @type {ProcessedPost} */ ({
		path: `/calendario/${slug}`,
		meta: {
			title: `Evento ${slug}`,
			postID: slug,
			category: 'calendario',
			layout: 'calendario',
			start,
			tags: ['inventada'],
			status: 'abierto',
			summary: 'Un resumen inventado',
			location: 'Calle Inventada 123',
			location_name: 'Lugar Inventado'
		}
	});

const posts = [
	event('marzo', '2025-03-08T20:00-03:00'),
	event('octubre-pasado', '2026-10-03T20:00-03:00'),
	event('octubre-proximo', '2026-10-20T20:00-03:00'),
	// el 30/9 a las 22 en Argentina ya es 1/10 en UTC: es de septiembre
	event('fin-de-septiembre', '2026-09-30T22:00-03:00')
];

describe('pastEventsOf', () => {
	it('solo los que ya empezaron en ese mes, en hora de Argentina', () => {
		expect(pastEventsOf(posts, '2026-10', NOW).map((p) => p.meta.postID)).toEqual([
			'octubre-pasado'
		]);
		expect(pastEventsOf(posts, '2026-09', NOW).map((p) => p.meta.postID)).toEqual([
			'fin-de-septiembre'
		]);
		expect(pastEventsOf(posts, '2025-03', NOW).map((p) => p.meta.postID)).toEqual(['marzo']);
		expect(pastEventsOf(posts, '2026-11', NOW)).toEqual([]);
	});

	it('solo los campos de la grilla: sin lugar ni resumen', () => {
		const [p] = pastEventsOf(posts, '2025-03', NOW);
		expect(p.path).toBe('/calendario/marzo');
		expect(Object.keys(p.meta).every((k) => PAST_EVENT_FIELDS.includes(k))).toBe(true);
		expect(JSON.stringify(p)).not.toContain('Inventada 123');
		expect(JSON.stringify(p)).not.toContain('Lugar Inventado');
		expect(p.meta).toMatchObject({ title: 'Evento marzo', start: '2025-03-08T20:00-03:00' });
	});
});

describe('isPastIn', () => {
	it('un próximo nunca es pasado, aunque sea de ese mes', () => {
		expect(isPastIn(posts[2], '2026-10', NOW)).toBe(false);
		expect(isPastIn(posts[1], '2026-10', NOW)).toBe(true);
	});

	it('una fecha que no se entiende no es de ningún mes', () => {
		expect(isPastIn(event('rara', 'no-es-fecha'), '2026-10', NOW)).toBe(false);
	});
});

describe('slimPastMeta', () => {
	it('deja solo lo que está en PAST_EVENT_FIELDS', () => {
		expect(
			slimPastMeta(/** @type {any} */ ({ title: 'T', location: 'X', parte: { n: 1, m: 2 } }))
		).toEqual({ title: 'T', parte: { n: 1, m: 2 } });
	});
});

describe('fullPastEventsOf', () => {
	it('los mismos que pastEventsOf, enteros (para la lista)', () => {
		expect(fullPastEventsOf(posts, '2026-10', NOW)).toEqual([posts[1]]);
		expect(fullPastEventsOf(posts, '2026-09', NOW)).toEqual([posts[3]]);
		expect(fullPastEventsOf(posts, '2026-11', NOW)).toEqual([]);
	});
});

describe('firstEventMonth', () => {
	it('el mes del evento más viejo, en hora de Argentina', () => {
		expect(firstEventMonth(posts)).toBe('2025-03');
		// el 31/12 a las 22 en Argentina ya es 2025 en UTC: es diciembre de 2024
		expect(firstEventMonth([...posts, event('fin-de-2024', '2024-12-31T22:00-03:00')])).toBe(
			'2024-12'
		);
	});

	it('sin eventos con fecha: null', () => {
		expect(firstEventMonth([])).toBeNull();
		expect(firstEventMonth([event('rara', 'no-es-fecha')])).toBeNull();
	});
});
