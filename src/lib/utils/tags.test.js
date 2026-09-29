// @ts-nocheck -- test code: loose fixtures, no need for strict JSDoc types
import { describe, it, expect } from 'vitest';
import tagsFactory from './tags';
import hardcodedTags from './hardcodedTags';
import { aliaserFactory } from './index';

/** Fresh raw tags for every test: tagsFactory mutates the objects it receives. */
const sample = () => [
	{ id: 'root', children: ['idioma', 'lugar', 'prácticas'] },
	{ id: 'idioma', children: ['español', 'inglés'], color: 'darkblue' },
	{ id: 'español' },
	{ id: 'inglés' },
	{ id: 'lugar', children: ['Presencial'], color: 'green' },
	{ id: 'Presencial', children: ['Argentina'] },
	{ id: 'Argentina', children: ['AMBA'] },
	{ id: 'AMBA' },
	{ id: 'prácticas', children: ['bondage', 'impacto'] },
	{ id: 'bondage', aka: ['ataduras'], related: ['impacto'], color: 'red' },
	{ id: 'impacto', children: ['nalgadas'] },
	{ id: 'nalgadas' },
	{ id: 'cuir' },
	{ id: 'queer', aliasOf: 'cuir' },
	{
		id: 'caída',
		description: 'Después de una [[escena]], ver [[cuidados posteriores:aftercare]].'
	},
	{ id: 'escena' },
	{ id: 'cuidados posteriores' }
];

describe('tagsFactory (src/lib/utils/tags.js)', () => {
	it('get() devuelve el tag por id y completa visible_name', () => {
		const tm = tagsFactory(sample());
		expect(tm.get('bondage').id).toBe('bondage');
		expect(tm.get('bondage').visible_name).toBe('bondage');
	});

	it('resuelve alias explícitos (aliasOf) al tag original', () => {
		const tm = tagsFactory(sample());
		expect(tm.get('queer').id).toBe('cuir');
	});

	it('genera alias a partir de "aka"', () => {
		const tm = tagsFactory(sample());
		expect(tm.tagIDs()).toContain('ataduras');
		expect(tm.get('ataduras').id).toBe('bondage');
	});

	it('un tag desconocido devuelve un tag huérfano utilizable', () => {
		const tm = tagsFactory(sample());
		const t = tm.get('no-existe');
		expect(t.id).toBe('no-existe');
		expect(t.visible_name).toBe('no-existe');
		expect(t.orphan).toBe(true);
		expect(t.getAllChildren()).toEqual([]);
		expect(t.getAllParents()).toEqual([]);
		expect(t.getColor()).toBeUndefined();
	});

	it('agrega parents a partir de children', () => {
		const tm = tagsFactory(sample());
		expect(tm.get('AMBA').parents).toEqual(['Argentina']);
		expect(tm.get('idioma').parents).toEqual(['root']);
	});

	it('un tag con varios padres los conserva todos', () => {
		const raw = [
			{ id: 'a', children: ['x'] },
			{ id: 'b', children: ['x'] },
			{ id: 'x' }
		];
		const tm = tagsFactory(raw);
		expect(tm.get('x').parents).toEqual(['a', 'b']);
	});

	it('un child no declarado queda creado como tag con su parent', () => {
		const tm = tagsFactory([{ id: 'a', children: ['fantasma'] }]);
		expect(tm.tagIDs()).toContain('fantasma');
		expect(tm.get('fantasma').parents).toEqual(['a']);
	});

	it('getAllChildren devuelve todos los descendientes', () => {
		const tm = tagsFactory(sample());
		expect(new Set(tm.get('lugar').getAllChildren())).toEqual(
			new Set(['Presencial', 'Argentina', 'AMBA'])
		);
		expect(new Set(tm.get('prácticas').getAllChildren())).toEqual(
			new Set(['bondage', 'impacto', 'nalgadas'])
		);
		expect(tm.get('AMBA').getAllChildren()).toEqual([]);
	});

	it('getAllParents devuelve todos los ancestros (incluido root)', () => {
		const tm = tagsFactory(sample());
		expect(new Set(tm.get('AMBA').getAllParents())).toEqual(
			new Set(['Argentina', 'Presencial', 'lugar', 'root'])
		);
	});

	it('getColor usa el color propio o hereda el del ancestro más cercano', () => {
		const tm = tagsFactory(sample());
		expect(tm.get('bondage').getColor()).toBe('red');
		expect(tm.get('AMBA').getColor()).toBe('green');
		expect(tm.get('español').getColor()).toBe('darkblue');
		expect(tm.get('cuir').getColor()).toBeUndefined();
	});

	it('los "related" se enlazan en ambas direcciones', () => {
		const tm = tagsFactory(sample());
		expect(tm.get('bondage').related).toContain('impacto');
		expect(tm.get('impacto').related).toContain('bondage');
	});

	it('parsea [[wikilinks]] de la descripción', () => {
		const tm = tagsFactory(sample());
		const parsed = tm.get('caída').parsedDescription ?? [];
		expect(parsed.map(({ line, type }) => ({ line, type }))).toEqual([
			{ line: 'Después de una ', type: 'text' },
			{ line: 'escena', type: 'link' },
			{ line: ', ver ', type: 'text' },
			{ line: 'aftercare', type: 'link' },
			{ line: '.', type: 'text' }
		]);
	});

	// Regression test: parseDescription() used to drop the computed `href` of [[destino:texto]]
	// links (fixed in the bug-hunt branch).
	it('conserva el href de [[destino:texto]] en parsedDescription', () => {
		const tm = tagsFactory(sample());
		expect(tm.get('caída').parsedDescription).toContainEqual({
			line: 'aftercare',
			type: 'link',
			href: 'cuidados posteriores'
		});
	});

	it('preserva el orden de declaración en tagIDs()', () => {
		const tm = tagsFactory(sample());
		const ids = tm.tagIDs();
		expect(ids.slice(0, 4)).toEqual(['root', 'idioma', 'español', 'inglés']);
		expect(ids.indexOf('idioma')).toBeLessThan(ids.indexOf('lugar'));
	});

	it('set() y delete() modifican el mapa', () => {
		const tm = tagsFactory(sample());
		tm.set('nuevo', { color: 'pink' });
		expect(tm.get('nuevo').color).toBe('pink');
		expect(tm.delete('nuevo')).toBe(true);
		expect(tm.delete('nuevo')).toBe(false);
	});

	// BUG (reported, not fixed): tagManager.get() never returns undefined (it falls back to an
	// orphan tag), so the `missingTags.push(...)` branches for unknown `related` ids and unknown
	// [[wikilinks]] in descriptions are unreachable and missingTags is always [].
	// Flip to `it` once fixed.
	it.fails('missingTags reporta related/wikilinks que apuntan a tags inexistentes', () => {
		const tm = tagsFactory([
			{ id: 'a', related: ['no-existe'], description: 'ver [[tampoco-existe]]' }
		]);
		expect(tm.missingTags).toEqual(expect.arrayContaining(['no-existe', 'tampoco-existe']));
	});
});

