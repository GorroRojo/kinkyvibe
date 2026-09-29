import { describe, it, expect } from 'vitest';
import {
	fold,
	tokenize,
	stripMarkdown,
	truncate,
	editDistance,
	matchQuality,
	queryTerms,
	prepareIndex,
	search,
	groupHits,
	highlight,
	snippet,
	matchedNames
} from './search';

describe('fold / tokenize', () => {
	it('saca tildes y pasa a minúsculas', () => {
		expect(fold('Sumisión ÑANDÚ Pingüino')).toBe('sumision nandu pinguino');
	});
	it('conserva la longitud (para resaltar el texto original)', () => {
		const s = 'Árbol, acción y ÉXITO 🎉 çà';
		expect(fold(s).length).toBe(s.length);
	});
	it('parte en palabras normalizadas', () => {
		expect(tokenize('¿Qué es el shibari? ¡Cuerdas!')).toEqual([
			'que',
			'es',
			'el',
			'shibari',
			'cuerdas'
		]);
		expect(tokenize('Gorro_Rojo')).toEqual(['gorro', 'rojo']);
	});
	it('ignora palabras vacías salvo que no quede otra cosa', () => {
		expect(queryTerms('taller de cuerdas')).toEqual(['taller', 'cuerdas']);
		expect(queryTerms('de la')).toEqual(['de', 'la']);
	});
});

describe('stripMarkdown', () => {
	it('saca frontmatter, script, style, HTML, Svelte y sintaxis markdown', () => {
		const md = `---
title: Hola
tags:
  - a
---

<script>
	import x from './x.webp';
</script>

## TEMARIO ##

- Un **taller** de _bondage_ con [cuerdas](https://example.com) y [[shibari : kinbaku]].
- ![foto](x.png) <small>texto chico</small> {#if x}condicional{/if} {variable}

> Una cita &amp; más: https://example.com/algo

<style>.a { color: red; }</style>`;
		expect(stripMarkdown(md)).toBe(
			'TEMARIO Un taller de bondage con cuerdas y kinbaku. texto chico condicional Una cita & más:'
		);
	});
	it('mantiene guiones bajos dentro de palabras', () => {
		expect(stripMarkdown('hola Gorro_Rojo __fuerte__')).toBe('hola Gorro_Rojo fuerte');
	});
	it('trunca en un espacio', () => {
		expect(truncate('uno dos tres cuatro', 14)).toBe('uno dos tres…');
		expect(truncate('corto', 10)).toBe('corto');
	});
});

describe('matchQuality', () => {
	it('exacto > prefijo > error de tipeo', () => {
		expect(matchQuality('bondage', 'bondage')).toBe(1);
		const prefix = matchQuality('bond', 'bondage');
		const typo = matchQuality('bondaje', 'bondage');
		expect(prefix).toBeGreaterThan(typo);
		expect(typo).toBeGreaterThan(0);
	});
	it('tolera transposiciones y errores en prefijos', () => {
		expect(editDistance('cosnentimiento', 'consentimiento', 2)).toBe(1);
		expect(editDistance('abcdef', 'badcfe', 2)).toBe(3);
		expect(matchQuality('consentimeinto', 'consentimiento')).toBeGreaterThan(0);
		expect(matchQuality('consentimeinto', 'consentimientos')).toBeGreaterThan(0);
		expect(matchQuality('cuerdsa', 'cuerdas')).toBeGreaterThan(0);
	});
	it('no es difuso con términos cortos', () => {
		expect(matchQuality('sol', 'sal')).toBe(0);
		expect(matchQuality('a', 'agujas')).toBe(0);
	});
});

