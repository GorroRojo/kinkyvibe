import { describe, expect, it } from 'vitest';
import { totalCapacity } from './eventFormat.js';

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
