import { describe, expect, it } from 'vitest';
import { eventBadges, totalCapacity } from './eventFormat.js';

describe('totalCapacity', () => {
	it('suma los cupos; con un tipo sin cupo, el evento no tiene cupo total', () => {
		expect(totalCapacity([30, 3])).toBe(33);
		expect(totalCapacity([0, 5])).toBe(5);
		expect(totalCapacity([30, null])).toBeNull();
		expect(totalCapacity([undefined])).toBeNull();
		expect(totalCapacity([''])).toBeNull();
		expect(totalCapacity([])).toBe(0);
	});
});

describe('eventBadges: Borrador y No listado', () => {
	it('con la marca de la agenda es «Borrador»; no listado a propósito, «No listado»', () => {
		expect(eventBadges({ unlisted: true, draft: true })[0].label).toBe('Borrador');
		expect(eventBadges({ unlisted: true })[0].label).toBe('No listado');
		expect(eventBadges({ unlisted: false, draft: true })).toEqual([]);
	});
});
