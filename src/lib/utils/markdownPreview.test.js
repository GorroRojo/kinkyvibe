import { describe, it, expect } from 'vitest';
import { renderPreviewHtml, stripScriptAndStyle, wikiLinksToMarkdown } from './markdownPreview.js';

describe('wikiLinksToMarkdown', () => {
	it('links terms like the site', () => {
		expect(wikiLinksToMarkdown('ver [[bondage]] y [[objetificación : objetificante]]')).toBe(
			'ver <a href="/wiki/bondage" class="wikilink">bondage</a> y <a href="/wiki/objetificaci%C3%B3n" class="wikilink">objetificante</a>'
		);
	});
	it('leaves code alone and escapes the label', () => {
		expect(wikiLinksToMarkdown('`[[x]]`')).toBe('`[[x]]`');
		expect(wikiLinksToMarkdown('[[a : <b>]]')).toContain('&lt;b&gt;');
	});
});

describe('renderPreviewHtml', () => {
	it('renders markdown with GFM and inline HTML', () => {
		const html = renderPreviewHtml('## Título\n\n- uno\n- ~~dos~~\n\n<small>chico</small>\n');
		expect(html).toContain('<h2>Título</h2>');
		expect(html).toContain('<del>dos</del>');
		expect(html).toContain('<small>chico</small>');
	});
	it('drops script and style blocks (mdsvex imports)', () => {
		const html = renderPreviewHtml(
			"<script>\n  import x from './media/a/1.webp'\n</script>\n\nHola\n<style>p{}</style>"
		);
		expect(html).not.toContain('script');
		expect(html).not.toContain('import');
		expect(html).not.toContain('style');
		expect(html).toContain('Hola');
	});
});

describe('stripScriptAndStyle', () => {
	it('saca bloques script y style, también con espacios en el cierre', () => {
		expect(stripScriptAndStyle('a<script>x()</script>b<style>p{}</style >c')).toBe('abc');
		expect(stripScriptAndStyle('a<script type="module">x</script >b')).toBe('ab');
	});
	it('no deja que un script partido se rearme', () => {
		const out = stripScriptAndStyle('<scr<script></script>ipt>alert(1)</script>');
		expect(out.toLowerCase()).not.toContain('<script');
	});
	it('escapa un script sin cerrar', () => {
		const out = stripScriptAndStyle('hola <script>alert(1)');
		expect(out).toBe('hola &lt;script>alert(1)');
		expect(renderPreviewHtml('hola <script>alert(1)').toLowerCase()).not.toContain('<script');
	});
});
