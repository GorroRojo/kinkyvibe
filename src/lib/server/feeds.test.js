import { describe, expect, it, vi } from 'vitest';
import tagsFactory from '$lib/utils/tags';

const POSTS = [
	{
		path: '/calendario/taller-inventado-2031-08',
		meta: {
			category: 'calendario',
			title: 'Taller inventado',
			start: '2031-08-01T20:00-03:00',
			published_date: '2031-07-01',
			tags: ['shibari']
		}
	},
	{
		path: '/material/guia-inventada',
		meta: { category: 'material', title: 'Guía inventada', published_date: '2031-06-01', tags: [] }
	}
];
vi.mock('$lib/server/contenido/posts.js', () => ({ sitePosts: async () => POSTS }));
vi.mock('$lib/server/etiquetas/source.js', () => ({ siteTagManager: async () => tagsFactory() }));

const { sectionFeed, tagFeed } = await import('./feeds.js');

describe('feeds de sección', () => {
	it('/calendario/feed.atom: Atom, solo eventos', async () => {
		const res = await sectionFeed(undefined, 'calendario', 'atom');
		expect(res.headers.get('content-type')).toBe('application/atom+xml; charset=utf-8');
		const xml = await res.text();
		expect(xml).toContain(
			'<link rel="self" type="application/atom+xml" href="https://kinkyvibe.ar/calendario/feed.atom"/>'
		);
		expect(xml).toContain('Taller inventado');
		expect(xml).not.toContain('Guía inventada');
	});

	it('/material/feed.json: JSON Feed, solo material', async () => {
		const res = await sectionFeed(undefined, 'material', 'json');
		expect(res.headers.get('content-type')).toBe('application/feed+json; charset=utf-8');
		const json = JSON.parse(await res.text());
		expect(json.feed_url).toBe('https://kinkyvibe.ar/material/feed.json');
		expect(json.items.map((/** @type {any} */ i) => i.title)).toEqual(['Guía inventada']);
	});
});

describe('feeds de etiqueta', () => {
	it('la etiqueta y sus hijas (shibari está debajo de cuerdas)', async () => {
		const res = await tagFeed(undefined, 'cuerdas', 'json');
		const json = JSON.parse(await res.text());
		expect(json.title).toBe('cuerdas · Kinky Vibe');
		expect(json.home_page_url).toBe('https://kinkyvibe.ar/wiki/cuerdas');
		expect(json.items.map((/** @type {any} */ i) => i.title)).toEqual(['Taller inventado']);
	});

	it('404 si la etiqueta no existe o no tiene nada', async () => {
		await expect(tagFeed(undefined, 'no-existe-esta-etiqueta', 'atom')).rejects.toMatchObject({
			status: 404
		});
		await expect(tagFeed(undefined, 'protocolo', 'atom')).rejects.toMatchObject({ status: 404 });
	});
});
