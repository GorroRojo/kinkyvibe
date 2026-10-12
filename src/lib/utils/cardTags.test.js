import { describe, expect, it } from 'vitest';
import { cardTags, CARD_TAGS_MAX } from './cardTags.js';

const tags = ['una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete'];

describe('cardTags (hasta 5 etiquetas por tarjeta y «+N»)', () => {
	it('con más de 5: las primeras 5 y cuántas quedan', () => {
		expect(CARD_TAGS_MAX).toBe(5);
		expect(cardTags(tags)).toEqual({ shown: tags.slice(0, 5), extra: 2 });
	});

	it('desplegada: todas, y sigue sabiendo cuántas eran de más', () => {
		expect(cardTags(tags, true)).toEqual({ shown: tags, extra: 2 });
	});

	it('con 5 o menos: todas y sin «+N»', () => {
		expect(cardTags(tags.slice(0, 5))).toEqual({ shown: tags.slice(0, 5), extra: 0 });
		expect(cardTags([])).toEqual({ shown: [], extra: 0 });
	});
});
