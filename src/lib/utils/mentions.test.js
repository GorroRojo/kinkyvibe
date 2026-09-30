import { describe, expect, it } from 'vitest';
import { pronounLabel } from './mentions.js';

describe('pronounLabel', () => {
	it('takes the first form of a pronombr.es URL and turns & into /', () => {
		expect(pronounLabel('https://pronombr.es/elle&ella&él')).toBe('elle/ella/él');
		expect(pronounLabel('https://pronombr.es/elles,les,les,unes,elles')).toBe('elles');
		expect(pronounLabel('https://pronombr.es/él')).toBe('él');
	});

	it('passes plain text through', () => {
		expect(pronounLabel('ella')).toBe('ella');
	});

	it('shows nothing for "evitar" or a missing pronoun', () => {
		expect(pronounLabel('https://pronombr.es/evitar')).toBeUndefined();
		expect(pronounLabel('')).toBeUndefined();
		expect(pronounLabel(undefined)).toBeUndefined();
		expect(pronounLabel('https://pronombr.es/')).toBeUndefined();
	});
});
