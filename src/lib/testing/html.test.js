import { describe, expect, it } from 'vitest';
import { metaTags, tagsOf, textOf, withoutComments } from './html.js';

describe('withoutComments', () => {
	it('saca los comentarios (también vacíos y con «>» adentro)', () => {
		expect(withoutComments('a<!---->b<!--[-->c<!-- x > y -->d')).toBe('abcd');
	});
	it('un comentario sin cerrar se corta hasta el final', () => {
		expect(withoutComments('a<!-- abierto <b>x</b>')).toBe('a');
	});
});

describe('textOf', () => {
	it('deja solo el texto', () => {
		expect(textOf('<p class="x">Hola <b>vos</b></p><!---->!')).toBe('Hola vos!');
	});
	it('una etiqueta sin cerrar no deja restos', () => {
		expect(textOf('texto<script')).toBe('texto');
	});
});

describe('tagsOf', () => {
	it('lee los atributos de cada etiqueta, con comillas dobles, simples o sin valor', () => {
		const html = `<link rel="canonical" href="https://x.test/a"/><linkx rel="no"><meta name='a' content="b &amp; &quot;c&quot;" hidden>`;
		expect(tagsOf(html, 'link')).toEqual([{ rel: 'canonical', href: 'https://x.test/a' }]);
		expect(tagsOf(html, 'meta')).toEqual([{ name: 'a', content: 'b & "c"', hidden: '' }]);
	});
	it('un «>» o un «<meta» adentro de un atributo no corta ni abre etiquetas', () => {
		const html = `<meta name="a" content="&quot;><meta name=x>"><meta name="b">`;
		expect(tagsOf(html, 'meta')).toEqual([
			{ name: 'a', content: '"><meta name=x>' },
			{ name: 'b' }
		]);
	});
	it('no mira adentro de los comentarios', () => {
		expect(tagsOf('<!-- <meta name="x" content="y"> --><meta name="z">', 'meta')).toEqual([
			{ name: 'z' }
		]);
	});
});

describe('metaTags', () => {
	it('junta los content por property o name, repetidos incluidos', () => {
		const html =
			'<meta property="og:url" content="1"/><meta property="og:url" content="2"/><meta name="description" content="d"/><meta charset="utf-8">';
		expect(metaTags(html)).toEqual({ 'og:url': ['1', '2'], description: ['d'] });
	});
});
