import { describe, expect, it } from 'vitest';
import { contentRange, disposition, parseRange } from './range.js';

describe('parseRange', () => {
	it('un rango con principio y fin, abierto o del final', () => {
		expect(parseRange('bytes=0-99', 1000)).toEqual({ offset: 0, length: 100 });
		expect(parseRange('bytes=500-', 1000)).toEqual({ offset: 500, length: 500 });
		expect(parseRange('bytes=-100', 1000)).toEqual({ offset: 900, length: 100 });
		expect(parseRange('BYTES = 10 - 19', 1000)).toEqual({ offset: 10, length: 10 });
	});
	it('un fin más allá del archivo se recorta; un sufijo más largo que el archivo es todo', () => {
		expect(parseRange('bytes=900-5000', 1000)).toEqual({ offset: 900, length: 100 });
		expect(parseRange('bytes=-5000', 1000)).toEqual({ offset: 0, length: 1000 });
		expect(parseRange('bytes=999-999', 1000)).toEqual({ offset: 999, length: 1 });
	});
	it('fuera del archivo: 416', () => {
		expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
		expect(parseRange('bytes=2000-3000', 1000)).toBe('unsatisfiable');
		expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
	});
	it('lo que no se entiende se ignora (se manda todo)', () => {
		for (const h of [
			null,
			'',
			'bytes=',
			'bytes=-',
			'items=0-1',
			'bytes=0-1,5-9',
			'bytes=9-2',
			'bytes=a-b'
		]) {
			expect(parseRange(h, 1000)).toBeNull();
		}
	});
	it('Content-Range', () => {
		expect(contentRange({ offset: 900, length: 100 }, 1000)).toBe('bytes 900-999/1000');
	});
});

describe('disposition', () => {
	it('inline o attachment, con un nombre ASCII seguro y el completo en filename*', () => {
		expect(disposition('inline', 'Guía de prueba', 'pdf')).toBe(
			`inline; filename="Guia de prueba.pdf"; filename*=UTF-8''Gu%C3%ADa%20de%20prueba.pdf`
		);
		const evil = disposition('attachment', 'a"b/c\\d\r\nSet-Cookie: x=1', 'odt');
		expect(evil.startsWith('attachment; filename="a b c d Set-Cookie_ x_1.odt"')).toBe(true);
		expect(evil).not.toMatch(/[\r\n]/);
		expect(disposition('inline', "l'(x)!", 'pdf')).toContain(`filename*=UTF-8''l%27%28x%29%21.pdf`);
		expect(disposition('inline', '   ', 'mp4')).toBe(
			`inline; filename="archivo.mp4"; filename*=UTF-8''archivo.mp4`
		);
	});
});
