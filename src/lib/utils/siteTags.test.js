import { describe, expect, it } from 'vitest';
import { get, writable } from 'svelte/store';
import tagsFactory from './tags.js';
import { freshSiteTags, useSiteTags } from './siteTags.js';

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
		expect(get(b)).not.toBe(get(a));
		expect(() => structuredClone(raw)).not.toThrow();
		expect(freshSiteTags().tagIDs()).toEqual(['root', 'inventada']);

		const before = get(a);
		useSiteTags(raw, [a, b]); // la misma lista: no cambia nada
		expect(get(a)).toBe(before);

		useSiteTags(null, [a, b]);
		expect(get(a).tagIDs()).toEqual(tagsFactory().tagIDs());
	});
});
