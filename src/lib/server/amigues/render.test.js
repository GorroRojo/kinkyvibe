/**
 * El texto de los perfiles de la base, en HTML limpio: markdown, la lista corta de HTML, las
 * imágenes de las fichas viejas (mdsvex) y lo que nunca puede pasar (XSS).
 */
import { describe, expect, it } from 'vitest';
import { renderProfileBody, resolveMediaImports } from './render.js';
import { rehype } from 'rehype';
import { safeUrl } from './sanitize.js';

/** @param {string} body */
const render = (body) => renderProfileBody(body, { resolveMedia: (f) => `/media/${f}` });

describe('markdown y la lista corta de HTML', () => {
	it('markdown, <small>, menciones y wiki', async () => {
		const html = await render(
			'Hola **mundo** <small>(chiquito)</small>, con @Alguien y [[bondage]].\n\n- uno\n- dos'
		);
		expect(html).toContain('<strong>mundo</strong>');
		expect(html).toContain('<small>(chiquito)</small>');
		expect(html).toMatch(
			/<a (class="mention" href="\/amigues\/Alguien"|href="\/amigues\/Alguien" class="mention")>@Alguien<\/a>/
		);
		expect(html).toContain('href="/wiki/bondage"');
		expect(html).toContain('<li>uno</li>');
	});

	it('los links de afuera abren aparte, sin referrer', async () => {
		const html = await render('[sitio](https://example.com/x)');
		expect(html).toMatch(
			/<a href="https:\/\/example\.com\/x" target="_blank" rel="noopener noreferrer nofollow">/
		);
	});

	it('las imágenes que importaba mdsvex se resuelven a la carpeta de medios', async () => {
		const body =
			"<script>\n  import foto from './media/Ficha/5.webp'\n  import otra from '$lib/posts/amigues/media/Ficha/spoiler.webp'\n</script>\n\n<img src={foto} alt=\"\">\n\n![x]({otra}) y {noEsImagen}";
		expect(resolveMediaImports(body, (f) => `/m/${f}`)).toContain('src="/m/5.webp"');
		const html = await render(body);
		expect(html).toContain('src="/media/5.webp"');
		expect(html).toContain('src="/media/spoiler.webp"');
		expect(html).not.toContain('<script');
		expect(html).toContain('{noEsImagen}');
	});

	it('un h1 pasa a h2 (el h1 es el nombre del perfil)', async () => {
		expect(await render('# Título')).toContain('<h2>Título</h2>');
	});
});

describe('nada activo pasa', () => {
	const attacks = [
		'<script>alert(1)</script>',
		'<img src=x onerror="alert(1)">',
		'<a href="javascript:alert(1)">x</a>',
		'<a href="JaVaScRiPt:alert(1)">x</a>',
		'<a href="java\tscript:alert(1)">x</a>',
		'[x](javascript:alert(1))',
		'<img src="data:image/svg+xml,<svg onload=alert(1)>">',
		'<iframe src="https://example.com"></iframe>',
		'<svg><script>alert(1)</script></svg>',
		'<p style="background:url(javascript:alert(1))">x</p>',
		'<form action="https://example.com"><input name=a><button>ok</button></form>',
		'<div onclick="alert(1)">x</div>',
		'<object data="x"></object><embed src="x">',
		'<style>body{display:none}</style>',
		'<meta http-equiv="refresh" content="0;url=https://example.com">',
		'<a href="vbscript:msgbox(1)">x</a>',
		'<math><mtext><img src=x onerror=alert(1)></mtext></math>',
		'<template><img src=x onerror=alert(1)></template>',
		'<scr<script></script>ipt>alert(1)</script>',
		// Bypasses clásicos que señalan las docs de hast-util-sanitize / DOMPurify:
		'<a href="&#106;avascript:alert(1)">x</a>',
		'<a href="&#x6A;avascript&colon;alert(1)">x</a>',
		'<a href=" javascript:alert(1)">x</a>',
		'<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
		'<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
		'<img src="javascript:alert(1)">',
		'<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'
	];
	for (const a of attacks) {
		it(a, async () => {
			const html = await render(a);
			expect(html).not.toMatch(
				/<script|<iframe|<svg|<form|<object|<embed|<style|<meta|<math|<template/i
			);
			expect(html).not.toMatch(/\son\w+=/i);
			expect(html).not.toMatch(/javascript:|vbscript:|data:image/i);
			expect(html).not.toMatch(/style=/i);
		});
	}
});

describe('mXSS con <noscript>', () => {
	it('lo que parece etiqueta dentro de un atributo queda como texto del atributo', async () => {
		const html = await render(
			'<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>'
		);
		// Se vuelve a leer como lo leería el navegador: ningún elemento activo ni atributo on….
		const tree = rehype().data('settings', { fragment: true }).parse(html);
		/** @type {string[]} */
		const found = [];
		/** @param {any} node */
		const walk = (node) => {
			for (const c of node.children ?? []) {
				if (c.type !== 'element') continue;
				found.push(c.tagName, ...Object.keys(c.properties ?? {}).filter((k) => /^on/i.test(k)));
				walk(c);
			}
		};
		walk(tree);
		expect(found).not.toContain('img');
		expect(found).not.toContain('noscript');
		expect(found.filter((x) => /^on/i.test(x))).toEqual([]);
	});
});

describe('DOM clobbering', () => {
	it('los id y name llevan prefijo (no pisan variables globales de la página)', async () => {
		const html = await render('<span id="location" name="cookie">x</span>');
		expect(html).toContain('id="user-content-location"');
		expect(html).not.toMatch(/id="location"/);
	});
});

describe('safeUrl', () => {
	it('deja web, mail, teléfono, rutas del sitio y anclas', () => {
		expect(safeUrl('https://example.com')).toBe('https://example.com');
		expect(safeUrl('mailto:a@example.com')).toBe('mailto:a@example.com');
		expect(safeUrl('tel:+5491100000000')).toBe('tel:+5491100000000');
		expect(safeUrl('/calendario?tags=x')).toBe('/calendario?tags=x');
		expect(safeUrl('#arriba')).toBe('#arriba');
	});
	it('saca lo demás; las imágenes, solo web y rutas', () => {
		expect(safeUrl('javascript:alert(1)')).toBeNull();
		expect(safeUrl(' java\nscript:alert(1)')).toBeNull();
		expect(safeUrl('data:text/html,x')).toBeNull();
		expect(safeUrl('mailto:a@example.com', { image: true })).toBeNull();
		expect(safeUrl('#x', { image: true })).toBeNull();
		expect(safeUrl('/media/5.webp', { image: true })).toBe('/media/5.webp');
	});
});
