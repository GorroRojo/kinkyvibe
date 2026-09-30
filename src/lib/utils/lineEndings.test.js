import { describe, expect, it } from 'vitest';
import { lineEndingOf, withLineEnding } from './lineEndings.js';

describe('lineEndings', () => {
	it('detects CRLF files', () => {
		expect(lineEndingOf('---\r\ntitle: x\r\n---\r\n')).toBe('crlf');
		expect(lineEndingOf('---\ntitle: x\n---\n')).toBe('lf');
		expect(lineEndingOf('')).toBe('lf');
	});

	it('a textarea submission (CRLF) of an LF file goes back to LF', () => {
		expect(withLineEnding('a\r\nb\r\n', 'lf')).toBe('a\nb\n');
		expect(withLineEnding('a\r\nb\r\n', undefined)).toBe('a\nb\n');
		expect(withLineEnding('a\r\nb\r\n', null)).toBe('a\nb\n');
	});

	it('a CRLF file stays CRLF, without doubling carriage returns', () => {
		expect(withLineEnding('a\r\nb\nc\r\n', 'crlf')).toBe('a\r\nb\r\nc\r\n');
		expect(withLineEnding('a\rb', 'crlf')).toBe('a\r\nb');
	});
});
