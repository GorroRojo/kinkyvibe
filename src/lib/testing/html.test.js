import { describe, expect, it } from 'vitest';
import { textOf, withoutComments } from './html.js';

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
