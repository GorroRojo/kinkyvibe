import { describe, expect, it } from 'vitest';
import { RECURRING_ROOT, eventSeriesTags, seriesTagIndex } from './eventSeries.js';

const tree = [
	{ id: 'calendario', children: ['tipo de evento', RECURRING_ROOT] },
	{ id: 'tipo de evento', children: ['fiesta', 'taller'] },
	{ id: RECURRING_ROOT, children: ['Serie Uno', 'Serie Dos'] },
	{ id: 'Serie Uno', aka: ['serie-1'], children: ['Serie Uno Online'] },
	{ id: 'Serie Uno Online', children: ['Bisnieta'] },
	{ id: 'Serie Dos' },
	{ id: 'Bisnieta' },
	{ id: 'S2', aliasOf: 'Serie Dos' },
	{ id: 'fiesta' },
	{ id: 'taller' }
];

describe('seriesTagIndex', () => {
	it('children and grandchildren of "evento recurrente", with aliases', () => {
		const index = seriesTagIndex(tree);
		expect([...new Set(index.values())].sort()).toEqual([
			'Serie Dos',
			'Serie Uno',
			'Serie Uno Online'
		]);
		expect(index.get('serie-1')).toBe('Serie Uno');
		expect(index.get('s2')).toBe('Serie Dos');
		expect(index.has('bisnieta')).toBe(false);
		expect(index.has('fiesta')).toBe(false);
	});

	it('the real tree has the recurring series', () => {
		expect([...seriesTagIndex().values()]).toContain('Picantearla');
	});

	it('empty without the root tag', () => {
		expect(seriesTagIndex([{ id: 'otra' }]).size).toBe(0);
	});
});

describe('eventSeriesTags', () => {
	const index = seriesTagIndex(tree);

	it('the series of an event, case-insensitive, without repeats, sorted', () => {
		expect(
			eventSeriesTags(['fiesta', 'serie uno', 'serie-1', 'Serie Uno Online', 'S2'], index)
		).toEqual(['Serie Dos', 'Serie Uno', 'Serie Uno Online']);
	});

	it('nothing for events outside a series or without tags', () => {
		expect(eventSeriesTags(['fiesta', 'taller'], index)).toEqual([]);
		expect(eventSeriesTags(undefined, index)).toEqual([]);
		expect(eventSeriesTags(['', 3, null], index)).toEqual([]);
	});
});
