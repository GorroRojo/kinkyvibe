import { describe, expect, it } from 'vitest';
import {
	FEED_LIMIT,
	atomFeed,
	escapeXml,
	feedEntry,
	feedPosts,
	jsonFeed,
	rfc3339
} from './feeds.js';

/**
 * @typedef {{ name: string, attrs: Record<string, string>, children: XmlNode[], text: string }} XmlNode
 */

/**
 * Un lector de XML chiquito y estricto (el proyecto no tiene uno): falla con etiquetas mal
 * cerradas, `&` sueltos, `<` en el texto o atributos sin comillas. Devuelve el árbol.
 * @param {string} xml
 * @returns {XmlNode}
 */
function parseXml(xml) {
	const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;
	/** @param {string} s */
	const decode = (s) => {
		if (/&/.test(s.replace(ENTITY, ''))) throw new Error(`& suelto en ${JSON.stringify(s)}`);
		return s
			.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&quot;', '"')
			.replaceAll('&apos;', "'")
			.replaceAll('&amp;', '&');
	};
	let rest = xml.replace(/^<\?xml [^?]*\?>\s*/, '');
	/** @type {XmlNode} */
	const root = { name: '#root', attrs: {}, children: [], text: '' };
	const stack = [root];
	while (rest.length) {
		const lt = rest.indexOf('<');
		const text = lt === -1 ? rest : rest.slice(0, lt);
		if (text.includes('>')) throw new Error(`> suelto en ${JSON.stringify(text)}`);
		stack[stack.length - 1].text += decode(text);
		if (lt === -1) break;
		rest = rest.slice(lt);
		const close = rest.match(/^<\/([\w:-]+)\s*>/);
		if (close) {
			const node = stack.pop();
			if (node?.name !== close[1]) throw new Error(`</${close[1]}> cierra <${node?.name}>`);
			rest = rest.slice(close[0].length);
			continue;
		}
		const open = rest.match(/^<([\w:-]+)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/);
		if (!open) throw new Error(`etiqueta inválida: ${rest.slice(0, 40)}`);
		/** @type {Record<string, string>} */
		const attrs = {};
		for (const [, k, v] of open[2].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[k] = decode(v);
		/** @type {XmlNode} */
		const node = { name: open[1], attrs, children: [], text: '' };
		stack[stack.length - 1].children.push(node);
		if (!open[3]) stack.push(node);
		rest = rest.slice(open[0].length);
	}
	if (stack.length !== 1) throw new Error(`sin cerrar: <${stack[stack.length - 1].name}>`);
	if (root.children.length !== 1) throw new Error('tiene que haber un solo elemento raíz');
	return root.children[0];
}

/** @param {XmlNode} node @param {string} name */
const child = (node, name) => node.children.find((c) => c.name === name);
/** @param {XmlNode} node @param {string} name */
const all = (node, name) => node.children.filter((c) => c.name === name);

/** @param {string} path @param {Record<string, any>} meta */
const post = (path, meta) => /** @type {ProcessedPost} */ ({ path, meta });

const EVENT = post('/calendario/fiesta-inventada-2031-08', {
	category: 'calendario',
	title: 'Fiesta <inventada> & "amigues"',
	summary: "Un evento de prueba con 'comillas' y un \u0001 control.",
	start: '2031-08-01T20:00-03:00',
	published_date: '2031-07-01Z-03:00',
	authors: ['KinkyVibe'],
	tags: ['fiesta', 'AMBA'],
	featured: '/media/img/afiche.webp',
	location: 'Calle Falsa 123',
	location_name: 'Lugar Secreto'
});
const GUIDE = post('/material/guia-inventada', {
	category: 'material',
	title: 'Guía inventada',
	summary: 'Una guía.',
	published_date: '2031-06-01',
	updated_date: '2031-06-15',
	authors: ['Persona Inventada'],
	tags: ['BDSM']
});

/** @param {ReturnType<typeof feedEntry>[]} entries */
const feedOf = (entries) => ({
	title: 'Calendario · Kinky Vibe',
	description: 'Eventos & talleres.',
	homeUrl: 'https://kinkyvibe.ar/calendario',
	feedUrl: 'https://kinkyvibe.ar/calendario/feed.atom',
	entries
});

describe('rfc3339 y escapeXml', () => {
	it('fechas del sitio a RFC 3339; inválidas, nada', () => {
		expect(rfc3339('2031-07-01Z-03:00')).toBe('2031-07-01T03:00:00.000Z');
		expect(rfc3339('2031-08-01T20:00-03:00')).toBe('2031-08-01T23:00:00.000Z');
		expect(rfc3339('no')).toBeUndefined();
		expect(rfc3339(undefined)).toBeUndefined();
	});
	it('escapa los cinco caracteres de XML y saca los de control', () => {
		expect(escapeXml(`<a href="x">&'\u0001`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
	});
});

describe('feedEntry', () => {
	it('un evento: la fecha en el resumen y nunca el lugar', () => {
		const e = feedEntry(EVENT);
		expect(e.url).toBe('https://kinkyvibe.ar/calendario/fiesta-inventada-2031-08');
		expect(e.id).toBe(e.url);
		expect(e.summary.startsWith('viernes 1 de agosto de 2031, 20:00 · ')).toBe(true);
		expect(JSON.stringify(e)).not.toContain('Calle Falsa');
		expect(JSON.stringify(e)).not.toContain('Lugar Secreto');
		expect(e.image).toBe('https://kinkyvibe.ar/media/img/afiche.webp');
		expect(e.published).toBe('2031-07-01T03:00:00.000Z');
	});
	it('un evento cancelado lo dice', () => {
		expect(feedEntry(post(EVENT.path, { ...EVENT.meta, status: 'cancelado' })).summary).toMatch(
			/^Cancelado · /
		);
	});
});

describe('feedPosts', () => {
	it('filtra por categoría y etiqueta, sin redirecciones, más nuevas primero', () => {
		const redirect = post('/material/en-la-tienda', {
			category: 'material',
			title: 'En la tienda',
			redirect: true,
			published_date: '2032-01-01'
		});
		const profile = post('/amigues/Persona', { category: 'amigues', tags: ['BDSM'] });
		const posts = [GUIDE, EVENT, redirect, profile];
		expect(feedPosts(posts, { categories: ['calendario', 'material'] }).map((p) => p.path)).toEqual(
			[EVENT.path, GUIDE.path]
		);
		expect(
			feedPosts(posts, { categories: ['calendario', 'material'], tags: new Set(['BDSM']) }).map(
				(p) => p.path
			)
		).toEqual([GUIDE.path]);
	});
	it(`lista hasta ${FEED_LIMIT}`, () => {
		const many = Array.from({ length: FEED_LIMIT + 5 }, (_, i) =>
			post(`/material/m${i}`, { category: 'material', title: `M${i}` })
		);
		expect(feedPosts(many, { categories: ['material'] })).toHaveLength(FEED_LIMIT);
	});
});

describe('atomFeed', () => {
	const xml = atomFeed(feedOf([feedEntry(EVENT), feedEntry(GUIDE)]));
	const feed = parseXml(xml);

	it('es XML bien formado con la raíz de Atom', () => {
		expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
		expect(feed.name).toBe('feed');
		expect(feed.attrs.xmlns).toBe('http://www.w3.org/2005/Atom');
	});

	it('tiene lo que pide la RFC 4287: id, title, updated, author y link self', () => {
		expect(child(feed, 'id')?.text).toBe('https://kinkyvibe.ar/calendario/feed.atom');
		expect(child(feed, 'title')?.text).toBe('Calendario · Kinky Vibe');
		expect(child(feed, 'subtitle')?.text).toBe('Eventos & talleres.');
		expect(child(feed, 'updated')?.text).toMatch(/^\d{4}-\d\d-\d\dT/);
		expect(child(child(feed, 'author') ?? feed, 'name')?.text).toBe('Kinky Vibe');
		const self = all(feed, 'link').find((l) => l.attrs.rel === 'self');
		expect(self?.attrs.href).toBe('https://kinkyvibe.ar/calendario/feed.atom');
	});

	it('cada entrada con id, title, updated y link; el texto escapado vuelve igual', () => {
		const entries = all(feed, 'entry');
		expect(entries).toHaveLength(2);
		for (const e of entries) {
			expect(child(e, 'id')?.text).toMatch(/^https:\/\/kinkyvibe\.ar\//);
			expect(child(e, 'updated')?.text).toMatch(/^\d{4}-\d\d-\d\dT/);
			expect(child(e, 'link')?.attrs.href).toBe(child(e, 'id')?.text);
		}
		expect(child(entries[0], 'title')?.text).toBe('Fiesta <inventada> & "amigues"');
		expect(child(entries[0], 'summary')?.text).toContain("'comillas'");
		expect(child(entries[0], 'summary')?.text).not.toContain('\u0001');
		expect(all(entries[0], 'category').map((c) => c.attrs.term)).toEqual(['fiesta', 'AMBA']);
		expect(child(child(entries[1], 'author') ?? entries[1], 'name')?.text).toBe(
			'Persona Inventada'
		);
	});

	it('un feed sin entradas también es válido', () => {
		expect(parseXml(atomFeed(feedOf([]))).name).toBe('feed');
	});
});

describe('jsonFeed', () => {
	const json = JSON.parse(jsonFeed(feedOf([feedEntry(EVENT), feedEntry(GUIDE)])));

	it('es JSON Feed 1.1 con lo obligatorio', () => {
		expect(json.version).toBe('https://jsonfeed.org/version/1.1');
		expect(json.title).toBe('Calendario · Kinky Vibe');
		expect(json.feed_url).toBe('https://kinkyvibe.ar/calendario/feed.atom');
		expect(json.home_page_url).toBe('https://kinkyvibe.ar/calendario');
		expect(Array.isArray(json.items)).toBe(true);
	});

	it('cada item con id y texto; los caracteres especiales viajan tal cual', () => {
		for (const item of json.items) {
			expect(typeof item.id).toBe('string');
			expect(item.content_text || item.content_html).toBeTruthy();
		}
		expect(json.items[0].title).toBe('Fiesta <inventada> & "amigues"');
		expect(json.items[0].date_published).toBe('2031-07-01T03:00:00.000Z');
		expect(json.items[0].tags).toEqual(['fiesta', 'AMBA']);
		expect(json.items[1].authors).toEqual([{ name: 'Persona Inventada' }]);
		expect(json.items[1].date_modified).toBe('2031-06-15T00:00:00.000Z');
	});
});