/** @type {import('./search').RawSearchIndex} */
const raw = {
	v: 1,
	tags: { shibari: ['bondage japonés', 'kinbaku'] },
	docs: [
		{ c: 'material', h: '/material/cuerpo', t: 'Otro texto', b: 'Hablamos de shibari al pasar.' },
		{ c: 'material', h: '/material/titulo', t: 'Shibari para principiantes' },
		{ c: 'material', h: '/material/resumen', t: 'Guía', s: 'Todo sobre shibari' },
		{ c: 'material', h: '/material/tags', t: 'Cuerdas', g: ['shibari'] },
		{
			c: 'calendario',
			h: '/calendario/viejo',
			t: 'Taller de shibari',
			d: '2020-01-01T20:00:00.000Z'
		},
		{
			c: 'calendario',
			h: '/calendario/nuevo',
			t: 'Taller de shibari',
			d: '2099-01-01T20:00:00.000Z'
		},
		{ c: 'amigues', h: '/amigues/Gorro_Rojo', t: 'Gorro Rojo', a: ['Gorro_Rojo'] },
		{ c: 'wiki', h: '/wiki/shibari', t: 'shibari', g: ['shibari'], k: ['kinbaku'] }
	]
};

describe('search', () => {
	const index = prepareIndex(raw);
	const hrefs = (/** @type {string} */ q) => search(index, q).map((h) => h.doc.h);

	it('rankea título > tags > resumen > cuerpo', () => {
		const order = hrefs('shibari').filter((h) => h.startsWith('/material/'));
		expect(order).toEqual([
			'/material/titulo',
			'/material/tags',
			'/material/resumen',
			'/material/cuerpo'
		]);
	});
	it('es insensible a tildes y encuentra alias de tags', () => {
		expect(hrefs('JAPONES')).toContain('/material/tags');
		expect(hrefs('kinbaku')[0]).toBe('/wiki/shibari');
	});
	it('tolera errores de tipeo y busca por prefijo', () => {
		expect(hrefs('shibar')).toContain('/material/titulo');
		expect(hrefs('shibary')).toContain('/material/titulo');
		expect(hrefs('principantes')).toEqual(['/material/titulo']);
	});
	it('requiere todos los términos', () => {
		expect(hrefs('shibari principiantes')).toEqual(['/material/titulo']);
		expect(hrefs('shibari zzzz')).toEqual([]);
	});
	it('busca por autore', () => {
		expect(hrefs('gorro rojo')).toEqual(['/amigues/Gorro_Rojo']);
	});
	it('agrupa en el orden pedido separando eventos próximos y pasados', () => {
		const groups = groupHits(search(index, 'shibari'), new Date('2025-01-01').getTime());
		expect(groups.map((g) => g.key)).toEqual(['proximos', 'material', 'wiki', 'pasados']);
		expect(groups[0].hits[0].doc.h).toBe('/calendario/nuevo');
	});
});

describe('highlight / snippet', () => {
	it('resalta respetando el texto original', () => {
		const parts = highlight('Sumisión y dominación', new Set(['sumision']));
		expect(parts).toEqual([
			{ text: 'Sumisión', hit: true },
			{ text: ' y dominación', hit: false }
		]);
	});
	it('arma un fragmento alrededor de la coincidencia en el cuerpo', () => {
		const b = 'palabra '.repeat(50) + 'Consentimiento informado ' + 'relleno '.repeat(50);
		const parts = snippet({ c: 'material', h: '/x', t: 'x', b }, new Set(['consentimiento']), 80);
		expect(parts[0].text).toBe('…');
		expect(parts.find((p) => p.hit)?.text).toBe('Consentimiento');
		expect(parts.map((p) => p.text).join('').length).toBeLessThan(90);
	});
});

describe('matchedNames', () => {
	it('explica coincidencias por alias de tags y otros nombres', () => {
		const index = prepareIndex(raw);
		const [hit] = search(index, 'japones');
		expect(matchedNames(index, hit.doc, hit.words)).toEqual(['shibari (bondage japonés)']);
		const wiki = search(index, 'kinbaku').find((h) => h.doc.c === 'wiki');
		expect(wiki && matchedNames(index, wiki.doc, wiki.words)).toContain('kinbaku');
	});
});
