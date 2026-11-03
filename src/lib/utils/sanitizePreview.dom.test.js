/**
 * La limpieza de la vista previa del editor (DOMPurify + el filtro de antes), en jsdom: payloads
 * de XSS conocidos no dejan nada activo, y el contenido normal (markdown, links, imágenes, los
 * embeds que usa el sitio y el material y la wiki de la semilla) pasa igual.
 */
import { describe, expect, it } from 'vitest';
import { renderPreviewHtml } from './markdownPreview.js';
import { sanitizePreview } from './sanitizePreview.js';
import { seedFiles } from '$lib/server/semilla/testing.js';

const ACTIVE =
	'script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select,svg,math,noscript,template,frame,frameset';

/** @param {string} html */
function mount(html) {
	const el = document.createElement('div');
	el.innerHTML = html;
	return el;
}

/** @param {string} value */
const scheme = (value) =>
	[...value.replace(/\s+/g, '')]
		.filter((c) => c.charCodeAt(0) >= 0x20)
		.join('')
		.toLowerCase();

/**
 * Nada activo en el HTML limpio, insertado como lo inserta `{@html}`.
 * @param {string} html
 */
function expectInert(html) {
	const el = mount(html);
	expect(el.querySelectorAll(ACTIVE)).toHaveLength(0);
	for (const node of el.querySelectorAll('*')) {
		for (const attr of node.attributes) {
			const name = attr.name.toLowerCase();
			expect(name.startsWith('on'), `${node.tagName} ${name}`).toBe(false);
			expect(['style', 'srcdoc', 'action', 'formaction']).not.toContain(name);
			if (['href', 'src', 'xlink:href', 'poster', 'background'].includes(name)) {
				expect(scheme(attr.value)).not.toMatch(/^(javascript|data|vbscript):/);
			}
		}
	}
}

describe('sanitizePreview: XSS conocidos', () => {
	const payloads = [
		'<script>alert(1)</script>',
		'<SCRIPT SRC=//example.com/x.js></SCRIPT>',
		'<img src=x onerror=alert(1)>',
		'<img src="x" ONERROR="alert(1)">',
		'<svg onload=alert(1)>',
		'<svg><script>alert(1)</script></svg>',
		'<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
		'<a href="javascript:alert(1)">x</a>',
		'<a href=" JaVaScRiPt:alert(1)">x</a>',
		'<a href="jav&#x09;ascript:alert(1)">x</a>',
		'<a href="&#106;avascript:alert(1)">x</a>',
		'<a href="java\u0001script:alert(1)">x</a>',
		'<a href="vbscript:msgbox(1)">x</a>',
		'<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
		'<img src="data:image/svg+xml;base64,PHN2Zy8+">',
		'<iframe src="javascript:alert(1)"></iframe>',
		'<iframe srcdoc="<script>alert(1)</script>"></iframe>',
		'<object data="javascript:alert(1)"></object>',
		'<embed src="javascript:alert(1)">',
		'<form action="javascript:alert(1)"><button>enviar</button></form>',
		'<button formaction="javascript:alert(1)">x</button>',
		'<input autofocus onfocus=alert(1)>',
		'<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
		'<base href="javascript:/">',
		'<link rel="stylesheet" href="//example.com/x.css">',
		'<details open ontoggle=alert(1)><summary>x</summary></details>',
		'<div style="background:url(javascript:alert(1))">x</div>',
		'<style>@import "//example.com/x.css";</style>',
		'<template><img src=x onerror=alert(1)></template>',
		'<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
		'<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
		'<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
		'<frameset onload=alert(1)>',
		'<body onload=alert(1)>',
		'<video><source onerror=alert(1)></video>',
		'<a href="#" onclick="alert(1)">x</a>'
	];
	for (const p of payloads) {
		it(p, () => {
			const out = sanitizePreview(p);
			expectInert(out);
			// Y sigue igual de inerte si se inserta otra vez lo que quedó.
			expectInert(mount(out).innerHTML);
		});
	}

	it('también pasando por el markdown de la vista previa', () => {
		const body = [
			'Hola <img src=x onerror=alert(1)>',
			'',
			'[link](javascript:alert(1)) y <a href="java\tscript:alert(1)">otro</a>',
			'',
			'<details ontoggle=alert(1) open><summary>s</summary>texto</details>'
		].join('\n');
		const out = sanitizePreview(renderPreviewHtml(body));
		expectInert(out);
		expect(mount(out).textContent).toContain('Hola');
		expect(mount(out).textContent).toContain('texto');
	});

	it('un id o name del texto no pisa nombres de la página', () => {
		const el = mount(
			sanitizePreview(
				'<h3 id="parte">a</h3><a name="ancla">b</a><p aria-describedby="nota">c</p><p id="cookie">d</p><img name="body" src="/media/a.webp">'
			)
		);
		expect(el.querySelector('h3')?.id).toBe('user-content-parte');
		expect(el.querySelector('a')?.getAttribute('name')).toBe('user-content-ancla');
		expect(el.querySelector('p')?.getAttribute('aria-describedby')).toBe('user-content-nota');
		// Los que pisan una propiedad del documento (`document.cookie`, `document.body`) DOMPurify
		// ya los saca.
		expect(el.querySelectorAll('p')[1]?.hasAttribute('id')).toBe(false);
		expect(el.querySelector('img')?.hasAttribute('name')).toBe(false);
		expect(mount(sanitizePreview('<p id="user-content-x">a</p>')).querySelector('p')?.id).toBe(
			'user-content-x'
		);
	});
});