describe('tags hardcodeados (hardcodedTags.js)', () => {
	const tm = tagsFactory();

	it('ids únicos', () => {
		const ids = hardcodedTags.map((t) => t.id);
		const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
		expect(dupes).toEqual([]);
	});

	it('todos los aliasOf apuntan a tags declarados', () => {
		// (children may reference undeclared ids on purpose: tagsFactory creates them.)
		const declared = new Set(hardcodedTags.map((t) => t.id));
		const missing = hardcodedTags
			.filter((t) => t.aliasOf && !declared.has(t.aliasOf))
			.map((t) => `${t.id} aliasOf ${t.aliasOf}`);
		// Known issue on main: 'Dominatrix' points to a 'dominatrix' tag that doesn't exist,
		// so get('Dominatrix') returns an orphan instead of resolving. Remove once fixed.
		const known = ['Dominatrix aliasOf dominatrix'];
		expect(missing.filter((m) => !known.includes(m))).toEqual([]);
	});

	it('la jerarquía no tiene ciclos (getAllChildren terminaría en loop infinito)', () => {
		const children = new Map(hardcodedTags.map((t) => [t.id, t.children ?? []]));
		const cycles = [];
		const visit = (id, stack) => {
			if (stack.includes(id)) return cycles.push([...stack, id].join(' > '));
			for (const c of children.get(id) ?? []) visit(c, [...stack, id]);
		};
		visit('root', []);
		expect(cycles).toEqual([]);
	});

	it('tags declarados que no cuelgan de root (snapshot)', () => {
		const underRoot = new Set(tm.get('root').getAllChildren());
		const loose = hardcodedTags
			.filter((t) => t.id !== 'root' && !t.aliasOf && !underRoot.has(t.id))
			.map((t) => t.id);
		// Snapshot so detached tags are a conscious decision. Current state on main:
		// an empty-id tag `{ id: '' }` and respiración/estrangulación (not reachable from root).
		expect(loose).toEqual(['', 'respiración', 'estrangulación']);
	});

	it('alias conocidos', () => {
		expect(tm.get('kinkyvibe').id).toBe('KinkyVibe');
		expect(tm.get('queer').id).toBe('cuir');
		expect(tm.get('aftercare').id).toBe('cuidados posteriores');
		expect(tm.get('drop').id).toBe('caída');
	});

	it('es idempotente: construirlo dos veces da la misma jerarquía', () => {
		const a = tagsFactory();
		const b = tagsFactory();
		for (const id of a.tagIDs()) {
			expect(b.get(id).parents, id).toEqual(a.get(id).parents);
		}
	});

	it('aliaserFactory normaliza alias al id canónico', () => {
		const alias = aliaserFactory(tm);
		expect(alias('queer')).toBe('cuir');
		expect(alias('BDSM')).toBe('BDSM');
		expect(alias('inventado')).toBe('inventado');
	});
});
