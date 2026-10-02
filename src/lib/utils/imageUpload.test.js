import { describe, expect, it } from 'vitest';
import { IMAGE_TYPES, checkImageFile } from './imageUpload.js';

const MB = 1024 * 1024;

describe('checkImageFile', () => {
	it('acepta JPG, PNG y WEBP y devuelve la extensión', () => {
		expect(checkImageFile({ type: 'image/jpeg', size: MB }, 5 * MB)).toEqual({
			error: '',
			ext: 'jpg'
		});
		expect(checkImageFile({ type: 'image/png', size: MB }, 5 * MB).ext).toBe('png');
		expect(checkImageFile({ type: 'image/webp', size: MB }, 5 * MB).ext).toBe('webp');
		expect(IMAGE_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
	});

	it('rechaza otros tipos', () => {
		expect(checkImageFile({ type: 'image/gif', size: 10 }, 5 * MB)).toEqual({
			error: 'La imagen tiene que ser JPG, PNG o WEBP.',
			ext: ''
		});
	});

	it('rechaza las que pesan más del máximo, con el peso en MB', () => {
		expect(checkImageFile({ type: 'image/png', size: 6.25 * MB }, 5 * MB)).toEqual({
			error: 'La imagen pesa 6.3 MB. El máximo es 5 MB.',
			ext: ''
		});
		// Justo el máximo todavía entra.
		expect(checkImageFile({ type: 'image/png', size: 5 * MB }, 5 * MB).error).toBe('');
	});
});
