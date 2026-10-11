import { describe, expect, it } from 'vitest';
import { errorDetail, isDefaultErrorMessage } from './errorPage.js';

describe('errorDetail', () => {
	it('hides SvelteKit messages in English, also the preview "Not Found: Not found: /x"', () => {
		for (const message of [
			'Not Found',
			'Not found: /cosa-rara',
			'Not Found: Not found: /cosa-rara',
			'Forbidden',
			'Error: 404',
			''
		]) {
			expect(isDefaultErrorMessage(message)).toBe(true);
			expect(errorDetail({ status: 404, message })).toBe('');
		}
	});

	it('shows our own 4xx messages', () => {
		expect(errorDetail({ status: 404, message: 'Ese código de error no existe.' })).toBe(
			'Ese código de error no existe.'
		);
	});

	it('shows 5xx details only in development', () => {
		expect(errorDetail({ status: 500, message: 'D1_ERROR: tabla' })).toBe('');
		expect(errorDetail({ status: 500, message: 'D1_ERROR: tabla', dev: true })).toBe(
			'D1_ERROR: tabla'
		);
	});
});
