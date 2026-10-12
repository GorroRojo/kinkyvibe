/**
 * Las búsquedas parecidas de Buscar sin resultados (searchSuggest.js): más tolerantes que el
 * buscador del sitio, solo palabras de títulos y etiquetas, y cada sugerencia trae algo.
 */
import { describe, expect, it } from 'vitest';
import { search } from '$lib/utils/search';
import {
	closestTagNames,
	closestWords,
	suggestDistance,
	suggestSearches,
	SUGGESTIONS_MAX,
	tagRelatives
} from './searchSuggest.js';
import { manager, source } from './noResults.fixtures.js';

describe('suggestDistance', () => {
	it('más tolerante cuanto más larga la palabra; nada con menos de 3 letras', () => {
		expect([2, 3, 4, 5, 7, 8, 12].map(suggestDistance)).toEqual([0, 1, 1, 2, 2, 3, 3]);
	});
});

describe('closestWords', () => {
	it('encuentra la palabra de un título con dos letras cambiadas', () => {
		expect(closestWords(source.prepared, 'querdaz')).toContain('cuerdas');
	});

	it('no sugiere palabras que solo están en el cuerpo de un texto', () => {
		// «cosquillas» está solo en el cuerpo de un material.
		expect(closestWords(source.prepared, 'cozquiyaz')).toEqual([]);
	});

	it('con menos de 3 letras no sugiere nada', () => {
		expect(closestWords(source.prepared, 'cu')).toEqual([]);
	});
});

describe('closestTagNames', () => {
	it('por el id o por el nombre visible de una etiqueta usada', () => {
		expect(closestTagNames(source, 'suspencion')).toEqual(['suspensión']);
	});
});

describe('tagRelatives', () => {
	it('hijas y relacionadas primero, después las madres; sin la raíz ni ella misma', () => {
		expect(tagRelatives(manager(), 'shibari')).toEqual(['suspensión', 'nudos', 'cuerdas']);
		expect(tagRelatives(manager(), 'cuerdas')).toEqual(['shibari']);
	});
});

describe('suggestSearches', () => {
	it('un error de más que el buscador del sitio: sugiere la palabra, con cuántas cosas trae', () => {
		// El buscador del sitio no encuentra nada (perdona un solo error en 7 letras)…
		expect(search(source.prepared, 'querdaz')).toEqual([]);
		// …y la sugerencia sí trae algo.
		const { suggestions, firstHits } = suggestSearches(source, 'querdaz');
		expect(suggestions[0]).toEqual({ query: 'cuerdas', count: 2 });
		expect(firstHits.map((d) => d.h)).toEqual(
			expect.arrayContaining(['/material/guia-cuerdas', '/wiki/cuerdas'])
		);
	});

	it('varias palabras que juntas no traen nada: cada una sola', () => {
		const { suggestions } = suggestSearches(source, 'cuerdas zzzzzz');
		expect(suggestions.map((s) => s.query)).toContain('cuerdas');
	});

	it('lo que pasa quien llama va primero (las parientes de una etiqueta)', () => {
		const { suggestions } = suggestSearches(source, 'shibari', ['suspensión', 'nudos', 'cuerdas']);
		expect(suggestions.map((s) => s.query)).toEqual(['suspensión', 'nudos', 'cuerdas']);
	});

	it('cada sugerencia trae algo, sin repetir lo buscado, y como mucho tres', () => {
		const { suggestions } = suggestSearches(source, 'shibari', [
			'shibari',
			'nada-de-nada',
			'suspensión',
			'nudos',
			'cuerdas',
			'látex'
		]);
		expect(suggestions).toHaveLength(SUGGESTIONS_MAX);
		for (const s of suggestions) {
			expect(s.query).not.toBe('shibari');
			expect(search(source.prepared, s.query).length).toBe(s.count);
			expect(s.count).toBeGreaterThan(0);
		}
	});

	it('algo que no se parece a nada: ninguna sugerencia', () => {
		expect(suggestSearches(source, 'xqxqxq')).toEqual({ suggestions: [], firstHits: [] });
	});
});
