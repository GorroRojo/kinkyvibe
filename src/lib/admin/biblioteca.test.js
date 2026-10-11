import { describe, expect, it } from 'vitest';
import { bibliotecaHref, deleteText, moreHref, sizeText, useHref } from './biblioteca.js';

describe('biblioteca del panel', () => {
	it('cada uso lleva a su lugar en el panel', () => {
		expect(useHref({ type: 'evento', id: 1, slug: 'fiesta-inventada', title: 'x' })).toBe(
			'/admin/eventos/fiesta-inventada'
		);
		expect(useHref({ type: 'material', id: 2, slug: 'guia-inventada', title: 'x' })).toBe(
			'/admin/contenido/material/guia-inventada'
		);
		expect(useHref({ type: 'perfil', id: 3, slug: 'perfil-inventado', title: 'x' })).toBe(
			'/admin/comunidad/cuentas/perfiles/3'
		);
		expect(useHref({ type: 'etiqueta', id: 4, slug: 'serie', title: 'x' })).toBe(
			'/admin/eventos/series'
		);
		expect(useHref({ hidden: true })).toBeNull();
	});

	it('peso, direcciones y el texto de la confirmación', () => {
		expect(sizeText(300)).toBe('1 KB');
		expect(sizeText(850 * 1024)).toBe('850 KB');
		expect(sizeText(2.4 * 1024 * 1024)).toBe('2,4 MB');
		expect(bibliotecaHref('', 'todo')).toBe('/admin/contenido/biblioteca');
		expect(bibliotecaHref(' guía ', 'documento')).toBe(
			'/admin/contenido/biblioteca?q=gu%C3%ADa&tipo=documento'
		);
		expect(moreHref('a b', 'video', 48)).toBe('/imagenes?q=a%20b&tipo=video&desde=48');
		expect(deleteText({ kind: 'imagen', usedIn: ['perfil «Perfil Inventado»'] })).toMatch(
			/^Se usa en: perfil «Perfil Inventado»\. Ahí deja de verse la imagen\./
		);
		expect(deleteText({ kind: 'documento', usedIn: [] })).toMatch(/^No se usa en ningún lado\./);
	});
});
