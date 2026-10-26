import { describe, expect, it } from 'vitest';
import { get, writable } from 'svelte/store';
import tagsFactory from './tags.js';
import { currentSiteTags, freshSiteTags, siteTagTree, useSiteTags } from './siteTags.js';

describe('useSiteTags', () => {
	it('pone el árbol de la base en los stores, sin tocar la lista, y vuelve al archivo con null', () => {
		const a = writable(tagsFactory());
		const b = writable(tagsFactory());
		const raw = [
			{ id: 'root', children: ['inventada'] },
			{ id: 'inventada', visible_name: 'Etiqueta Inventada' }
		];
		useSiteTags(raw, [a, b]);
		expect(get(a).get('inventada').visible_name).toBe('Etiqueta Inventada');
		// Un solo árbol (de solo lectura) para los dos stores y `currentSiteTags()`.
		expect(get(b)).toBe(get(a));
		expect(currentSiteTags()).toBe(get(a));
		expect(() => structuredClone(raw)).not.toThrow();
		expect(freshSiteTags().tagIDs()).toEqual(['root', 'inventada']);
		expect(freshSiteTags()).not.toBe(get(a));

		const before = get(a);
		useSiteTags(raw, [a, b]); // la misma lista: no cambia nada
		expect(get(a)).toBe(before);

		useSiteTags(null, [a, b]);
		expect(get(a).tagIDs()).toEqual(tagsFactory().tagIDs());
	});
});

describe('siteTagTree', () => {
	it('la misma lista da el mismo árbol; otra lista (aunque sea igual), otro árbol', () => {
		const raw = [
			{ id: 'root', children: ['inventada'] },
			{ id: 'inventada', visible_name: 'Etiqueta Inventada' }
		];
		const tree = siteTagTree(raw);
		expect(siteTagTree(raw)).toBe(tree);
		expect(tree.get('inventada').visible_name).toBe('Etiqueta Inventada');
		// se arma sobre una copia: la lista sigue siendo datos
		expect(() => structuredClone(raw)).not.toThrow();

		const other = siteTagTree(structuredClone(raw));
		expect(other).not.toBe(tree);
		expect(other.tagIDs()).toEqual(tree.tagIDs());
		expect(siteTagTree([{ id: 'root' }])).not.toBe(tree);
	});
});
