import { describe, expect, it } from 'vitest';
import { escapeHtml, jsonForScript } from './escape.js';
import { eventHtml } from './icsFeed.js';

describe('escapeHtml', () => {
	it('escapes markup characters', () => {
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
			'&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
		);
		expect(escapeHtml(undefined)).toBe('');
		expect(escapeHtml(3)).toBe('3');
	});
});

describe('jsonForScript', () => {
	it('cannot close the script element and parses back to the same value', () => {
		const value = { name: '</script><script>alert(1)</script>', x: 'a & b > c', l: '\u2028' };
		const json = jsonForScript(value, 2);
		expect(json).not.toMatch(/[<>&\u2028]/);
		expect(json.toLowerCase()).not.toContain('</script');
		expect(JSON.parse(json)).toEqual(value);
	});
});

describe('calendar event HTML', () => {
	it('escapes the summary and link', () => {
		const html = eventHtml('https://kinkyvibe.ar/calendario/x', '<b>hola</b> & chau');
		expect(html).toContain('<p>&lt;b&gt;hola&lt;/b&gt; &amp; chau</p>');
		expect(html).toContain('<a href="https://kinkyvibe.ar/calendario/x">');
		expect(eventHtml('https://kinkyvibe.ar/x', undefined)).toContain('<p></p>');
	});
});
