import { describe, expect, it } from 'vitest';
import tagsFactory from './tags';
import { resolveTagSlug, tagIdFromSlug, tagSlug } from './tagSlug.js';
import { seriesApiPath, seriesTagIds, tagFeedPath, tagPagePath } from './series.js';
import { readSearchParams, writeSearchParams } from './postSearch.js';

/** Árbol chico, inventado (tagsFactory modifica los objetos: uno nuevo por prueba). */
const tree = () =>
	tagsFactory(
		/** @type {any} */ ([
			{
				id: 'evento recurrente',
				children: ['Rancheadita Kinky', 'Picantearla', 'Deseo & Disidencia']
			},
			{ id: 'Rancheadita Kinky', aka: ['Ranchada Kinky', 'RK'] },
			{ id: 'Picantearla' },
			{ id: 'Deseo & Disidencia' },
			{ id: 'rancheadita' },
			{ id: 'Risk-Aware Consensual Kink' },
			{ id: 'web', aka: ['online'] }
		])
	);

describe('tagSlug', () => {
	it('espacios → guiones, nada más', () => {
		expect(tagSlug('Rancheadita Kinky')).toBe('Rancheadita-Kinky');
		expect(tagSlug('Picantearla')).toBe('Picantearla');
		expect(tagSlug('Deseo & Disidencia')).toBe('Deseo-&-Disidencia');
	});
});

describe('resolveTagSlug', () => {
	it('una serie de varias palabras por su slug, con espacios o en minúsculas', () => {
		const tm = tree();
		expect(tagIdFromSlug(tm, 'Rancheadita-Kinky')).toBe('Rancheadita Kinky');
		expect(tagIdFromSlug(tm, 'Rancheadita Kinky')).toBe('Rancheadita Kinky');
		expect(tagIdFromSlug(tm, 'rancheadita-kinky')).toBe('Rancheadita Kinky');
		expect(tagIdFromSlug(tm, 'Deseo-&-Disidencia')).toBe('Deseo & Disidencia');
		expect(resolveTagSlug(tm, 'Rancheadita-Kinky')?.parents).toEqual(['evento recurrente']);
	});

	it('una de una palabra; y la exacta gana sobre la que solo coincide sin mayúsculas', () => {
		const tm = tree();
		expect(tagIdFromSlug(tm, 'Picantearla')).toBe('Picantearla');
		expect(tagIdFromSlug(tm, 'picantearla')).toBe('Picantearla');
		expect(tagIdFromSlug(tm, 'rancheadita')).toBe('rancheadita');
	});

	it('etiquetas con guiones propios', () => {
		const tm = tree();
		expect(tagIdFromSlug(tm, 'Risk-Aware Consensual Kink')).toBe('Risk-Aware Consensual Kink');
		expect(tagIdFromSlug(tm, 'Risk-Aware-Consensual-Kink')).toBe('Risk-Aware Consensual Kink');
	});

	it('alias (`aka`): llevan a su etiqueta, también en forma slug', () => {
		const tm = tree();
		expect(tagIdFromSlug(tm, 'online')).toBe('web');
		expect(tagIdFromSlug(tm, 'RK')).toBe('Rancheadita Kinky');
		expect(tagIdFromSlug(tm, 'Ranchada-Kinky')).toBe('Rancheadita Kinky');
		expect(tagIdFromSlug(tm, 'ranchada-kinky')).toBe('Rancheadita Kinky');
	});

	it('lo que no existe: undefined / null', () => {
		const tm = tree();
		expect(resolveTagSlug(tm, 'no-existe-nada')).toBeUndefined();
		expect(tagIdFromSlug(tm, 'no-existe-nada')).toBeNull();
		expect(tagIdFromSlug(tm, '')).toBeNull();
		expect(tagIdFromSlug(tm, undefined)).toBeNull();
	});

	it('ida y vuelta: los links que arma el sitio llevan a la misma etiqueta', () => {
		const tm = tree();
		for (const id of seriesTagIds(tm)) {
			for (const [prefix, path] of [
				['/wiki/', tagPagePath(id)],
				['/api/series/', seriesApiPath(id)],
				['/ics/etiqueta/', tagFeedPath(id)]
			]) {
				const segment = decodeURIComponent(path.slice(prefix.length).replace(/\.ics$/, ''));
				expect(tagIdFromSlug(tm, segment)).toBe(id);
			}
		}
	});
});

