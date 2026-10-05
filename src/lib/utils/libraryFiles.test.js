import { describe, expect, it } from 'vitest';
import {
	MAX_FILE_BYTES,
	appendParagraph,
	documentPickProblem,
	libraryHref,
	libraryKind,
	libraryLink
} from './libraryFiles.js';

describe('libraryFiles', () => {
	it('qué se puede elegir para subir', () => {
		expect(documentPickProblem({ name: 'guia.pdf', type: 'application/pdf', size: 1000 })).toBe('');
		expect(documentPickProblem({ name: 'video.MP4', type: '', size: 1000 })).toBe('');
		expect(documentPickProblem({ name: 'ficha.odt', size: 1000 })).toBe('');
		expect(documentPickProblem({ name: 'pagina.html', type: 'text/html', size: 10 })).toMatch(
			/PDF/
		);
		expect(documentPickProblem({ name: 'vacio.pdf', size: 0 })).toMatch(/vacío/);
		expect(
			documentPickProblem({ name: 'enorme.pdf', type: 'application/pdf', size: MAX_FILE_BYTES + 1 })
		).toMatch(/El máximo es 25 MB/);
	});
	it('el enlace en markdown, con el nombre escapado', () => {
		expect(libraryLink({ title: 'Guía de prueba', url: '/media/file/x.pdf' })).toBe(
			'[Guía de prueba](/media/file/x.pdf)'
		);
		expect(libraryLink({ title: 'a [b]\n c\\', url: '/media/file/y.pdf' })).toBe(
			'[a \\[b\\] c\\\\](/media/file/y.pdf)'
		);
		expect(libraryLink({ title: '', url: '/media/file/z.pdf' })).toBe(
			'[Archivo](/media/file/z.pdf)'
		);
	});
	it('sumar al final del texto, en su propio párrafo', () => {
		expect(appendParagraph('Hola\n\n', '[x](/m)')).toBe('Hola\n\n[x](/m)\n');
		expect(appendParagraph('', '[x](/m)')).toBe('[x](/m)\n');
	});
	it('filtros por tipo', () => {
		expect(libraryHref(' guía ', 'documento')).toBe('/imagenes?q=gu%C3%ADa&tipo=documento');
		expect(libraryKind('video')).toBe('video');
		expect(libraryKind('otra')).toBeNull();
	});
});
