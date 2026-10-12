import { describe, expect, it } from 'vitest';
import { splitByDuration } from './sequencer.js';

describe('splitByDuration', () => {
	it('cada archivo queda en exactamente una parte', () => {
		const files = Array.from({ length: 50 }, (_, i) => `src/f${i}.test.js`);
		const durations = Object.fromEntries(files.map((f, i) => [f, (i * 7) % 13]));
		const parts = splitByDuration(files, durations, 3);
		expect(parts).toHaveLength(3);
		expect(parts.flat().sort()).toEqual([...files].sort());
	});

	it('reparte por tiempo, no por cantidad: el lento va solo', () => {
		const durations = { 'a.test.js': 90, 'b.test.js': 30, 'c.test.js': 30, 'd.test.js': 30 };
		const parts = splitByDuration(Object.keys(durations), durations, 2);
		expect(parts).toEqual([['a.test.js'], ['b.test.js', 'c.test.js', 'd.test.js']]);
	});

	it('un archivo sin tiempo cuenta como la mediana', () => {
		const durations = { 'a.test.js': 10, 'b.test.js': 2, 'c.test.js': 4 };
		const parts = splitByDuration([...Object.keys(durations), 'nuevo.test.js'], durations, 2);
		// a (10) | c (4), nuevo (mediana = 4), b (2)
		expect(parts).toEqual([['a.test.js'], ['c.test.js', 'nuevo.test.js', 'b.test.js']]);
	});

	it('da lo mismo en cualquier orden de entrada (todas las partes calculan lo mismo)', () => {
		const files = Array.from({ length: 20 }, (_, i) => `f${i}.test.js`);
		const durations = Object.fromEntries(files.map((f, i) => [f, i % 4]));
		const shuffled = [...files].reverse();
		expect(splitByDuration(shuffled, durations, 3)).toEqual(splitByDuration(files, durations, 3));
	});

	it('sin tiempos, reparte la misma cantidad en cada parte', () => {
		const files = Array.from({ length: 7 }, (_, i) => `f${i}.test.js`);
		expect(splitByDuration(files, {}, 3).map((p) => p.length)).toEqual([3, 2, 2]);
	});
});