describe('las series del sitio', () => {
	it('todas se encuentran por la forma slug de su página', () => {
		const tm = tagsFactory();
		const ids = seriesTagIds(tm);
		expect(ids.length).toBeGreaterThan(1);
		for (const id of ids) expect(tagIdFromSlug(tm, tagSlug(id))).toBe(id);
	});
	it('lo que no existe no cae en ninguna (el árbol tiene una etiqueta con id vacío)', () => {
		const tm = tagsFactory();
		expect(tagIdFromSlug(tm, 'no-existe-nada')).toBeNull();
		expect(tagIdFromSlug(tm, 'Rancheadita-Inventada')).toBeNull();
	});
});

describe('series hijas de Picantearla (nombres con «:» y espacios)', () => {
	const NAMES = [
		['Picantearla: Deluxe', 'Picantearla:-Deluxe'],
		['Picantearla: Protocolar', 'Picantearla:-Protocolar'],
		['Picantearla: Age Play', 'Picantearla:-Age-Play']
	];

	it('son series, hijas de Picantearla (que sigue siendo serie)', () => {
		const tm = tagsFactory();
		const ids = seriesTagIds(tm);
		expect(ids).toContain('Picantearla');
		for (const [name] of NAMES) {
			expect(ids).toContain(name);
			expect(tm.get(name).parents).toEqual(['Picantearla']);
		}
		expect(tm.get('Picantearla').children).toEqual(NAMES.map(([name]) => name));
	});

	it('la etiqueta de práctica «edad» (alias «age play») no cambia ni se vuelve serie', () => {
		const tm = tagsFactory();
		expect(tm.get('age play').id).toBe('edad');
		expect(seriesTagIds(tm)).not.toContain('edad');
		expect(tagIdFromSlug(tm, 'age-play')).toBe('edad');
		expect(tagIdFromSlug(tm, 'Picantearla:-Age-Play')).toBe('Picantearla: Age Play');
	});

	it('nombre ↔ slug, ida y vuelta (con espacios, guiones o en minúsculas)', () => {
		const tm = tagsFactory();
		for (const [name, slug] of NAMES) {
			expect(tagSlug(name)).toBe(slug);
			expect(tagIdFromSlug(tm, slug)).toBe(name);
			expect(tagIdFromSlug(tm, name)).toBe(name);
			expect(tagIdFromSlug(tm, slug.toLowerCase())).toBe(name);
			expect(tagIdFromSlug(tm, decodeURIComponent(encodeURIComponent(slug)))).toBe(name);
		}
	});

	it('los links del sitio (página, /api/series, .ics) codifican «:» y vuelven a la serie', () => {
		const tm = tagsFactory();
		for (const [name, slug] of NAMES) {
			const encoded = slug.replace(':', '%3A');
			expect(tagPagePath(name)).toBe(`/wiki/${encoded}`);
			expect(seriesApiPath(name)).toBe(`/api/series/${encoded}`);
			expect(tagFeedPath(name)).toBe(`/ics/etiqueta/${encoded}.ics`);
			for (const [prefix, path] of [
				['/wiki/', tagPagePath(name)],
				['/api/series/', seriesApiPath(name)],
				['/ics/etiqueta/', tagFeedPath(name)]
			]) {
				// empieza con «/»: el «:» no se lee como esquema (como en «mailto:»)
				const url = new URL(path, 'https://kinkyvibe.ar');
				expect(url.origin).toBe('https://kinkyvibe.ar');
				expect(url.pathname).toBe(path);
				const segment = decodeURIComponent(url.pathname.slice(prefix.length));
				expect(tagIdFromSlug(tm, segment.replace(/\.ics$/, ''))).toBe(name);
			}
		}
	});

	it('los links con el nombre tal cual (/wiki/<id>, /todo?tags=<id>) llevan a la serie', () => {
		const tm = tagsFactory();
		for (const [name] of NAMES) {
			// como `href="/wiki/{termino.id}"`: el navegador codifica el espacio
			const wiki = new URL(`/wiki/${name}`, 'https://kinkyvibe.ar');
			expect(wiki.origin).toBe('https://kinkyvibe.ar');
			const segment = decodeURIComponent(wiki.pathname.slice('/wiki/'.length));
			expect(tagIdFromSlug(tm, segment)).toBe(name);
			// los chips de filtro: ?tags=a,b (el «:» no separa)
			const todo = new URL(`/todo?tags=${name},BDSM`, 'https://kinkyvibe.ar');
			expect(readSearchParams(todo).tags).toEqual([name, 'BDSM']);
			const written = writeSearchParams(new URL('https://kinkyvibe.ar/todo'), {
				tags: [name, 'BDSM'],
				text: ''
			});
			expect(readSearchParams(written).tags).toEqual([name, 'BDSM']);
		}
	});
});
