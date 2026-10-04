import { describe, it, expect } from 'vitest';
import { readUploadedImage } from './images.js';

describe('readUploadedImage', () => {
	it('checks the bytes, not the file name', async () => {
		const png = new File(
			[new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
			'x.jpg'
		);
		const r = await readUploadedImage(png);
		expect('ext' in r && r.ext).toBe('png');
		expect('base64' in r && r.base64).toBe('iVBORw0KGgoAAA==');
		const bad = await readUploadedImage(new File([new Uint8Array([1, 2, 3])], 'x.png'));
		expect('error' in bad).toBe(true);
		expect('error' in (await readUploadedImage(null))).toBe(true);
	});
});
