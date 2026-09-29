import { describe, it, expect } from 'vitest';
import tagsFactory from './tags';
import {
	normalizeText,
	filterPosts,
	suggestTags,
	readSearchParams,
	writeSearchParams
} from './postSearch';

const makeTM = () =>
	tagsFactory(
		/** @type {any} */ ([
			{ id: 'root', children: ['lugar', 'prácticas'] },
			{ id: 'lugar', children: ['Online', 'Presencial'] },
			{ id: 'Online' },
			{ id: 'Presencial', children: ['Argentina'] },
			{ id: 'Argentina', children: ['Córdoba', 'AMBA'] },
			{ id: 'Córdoba' },
			{ id: 'AMBA' },
			{ id: 'prácticas', children: ['bondage', 'impact play'] },
			{ id: 'bondage', aka: ['ataduras', 'shibari'] },
			{ id: 'impact play', aka: ['spanking'] }
		])
	);

/** @param {string} title @param {string[]} tags @param {string} [summary] */
const post = (title, tags, summary = '') => ({ path: title, meta: { title, tags, summary } });

const posts = [
	post('Taller de cuerdas', ['bondage', 'Córdoba'], 'Nudos básicos'),
	post('Charla online de impacto', ['impact play', 'Online'], 'Seguridad'),
	post('Fiesta en AMBA', ['AMBA', 'impact play', 'bondage']),
	post('Guía de shibari', ['shibari', 'Online'], 'Material descargable')
];
const titles = (/** @type {any[]} */ ps) => ps.map((p) => p.meta.title);

describe('normalizeText', () => {
	it('lowercases and strips accents', () => {
		expect(normalizeText('  Córdoba ÁÉÍÓÚ ')).toBe('cordoba aeiou');
	});
});

describe('filterPosts', () => {
	it('returns every post with no search', () => {
		expect(filterPosts(posts, {}, makeTM())).toBe(posts);
	});
	it('memoizes per tag manager, so another hierarchy is not served stale results', () => {
		const tm = makeTM();
		expect(titles(filterPosts(posts, { tags: ['Presencial'] }, tm))).toHaveLength(2);
		// same posts, same manager again: same answer from the memo
		expect(titles(filterPosts(posts, { tags: ['Presencial'] }, tm))).toHaveLength(2);
		// a manager where Argentina is not under Presencial
		const flat = tagsFactory(
			/** @type {any} */ ([
				{ id: 'root', children: ['Presencial', 'Argentina'] },
				{ id: 'Presencial' },
				{ id: 'Argentina', children: ['Córdoba', 'AMBA'] }
			])
		);
		expect(titles(filterPosts(posts, { tags: ['Presencial'] }, flat))).toEqual([]);
	});
	it('combines tags with AND', () => {
		const res = filterPosts(posts, { tags: ['bondage', 'impact play'] }, makeTM());
		expect(titles(res)).toEqual(['Fiesta en AMBA']);
	});
	it('matches descendants when a parent tag is selected', () => {
		const tm = makeTM();
		expect(titles(filterPosts(posts, { tags: ['Presencial'] }, tm))).toEqual([
			'Taller de cuerdas',
			'Fiesta en AMBA'
		]);
		expect(titles(filterPosts(posts, { tags: ['Argentina', 'impact play'] }, tm))).toEqual([
			'Fiesta en AMBA'
		]);
	});
	it('resolves aliases both in the query and in post tags', () => {
		const tm = makeTM();
		const expected = ['Taller de cuerdas', 'Fiesta en AMBA', 'Guía de shibari'];
		expect(titles(filterPosts(posts, { tags: ['bondage'] }, tm))).toEqual(expected);
		expect(titles(filterPosts(posts, { tags: ['ataduras'] }, tm))).toEqual(expected);
	});
	it('filters by free text over title, summary and tag names (accent-insensitive)', () => {
		const tm = makeTM();
		expect(titles(filterPosts(posts, { text: 'guia' }, tm))).toEqual(['Guía de shibari']);
		expect(titles(filterPosts(posts, { text: 'nudos' }, tm))).toEqual(['Taller de cuerdas']);
		expect(titles(filterPosts(posts, { text: 'cordoba' }, tm))).toEqual(['Taller de cuerdas']);
		expect(titles(filterPosts(posts, { text: 'charla seguridad' }, tm))).toEqual([
			'Charla online de impacto'
		]);
		expect(filterPosts(posts, { text: 'zzz' }, tm)).toEqual([]);
	});
	it('combines tags and text', () => {
		const res = filterPosts(posts, { tags: ['Online'], text: 'guía' }, makeTM());
		expect(titles(res)).toEqual(['Guía de shibari']);
	});
	it('tolerates posts without tags', () => {
		// @ts-ignore
		expect(filterPosts([{ meta: { title: 'x' } }], { tags: ['bondage'] }, makeTM())).toEqual([]);
	});
});

