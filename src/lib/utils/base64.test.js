import { describe, expect, it } from 'vitest';
// Node's Buffer only as the reference implementation; the code under test must not use it.
import { Buffer } from 'node:buffer';
import {
	base64ToUtf8,
	fromBase64,
	fromBase64url,
	toBase64,
	toBase64url,
	toHex,
	utf8ToBase64
} from './base64.js';

const TEXTS = [
	'',
	'a',
	'ab',
	'abc',
	'hola',
	'Hello, world!\n',
	'ñandú, pingüino, año',
	'¿Querés venir? ¡Dale!',
	'🏙️',
	'fiesta 🎉🔥 con amigues 🏳️‍🌈',
	'日本語のテキスト',
	'---\ntitle: "Evento"\ntags: [fiesta]\n---\n\nTexto con ñ y 🏙️.\n',
	'\0 nul y ÿ y ￿'
];

/** @param {number} n @param {number} seed */
function pseudoRandomBytes(n, seed) {
	const out = new Uint8Array(n);
	let x = seed >>> 0 || 1;
	for (let i = 0; i < n; i++) {
		// xorshift32
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		out[i] = x & 0xff;
	}
	return out;
}

describe('utf8ToBase64 / base64ToUtf8', () => {
	it.each(TEXTS)('matches Buffer and round-trips: %j', (text) => {
		const encoded = utf8ToBase64(text);
		expect(encoded).toBe(Buffer.from(text, 'utf-8').toString('base64'));
		expect(toBase64(text)).toBe(encoded);
		expect(base64ToUtf8(encoded)).toBe(text);
	});

	it('encodes known values', () => {
		expect(utf8ToBase64('')).toBe('');
		expect(utf8ToBase64('hola')).toBe('aG9sYQ==');
		expect(utf8ToBase64('ñ')).toBe('w7E=');
		expect(base64ToUtf8('8J+Pme+4jw==')).toBe('🏙️');
	});

	it('reads base64 wrapped in lines, as the GitHub contents API sends it', () => {
		const text = 'línea con ñ '.repeat(40);
		const wrapped = Buffer.from(text, 'utf-8').toString('base64').replace(/.{60}/g, '$&\n');
		expect(wrapped).toContain('\n');
		expect(base64ToUtf8(wrapped)).toBe(text);
	});

	it('throws on text that is not base64', () => {
		expect(() => fromBase64('no es base64!')).toThrow();
	});
});

describe('toBase64 / fromBase64 with bytes', () => {
	it('encodes every byte 0–255 like Buffer', () => {
		const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
		const encoded = toBase64(bytes);
		expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
		expect(fromBase64(encoded)).toEqual(bytes);
	});

	it('each single byte, and every padding length', () => {
		for (let b = 0; b < 256; b++) {
			const one = Uint8Array.of(b);
			expect(toBase64(one)).toBe(Buffer.from(one).toString('base64'));
			expect(fromBase64(toBase64(one))).toEqual(one);
		}
		for (let n = 0; n < 10; n++) {
			const bytes = pseudoRandomBytes(n, n + 7);
			expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
			expect(fromBase64(toBase64(bytes))).toEqual(bytes);
		}
	});

	it('empty input', () => {
		expect(toBase64(new Uint8Array(0))).toBe('');
		expect(toBase64(new ArrayBuffer(0))).toBe('');
		expect(fromBase64('')).toEqual(new Uint8Array(0));
	});

	it('accepts an ArrayBuffer and a subarray view', () => {
		const bytes = pseudoRandomBytes(100, 3);
		expect(toBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'));
		const view = bytes.subarray(10, 50);
		expect(toBase64(view)).toBe(Buffer.from(view).toString('base64'));
	});

	it('round-trips a few MB (bigger than one chunk, like an image) byte-identical to Buffer', () => {
		// 5 MB (the upload limit) plus a few bytes, so the last chunk is partial and padded.
		const bytes = pseudoRandomBytes(5 * 1024 * 1024 + 2, 42);
		const encoded = toBase64(bytes);
		expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
		const decoded = fromBase64(encoded);
		expect(decoded.length).toBe(bytes.length);
		expect(Buffer.from(decoded).equals(Buffer.from(bytes))).toBe(true);
	});

	it('decodes what Buffer encodes', () => {
		const bytes = pseudoRandomBytes(70000, 9);
		expect(fromBase64(Buffer.from(bytes).toString('base64'))).toEqual(bytes);
	});
});

describe('toHex', () => {
	it('matches Buffer hex', () => {
		const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
		expect(toHex(bytes)).toBe(Buffer.from(bytes).toString('hex'));
		expect(toHex(bytes.buffer)).toBe(Buffer.from(bytes).toString('hex'));
		expect(toHex(new Uint8Array(0))).toBe('');
	});
});

describe('toBase64url / fromBase64url', () => {
	it('matches Buffer base64url for every length and byte', () => {
		const all = Uint8Array.from({ length: 256 }, (_, i) => i);
		for (let n = 0; n <= 40; n++) {
			const bytes = all.subarray(256 - n);
			const expected = Buffer.from(bytes).toString('base64url');
			expect(toBase64url(bytes)).toBe(expected);
			expect(Array.from(fromBase64url(expected) ?? [])).toEqual(Array.from(bytes));
		}
		expect(toBase64url(all)).toBe(Buffer.from(all).toString('base64url'));
	});
	it('a 32-byte token is 43 characters, URL-safe', () => {
		const token = toBase64url(new Uint8Array(32).fill(0xfb));
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});
	it('fromBase64url rejects what is not base64url', () => {
		expect(fromBase64url('ab+c')).toBe(null);
		expect(fromBase64url('ab/c')).toBe(null);
		expect(fromBase64url('abc=')).toBe(null);
		expect(fromBase64url('a')).toBe(null);
		expect(fromBase64url(/** @type {any} */ (null))).toBe(null);
	});
});
