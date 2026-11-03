import { describe, expect, it } from 'vitest';
import { sanitizePreview } from './sanitizePreview.js';

describe('sanitizePreview sin DOM (el servidor)', () => {
	it('no devuelve nada: sin DOM no hay cómo limpiar', () => {
		expect(typeof window).toBe('undefined');
		expect(sanitizePreview('<p>hola</p><img src=x onerror=alert(1)>')).toBe('');
	});
});