describe('suggestTags', () => {
	it('only suggests tags present in the posts, with counts, including ancestors', () => {
		const res = suggestTags(posts, {}, makeTM());
		const byId = Object.fromEntries(res.map((s) => [s.id, s.count]));
		expect(byId.bondage).toBe(3);
		expect(byId['impact play']).toBe(2);
		expect(byId.Presencial).toBe(2);
		expect(byId.Argentina).toBe(2);
		expect(byId.shibari).toBeUndefined();
		expect(byId.root).toBeUndefined();
		// every post has "prácticas", so it would not narrow anything down
		expect(byId['prácticas']).toBeUndefined();
	});
	it('matches by prefix, accent-insensitive, best matches first', () => {
		const res = suggestTags(posts, { text: 'cor' }, makeTM());
		expect(res[0].id).toBe('Córdoba');
	});
	it('matches aliases and reports which alias matched', () => {
		const res = suggestTags(posts, { text: 'spank' }, makeTM());
		expect(res).toHaveLength(1);
		expect(res[0]).toMatchObject({ id: 'impact play', alias: 'spanking' });
	});
	it('ranks the tag name above an alias and above substring matches', () => {
		const res = suggestTags(posts, { text: 'on' }, makeTM());
		expect(res[0].id).toBe('Online');
	});
	it('excludes already selected tags, including by alias', () => {
		const tm = makeTM();
		const res = suggestTags(posts, { selected: ['ataduras'] }, tm);
		expect(res.map((s) => s.id)).not.toContain('bondage');
	});
	it('lists top-level groups after specific tags when there is no query', () => {
		const more = [...posts, post('Sin lugar', ['bondage'])];
		const ids = suggestTags(more, {}, makeTM()).map((s) => s.id);
		expect(ids.indexOf('lugar')).toBeGreaterThan(ids.indexOf('Online'));
		expect(ids[ids.length - 1]).toBe('lugar');
	});
	it('respects the limit', () => {
		expect(suggestTags(posts, { limit: 2 }, makeTM())).toHaveLength(2);
	});
});

describe('search params', () => {
	it('reads tags and text', () => {
		const url = new URL('https://x.test/material?tags=bondage,Online&q=hola%20mundo');
		expect(readSearchParams(url)).toEqual({ tags: ['bondage', 'Online'], text: 'hola mundo' });
		expect(readSearchParams(new URL('https://x.test/?tags='))).toEqual({ tags: [], text: '' });
	});
	it('writes and removes params, keeping others', () => {
		const url = new URL('https://x.test/material?foo=1&q=viejo');
		const next = writeSearchParams(url, { tags: ['a la gorra', 'Online'], text: '' });
		expect(next.searchParams.get('tags')).toBe('a la gorra,Online');
		expect(next.searchParams.has('q')).toBe(false);
		expect(next.search).toContain('tags=a+la+gorra,Online');
		expect(next.searchParams.get('foo')).toBe('1');
		expect(url.searchParams.get('q')).toBe('viejo');
	});
	it('supports custom param names', () => {
		const url = new URL('https://x.test/?rt=bondage&rq=x');
		expect(readSearchParams(url, { tags: 'rt', q: 'rq' })).toEqual({
			tags: ['bondage'],
			text: 'x'
		});
	});
});
