/**
 * La Kinkipedia: el índice de secciones y «Ir a una entrada». Árbol inventado.
 */
import { describe, expect, it } from 'vitest';
import tagsFactory from './tags';
import { wikiOptions, wikiSections, wikiSuggestions, wikiVisible } from './wikiIndex.js';

const tm = tagsFactory(
	/** @type {any} */ ([
		{ id: 'root', children: ['prácticas', 'implementos', 'vacía'] },
		{ id: 'prácticas', icon: '🪢', children: ['ataduras', 'impacto'] },
		{ id: 'ataduras', description: 'Atar con cuerdas.', aka: ['bondage'] },
		{ id: 'impacto', visible_name: 'Juego de impacto' },
		{ id: 'implementos', description: 'Cosas para jugar.' },
		{ id: 'vacía', children: ['nada'] },
		{ id: 'nada' },
		{ id: 'cuerdas', aliasOf: 'ataduras' }
	])
);

describe('wikiVisible / wikiSections', () => {
	it('se ven las ramas con algo que mostrar (propio o de una hija)', () => {
		expect(wikiVisible(tm, 'prácticas')).toBe(true);
		expect(wikiVisible(tm, 'vacía')).toBe(false);
		expect(wikiSections(tm)).toEqual([
			{ id: 'prácticas', name: 'prácticas', icon: '🪢', anchor: '#pr%C3%A1cticas' },
			{ id: 'implementos', name: 'implementos', icon: '', anchor: '#implementos' }
		]);
	});
});

describe('wikiOptions / wikiSuggestions', () => {
	const options = wikiOptions(tm);

	it('todas las entradas menos root y los alias, con sus otros nombres', () => {
		const ids = options.map((o) => o.id);
		expect(ids).toContain('ataduras');
		expect(ids).not.toContain('root');
		expect(ids).not.toContain('cuerdas');
		const ataduras = options.find((o) => o.id === 'ataduras');
		expect(ataduras?.aliases).toEqual(expect.arrayContaining(['bondage', 'cuerdas']));
		expect(ataduras?.group).toBe('prácticas');
	});

	it('busca por nombre, nombre visible o alias (sin tildes) y lleva a /wiki/<etiqueta>', () => {
		expect(wikiSuggestions(options, '', tm)).toEqual([]);
		expect(wikiSuggestions(options, 'bondage', tm)[0]).toMatchObject({
			value: '/wiki/ataduras',
			label: 'ataduras',
			detail: 'prácticas · también «bondage»'
		});
		expect(wikiSuggestions(options, 'juego', tm)[0]).toMatchObject({
			value: '/wiki/impacto',
			label: 'Juego de impacto'
		});
		expect(wikiSuggestions(options, 'practicas', tm)[0]?.value).toBe('/wiki/pr%C3%A1cticas');
	});
});
