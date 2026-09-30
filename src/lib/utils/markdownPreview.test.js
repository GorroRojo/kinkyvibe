import { describe, it, expect } from 'vitest';
import { renderPreviewHtml, wikiLinksToMarkdown } from './markdownPreview.js';

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
