import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, timingSafeEqual } from './hash.js';

describe('sha256Hex', () => {
	it('matches the standard SHA-256 test vectors', async () => {
		expect(await sha256Hex('')).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
		);
		expect(await sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});

	it('hashes the UTF-8 bytes of the text', async () => {
		const text = 'Ñandú · persona@example.com';
		expect(await sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
	});
});

describe('timingSafeEqual', () => {
	it('compares texts (moved from cuentas/crypto.js timingSafeEqualText)', () => {
		expect(timingSafeEqual('abc', 'abc')).toBe(true);
		expect(timingSafeEqual('abc', 'abd')).toBe(false);
		expect(timingSafeEqual('abc', 'abcd')).toBe(false);
		expect(timingSafeEqual('', '')).toBe(true);
	});
});
