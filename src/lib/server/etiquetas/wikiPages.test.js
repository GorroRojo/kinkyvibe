import { describe, expect, it } from 'vitest';
import { markdownToWiki } from './wikiPages.js';

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
