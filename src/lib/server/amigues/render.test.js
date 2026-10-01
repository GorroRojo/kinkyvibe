/**
 * El texto de los perfiles de la base, en HTML limpio: markdown, la lista corta de HTML, las
 * imágenes de las fichas viejas (mdsvex) y lo que nunca puede pasar (XSS).
 */
import { describe, expect, it } from 'vitest';
import { renderProfileBody, resolveMediaImports } from './render.js';
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
		'<scr<script></script>ipt>alert(1)</script>'
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
