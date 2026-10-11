import { describe, expect, it } from 'vitest';
import { barChips, sheetGroups, tagCounts } from './filtros.js';

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
});

describe('barChips', () => {
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

describe('sheetGroups', () => {
	const info = (/** @type {string} */ t) =>
		({
			taller: { group: 'tipo de evento' },
			fiesta: { group: 'tipo de evento' },
			Online: { group: 'lugar', name: 'Virtual' },
			Córdoba: { group: 'lugar' }
		})[t] ?? { group: 'otras' };

	it('agrupa por madre y ordena dentro de cada grupo', () => {
		expect(sheetGroups(['taller', 'Online', 'fiesta'], '', info)).toEqual([
			{ group: 'tipo de evento', tags: ['fiesta', 'taller'] },
			{ group: 'lugar', tags: ['Online'] }
		]);
	});

	it('busca sin tildes ni mayúsculas, también por el nombre visible', () => {
		expect(sheetGroups(['Córdoba', 'taller'], 'cordo', info)).toEqual([
			{ group: 'lugar', tags: ['Córdoba'] }
		]);
		expect(sheetGroups(['Online', 'taller'], 'VIRT', info)).toEqual([
			{ group: 'lugar', tags: ['Online'] }
		]);
	});

	it('sin coincidencias, ningún grupo', () => {
		expect(sheetGroups(['taller'], 'zzz', info)).toEqual([]);
	});
});
