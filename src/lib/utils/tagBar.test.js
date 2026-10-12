import { describe, expect, it } from 'vitest';
import { BAR_CHIPS, barChips, tagCounts, toggleTag } from './tagBar.js';

const post = (/** @type {string[]} */ ...tags) => ({ meta: { tags } });
const posts = [
	post('taller', 'Online', 'español'),
	post('taller', 'Presencial', 'español'),
	post('fiesta', 'Presencial', 'español'),
	post('taller', 'Presencial', 'español', 'a la gorra')
];

describe('tagCounts', () => {
	it('cuenta cada etiqueta una vez por publicación', () => {
		const counts = tagCounts([post('taller', 'taller'), post('fiesta')]);
		expect(counts.get('taller')).toBe(1);
		expect(counts.get('fiesta')).toBe(1);
	});

	it('saltea las que están en todas (no cambian nada), salvo si están elegidas', () => {
		expect(tagCounts(posts).has('español')).toBe(false);
		expect(tagCounts(posts, ['español']).get('español')).toBe(4);
	});

	it('tolera publicaciones sin etiquetas', () => {
		expect(tagCounts([{ meta: {} }, post('taller')]).get('taller')).toBe(1);
	});
});

describe('barChips', () => {
	it('hasta 8 por defecto', () => {
		expect(BAR_CHIPS).toBe(8);
		const many = Array.from({ length: 12 }, (_, i) => post(`t${String(i).padStart(2, '0')}`));
		expect(barChips(many, [])).toHaveLength(8);
	});

	it('las más usadas primero, empates en orden alfabético', () => {
		expect(barChips(posts, [])).toEqual(['Presencial', 'taller', 'a la gorra', 'fiesta', 'Online']);
	});

	it('las elegidas van adelante aunque se usen poco, sin repetirse', () => {
		expect(barChips(posts, ['fiesta'], 3)).toEqual(['fiesta', 'Presencial', 'taller']);
	});

	it('nunca esconde una elegida aunque haya más que el máximo', () => {
		expect(barChips(posts, ['fiesta', 'Online', 'taller'], 2)).toEqual([
			'fiesta',
			'Online',
			'taller'
		]);
	});
});

describe('toggleTag', () => {
	it('suma al final sin repetir y saca', () => {
		expect(toggleTag(['a', 'b'], 'a', true)).toEqual(['b', 'a']);
		expect(toggleTag(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
		expect(toggleTag(['a', 'b'], 'a', false)).toEqual(['b']);
	});
});
