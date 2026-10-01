import { describe, expect, it } from 'vitest';
import { undoneMessage } from './deleteText.js';

describe('undoneMessage', () => {
	it('says whether the delete was cancelled before publishing or restored after', () => {
		expect(undoneMessage({ mode: 'cancelled', title: 'Guía inventada' })).toContain('no se borró');
		expect(undoneMessage({ mode: 'restored', title: 'Guía inventada' })).toBe(
			'Listo: «Guía inventada» vuelve a estar. Se publica en unos minutos.'
		);
	});
});
