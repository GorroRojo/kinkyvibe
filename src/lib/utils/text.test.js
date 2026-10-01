import { describe, expect, it } from 'vitest';
import { escapeRegExp, foldText, slugify } from './text.js';
import { slugify as eventSlugify } from './eventDraft.js';
import { normalizeText } from './adminTags.js';
import { fold } from './sheetImport.js';
import { slugify as objectSlugify } from '$lib/server/objects/save.js';

describe('foldText', () => {
	it('lowercase, no accents, single spaces, trimmed', () => {
		expect(foldText('  Córdoba   Capital ')).toBe('cordoba capital');
		expect(foldText('ÑANDÚ\tpingüino\nÁrbol')).toBe('nandu pinguino arbol');
		expect(foldText(null)).toBe('');
		expect(foldText(42)).toBe('42');
	});
	it('is what adminTags.normalizeText and sheetImport.fold export', () => {
		expect(normalizeText).toBe(foldText);
		expect(fold).toBe(foldText);
	});
});

describe('slugify', () => {
	it('kebab-case without accents, at most 80 characters, no dash at the end', () => {
		expect(slugify('¡Córdoba! Taller de Ecofetichismo')).toBe('cordoba-taller-de-ecofetichismo');
		expect(slugify('  --Hola,  mundo--  ')).toBe('hola-mundo');
		expect(slugify('')).toBe('');
		expect(slugify('a'.repeat(79) + ' b')).toBe('a'.repeat(79));
		expect(slugify('x'.repeat(200))).toHaveLength(80);
	});
	it('events and objects use the same function', () => {
		expect(eventSlugify).toBe(slugify);
		expect(objectSlugify).toBe(slugify);
	});
});

describe('escapeRegExp', () => {
	it('escapes every metacharacter so the text matches literally', () => {
		const tricky = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o/p';
		expect(new RegExp(`^${escapeRegExp(tricky)}$`).test(tricky)).toBe(true);
		expect(new RegExp(escapeRegExp('a.b')).test('axb')).toBe(false);
	});
});
