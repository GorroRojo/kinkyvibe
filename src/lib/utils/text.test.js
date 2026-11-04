import { describe, expect, it } from 'vitest';
import { escapeRegExp, foldText, slugify, stripMarks } from './text.js';
import { slugify as eventSlugify } from './eventDraft.js';
import { normalizeText } from './adminTags.js';
import { normalizeText as postNormalizeText } from './postSearch.js';
import { foldQuery } from './searchSyntax.js';
import { fold } from './sheetImport.js';
import { fold as commandsFold } from '$lib/admin/commands.js';
import { foldSearch } from '$lib/admin/eventFormat.js';
import { foldText as ordersFoldText } from '$lib/server/tickets/orders.js';
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
	it('is the one recipe: panel search, palette, event lists, orders and post search use it', () => {
		for (const alias of [postNormalizeText, foldQuery, commandsFold, foldSearch, ordersFoldText]) {
			expect(alias).toBe(foldText);
		}
	});
	// La receta amplia (Mesa chica-567-quitar-tildes): también saca signos sueltos.
	it('also strips spacing diacritic signs: «Mel·la» is found by «mella» and by «Mel·la»', () => {
		expect(foldText('Mel·la')).toBe('mella');
		expect(foldText('Mel·la')).toBe(foldText('mella'));
		expect(foldText('mel·la')).toBe(foldText('MEL·LA'));
		expect(foldText('a´b^c¨d`e')).toBe('abcde');
		// Already decomposed text (NFD) folds the same as precomposed.
		expect(foldText('Ñandu\u0301')).toBe(foldText('Ñandú'));
		// Other punctuation stays: only diacritic signs go.
		expect(foldText('rock & roll, ¿sí?')).toBe('rock & roll, ¿si?');
	});
});

describe('stripMarks', () => {
	it('removes marks but keeps case and spaces', () => {
		expect(stripMarks('Mel·la  Ñandú')).toBe('Mella  Nandu');
		expect(stripMarks(undefined)).toBe('');
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
	it('keeps its narrow recipe so existing slugs and URLs do not change', () => {
		// «·» is a separator in slugs (as it always was), even though foldText drops it.
		expect(slugify('Mel·la')).toBe('mel-la');
		expect(slugify('Taller de Cuerdas ^ Nudos')).toBe('taller-de-cuerdas-nudos');
		expect(slugify('Ñandú José')).toBe('nandu-jose');
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
