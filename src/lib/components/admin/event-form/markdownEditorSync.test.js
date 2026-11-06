import { describe, expect, it } from 'vitest';
import { docChange, valueGuard } from './markdownEditorSync.js';

/** Aplica un cambio de docChange a un texto. @param {string} text @param {any} c */
const apply = (text, c) => (c ? text.slice(0, c.from) + c.insert + text.slice(c.to) : text);

describe('docChange', () => {
	it('igual: nada que cambiar', () => {
		expect(docChange('## Hola\n\ntexto', '## Hola\n\ntexto')).toBeNull();
	});

	it('solo el tramo que difiere', () => {
		expect(docChange('abc def ghi', 'abc XYZ ghi')).toEqual({ from: 4, to: 7, insert: 'XYZ' });
		expect(docChange('abc', 'abcd')).toEqual({ from: 3, to: 3, insert: 'd' });
		expect(docChange('abcd', 'abc')).toEqual({ from: 3, to: 4, insert: '' });
		expect(docChange('', 'nuevo')).toEqual({ from: 0, to: 0, insert: 'nuevo' });
	});

	it('no parte un emoji (par sustituto) al medio', () => {
		// 🕐 (U+1F550) y 🕑 (U+1F551) comparten la primera mitad del par.
		const a = '### 🕐 Parte 2 - Citas Rápidas';
		const b = '### 🕑 Parte 2 - Citas Rápidas';
		const c = docChange(a, b);
		expect(c).toEqual({ from: 4, to: 6, insert: '🕑' });
		expect(apply(a, c)).toBe(b);
	});

	it('siempre lleva de un texto al otro', () => {
		const texts = [
			'',
			'> cita',
			'> cita\n> otra',
			'### 🕐 Parte 2 - Citas Rápidas\n\n> «una cita»',
			'### 🕐🕐 Parte\n',
			'🕐',
			'a🕐b',
			'a🕑b'
		];
		for (const a of texts) for (const b of texts) expect(apply(a, docChange(a, b))).toBe(b);
	});
});

describe('valueGuard: el eco entre el formulario y el editor', () => {
	it('lo que escribió el editor no vuelve a entrar', () => {
		const g = valueGuard('hola');
		expect(g.incoming('hola')).toBe(false);
		g.fromEditor('hola mundo');
		// el formulario recibe 'hola mundo' por el bind y lo devuelve: es el eco
		expect(g.incoming('hola mundo')).toBe(false);
		expect(g.incoming('hola mundo')).toBe(false);
	});

	it('un texto nuevo de afuera (recuperar un borrador) entra una sola vez', () => {
		const g = valueGuard('hola');
		expect(g.incoming('el borrador')).toBe(true);
		expect(g.incoming('el borrador')).toBe(false);
	});

	it('después de un cambio de afuera, lo que sigue escribiéndose no rebota', () => {
		const g = valueGuard('a');
		expect(g.incoming('b')).toBe(true);
		g.fromEditor('bc');
		expect(g.incoming('bc')).toBe(false);
	});
});
