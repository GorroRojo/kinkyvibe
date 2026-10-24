import { describe, expect, it } from 'vitest';
import { markdownToWiki, wikiBodyHtmlFor, wikiEntryOf } from './wikiPages.js';

describe('markdownToWiki', () => {
	it('las propiedades terminan en la línea que es solo `---`, no en un `---` a mitad de línea', () => {
		const raw = [
			'---',
			'wiki: Etiqueta Inventada',
			'title: Una etiqueta inventada',
			'summary: antes --- después ---',
			'tags: [inventada]',
			'---',
			'',
			'El texto, con una raya --- en el medio.',
			''
		].join('\n');
		expect(markdownToWiki(raw)).toEqual({
			wiki: 'Etiqueta Inventada',
			title: 'Una etiqueta inventada',
			summary: 'antes --- después ---',
			authors: [],
			tags: ['inventada'],
			body: 'El texto, con una raya --- en el medio.'
		});
	});

	it('sin propiedades (`---` y `---` seguidos) y con CRLF', () => {
		expect(markdownToWiki('---\n---\nSolo texto').body).toBe('Solo texto');
		expect(markdownToWiki('---\r\ntitle: Algo\r\n---\r\nTexto\r\n').title).toBe('Algo');
	});

	it('sin `---` que cierre en su propia línea, avisa', () => {
		expect(() => markdownToWiki('---\ntitle: Algo ---\nTexto')).toThrow(/bloque de propiedades/);
	});
});

describe('cómo se muestra el texto de la wiki (wiki_body_html)', () => {
	it('sin valor guardado, la lista corta; libre solo si está guardado', () => {
		expect(wikiEntryOf('inventada', 'Inventada', { body: 'Texto.' }).bodyHtml).toBe('corta');
		expect(
			wikiEntryOf('inventada', 'Inventada', { body: 'Texto.', wiki_body_html: 'otra cosa' })
				.bodyHtml
		).toBe('corta');
		expect(
			wikiEntryOf('inventada', 'Inventada', { body: 'Texto.', wiki_body_html: 'corta' }).bodyHtml
		).toBe('corta');
		expect(
			wikiEntryOf('inventada', 'Inventada', { body: 'Texto.', wiki_body_html: 'libre' }).bodyHtml
		).toBe('libre');
	});

	it('al guardar el mismo texto queda como estaba; sin valor, queda escrita la lista corta', () => {
		expect(wikiBodyHtmlFor({ body: 'Texto.', wiki_body_html: 'libre' }, 'Texto.', false)).toBe(
			'libre'
		);
		expect(wikiBodyHtmlFor({ body: 'Texto.', wiki_body_html: 'corta' }, 'Texto.', true)).toBe(
			'corta'
		);
		expect(wikiBodyHtmlFor({ body: 'Texto.' }, 'Texto.', true)).toBe('corta');
		// Texto nuevo: lo decide quien guarda.
		expect(wikiBodyHtmlFor({ body: 'Texto.' }, 'Otro texto.', true)).toBe('libre');
		expect(wikiBodyHtmlFor({ body: 'Texto.', wiki_body_html: 'libre' }, 'Otro.', false)).toBe(
			'corta'
		);
		expect(wikiBodyHtmlFor({ body: 'Texto.' }, '', true)).toBeUndefined();
	});
});
