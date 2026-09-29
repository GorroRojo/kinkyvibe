// @ts-nocheck -- test code: loose fixtures, no need for strict JSDoc types
import { describe, it, expect } from 'vitest';
import tagsFactory from './tags';
import { tagSorter, groupMap } from './index';

const sample = () => [
	{ id: 'KinkyVibe' },
	{ id: 'root', children: ['KinkyVibe', 'idioma', 'lugar', 'prácticas'] },
	{ id: 'idioma', children: ['español', 'inglés'] },
	{ id: 'español' },
	{ id: 'inglés' },
	{ id: 'lugar', children: ['Argentina'] },
	{ id: 'Argentina', children: ['AMBA'] },
	{ id: 'AMBA' },
	{ id: 'prácticas', children: ['bondage'] },
	{ id: 'bondage' }
];

describe('tagSorter', () => {
	it('ordena por la rama de primer nivel en el orden de declaración', () => {
		const tm = tagsFactory(sample());
		const sorted = ['bondage', 'AMBA', 'KinkyVibe', 'inglés']
			.map((t) => tm.get(t))
			.sort(tagSorter(tm))
			.map((t) => t.id);
		expect(sorted).toEqual(['KinkyVibe', 'inglés', 'AMBA', 'bondage']);
	});

	it('tags de la misma rama quedan juntos', () => {
		const tm = tagsFactory(sample());
		const sorted = ['AMBA', 'bondage', 'español', 'Argentina', 'inglés']
			.map((t) => tm.get(t))
			.sort(tagSorter(tm))
			.map((t) => t.id);
		expect(sorted.slice(0, 2).sort()).toEqual(['español', 'inglés']);
		expect(sorted.slice(2, 4).sort()).toEqual(['AMBA', 'Argentina']);
		expect(sorted[4]).toBe('bondage');
	});

	it('un tag desconocido (huérfano) no rompe el orden', () => {
		const tm = tagsFactory(sample());
		const sorted = ['bondage', 'inventado', 'español']
			.map((t) => tm.get(t))
			.sort(tagSorter(tm))
			.map((t) => t.id);
		expect(sorted).toHaveLength(3);
		expect(sorted.indexOf('español')).toBeLessThan(sorted.indexOf('bondage'));
	});

	it('con los tags reales, KinkyVibe e idioma van antes que las prácticas', () => {
		const tm = tagsFactory();
		const sorted = ['bondage', 'AMBA', 'español', 'KinkyVibe']
			.map((t) => tm.get(t))
			.sort(tagSorter(tm))
			.map((t) => t.id);
		expect(sorted[0]).toBe('KinkyVibe');
		expect(sorted.indexOf('español')).toBeLessThan(sorted.indexOf('AMBA'));
		expect(sorted.indexOf('AMBA')).toBeLessThan(sorted.indexOf('bondage'));
	});
});

describe('groupMap', () => {
	const tree = () => ({
		name: 'root',
		members: ['a'],
		sub: [
			{ name: 'x', members: ['b'], sub: [{ name: 'x1', sub: [] }] },
			{ name: 'y', members: [], sub: [] }
		]
	});

	it('aplica fn a cada grupo y subgrupo', () => {
		const res = groupMap(tree(), (g) => ({ ...g, name: g.name.toUpperCase() }));
		expect(res.name).toBe('ROOT');
		expect(res.sub.map((g) => g.name)).toEqual(['X', 'Y']);
		expect(res.sub[0].sub[0].name).toBe('X1');
	});

	it('completa members y sub vacíos', () => {
		const res = groupMap(tree(), (g) => g);
		expect(res.sub[0].sub[0].members).toEqual([]);
		expect(res.sub[1].sub).toEqual([]);
	});

	it('si fn devuelve false, el grupo (y su subárbol) se descarta', () => {
		const res = groupMap(tree(), (g) => (g.name === 'x' ? false : g));
		expect(res.sub.map((g) => g.name)).toEqual(['y']);
		expect(groupMap(tree(), () => false)).toBe(false);
	});

	it('no muta el grupo original', () => {
		const t = tree();
		groupMap(t, (g) => ({ ...g, name: 'z' }));
		expect(t.name).toBe('root');
		expect(t.sub[0].name).toBe('x');
	});
});