describe('sanitizePreview: el contenido normal pasa', () => {
	it('markdown con GFM', () => {
		const out = sanitizePreview(
			renderPreviewHtml(
				'## Título\n\n- uno\n- ~~dos~~\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n> cita\n\n`código` **negrita** _itálica_\n\n---\n'
			)
		);
		const el = mount(out);
		for (const sel of [
			'h2',
			'ul li',
			'del',
			'table td',
			'blockquote',
			'code',
			'strong',
			'em',
			'hr'
		]) {
			expect(el.querySelector(sel), sel).not.toBeNull();
		}
	});

	it('links: de afuera, del sitio, mail, teléfono, wiki y menciones', () => {
		const el = mount(
			sanitizePreview(
				renderPreviewHtml(
					'[afuera](https://example.com/x?a=1) [adentro](/material/algo) [mail](mailto:hola@example.com) <a href="tel:+5491100000000">tel</a> [[bondage]] <a href="/amigues/Alguien" class="mention">@Alguien</a> [ancla](#parte)'
				)
			)
		);
		const links = [...el.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.className]);
		expect(links).toEqual([
			['https://example.com/x?a=1', ''],
			['/material/algo', ''],
			['mailto:hola@example.com', ''],
			['tel:+5491100000000', ''],
			['/wiki/bondage', 'wikilink'],
			['/amigues/Alguien', 'mention'],
			['#parte', '']
		]);
		for (const a of el.querySelectorAll('a')) {
			expect(a.getAttribute('target')).toBe('_blank');
			expect(a.getAttribute('rel')).toBe('noreferrer');
		}
	});

	it('imágenes, video, audio y HTML que usan los textos', () => {
		const el = mount(
			sanitizePreview(
				[
					'<img src="/media/img/afiche.webp" alt="Afiche" width="300" height="200">',
					'<img src="https://kinkyvibe.ar/media/img/x.webp" alt="">',
					'<small class="p-pronouns">elle</small> <u>subrayado</u> <sup>1</sup> <kbd>k</kbd>',
					'<details><summary>Más</summary><p>oculto</p></details>',
					'<figure><img src="/media/img/a.webp" alt="a"><figcaption>Pie</figcaption></figure>',
					'<video src="/media/video/a.mp4" controls></video>',
					'<audio controls><source src="/media/audio/a.mp3" type="audio/mpeg"></audio>',
					'<div class="col-2"><p>columna</p></div>',
					'<span data-x="1">dato</span>'
				].join('\n')
			)
		);
		expect(
			[...el.querySelectorAll('img')].map((i) => [i.getAttribute('src'), i.getAttribute('alt')])
		).toEqual([
			['/media/img/afiche.webp', 'Afiche'],
			['https://kinkyvibe.ar/media/img/x.webp', ''],
			['/media/img/a.webp', 'a']
		]);
		expect(el.querySelector('img')?.getAttribute('width')).toBe('300');
		expect(el.querySelector('small.p-pronouns')?.textContent).toBe('elle');
		for (const sel of ['u', 'sup', 'kbd', 'details summary', 'figure figcaption', 'div.col-2']) {
			expect(el.querySelector(sel), sel).not.toBeNull();
		}
		expect(el.querySelector('video')?.getAttribute('src')).toBe('/media/video/a.mp4');
		expect(el.querySelector('video')?.hasAttribute('controls')).toBe(true);
		expect(el.querySelector('audio source')?.getAttribute('src')).toBe('/media/audio/a.mp3');
		expect(el.querySelector('span')?.getAttribute('data-x')).toBe('1');
	});

	it('el embed de Instagram queda como tarjeta con su link (sin estilo ni script)', () => {
		const el = mount(
			sanitizePreview(
				'<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/EJEMPLO/" data-instgrm-version="14" style="background:#FFF"><a href="https://www.instagram.com/p/EJEMPLO/">Ver en Instagram</a></blockquote><script async src="//www.instagram.com/embed.js"></script>'
			)
		);
		const bq = el.querySelector('blockquote.instagram-media');
		expect(bq?.getAttribute('data-instgrm-permalink')).toBe('https://www.instagram.com/p/EJEMPLO/');
		expect(bq?.hasAttribute('style')).toBe(false);
		expect(bq?.querySelector('a')?.getAttribute('href')).toBe(
			'https://www.instagram.com/p/EJEMPLO/'
		);
		expect(el.querySelector('script')).toBeNull();
	});

	it('un iframe (un video embebido) no sale en la vista previa, como antes', () => {
		const out = sanitizePreview(
			'<p>antes</p><iframe src="https://www.youtube.com/embed/EJEMPLO" allowfullscreen></iframe><p>después</p>'
		);
		expect(out).toBe('<p>antes</p><p>después</p>');
	});

	it('el material y la wiki de la semilla: el mismo texto y los mismos links e imágenes', () => {
		const files = [...seedFiles('material'), ...seedFiles('wiki')];
		expect(files.length).toBeGreaterThan(50);
		for (const f of files) {
			const html = renderPreviewHtml(f.raw.replace(/^---\n[\s\S]*?\n---\n?/, ''));
			// Lo de antes, sin limpiar, sin lo que la vista previa nunca mostró.
			const before = mount(html);
			before.querySelectorAll(ACTIVE).forEach((n) => n.remove());
			const after = mount(sanitizePreview(html));
			const text = (/** @type {Element} */ el) =>
				(el.textContent ?? '').replace(/\s+/g, ' ').trim();
			expect(text(after), f.legacySlug).toBe(text(before));
			const urls = (/** @type {Element} */ el) => [
				...[...el.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
				...[...el.querySelectorAll('img[src]')].map((i) => i.getAttribute('src'))
			];
			expect(urls(after), f.legacySlug).toEqual(urls(before));
		}
	});
});
