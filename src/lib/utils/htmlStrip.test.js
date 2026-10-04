import { describe, expect, it } from 'vitest';
import { stripHtmlComments, stripHtmlTags } from './htmlStrip.js';

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
