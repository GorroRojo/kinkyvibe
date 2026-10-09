import { describe, expect, it } from 'vitest';
import { hasVisibleHtml, stripHtmlComments, stripHtmlTags } from './htmlStrip.js';

describe('htmlStrip', () => {
	it('saca comentarios, también los armados con pedazos', () => {
		expect(stripHtmlComments('a<!-- x -->b')).toBe('ab');
		expect(stripHtmlComments('<!<!-- -->-- y -->z')).toBe('z');
	});
	it('saca etiquetas sin dejar una armada con los pedazos', () => {
		expect(stripHtmlTags('<p>a <b>b</b></p>')).toBe('a b');
		expect(stripHtmlTags('<scr<b>ipt>x')).not.toMatch(/<script/i);
	});
});

describe('hasVisibleHtml', () => {
	it('vacío, espacios, comentarios, estilos o etiquetas sin texto: no muestra nada', () => {
		for (const html of [
			'',
			undefined,
			'   \n\t ',
			'<!-- texto de prueba que no se ve -->',
			'\n<!-- uno -->\n  <!-- dos -->\n',
			'<p></p><p> </p><br>',
			'<p>&nbsp;</p>',
			'<style>.x { color: red }</style>',
			'<script>void 0</script>'
		]) {
			expect(hasVisibleHtml(html), String(html)).toBe(false);
		}
	});

	it('texto, una imagen o un embebido: sí', () => {
		expect(hasVisibleHtml('<!-- nota -->\n<p>Hola</p>')).toBe(true);
		expect(hasVisibleHtml('<p><img src="/prueba.webp" alt=""></p>')).toBe(true);
		expect(hasVisibleHtml('<iframe src="https://example.com"></iframe>')).toBe(true);
		expect(hasVisibleHtml('Texto suelto')).toBe(true);
	});
});
