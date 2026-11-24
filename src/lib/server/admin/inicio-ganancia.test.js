/**
 * La ganancia en el Inicio (Mesa 24/11): en cada próximo con entradas (y en su meta de ganancia),
 * los últimos eventos que pasaron y la suma del mes. Eventos inventados.
 */
import { describe, expect, it } from 'vitest';
import { monthProfit, monthTicketedSlugs, recentPastTicketed, upcomingEvents } from './inicio.js';

const NOW = Date.parse('2026-11-24T15:00:00-03:00');
/** @param {string} slug @param {string} start @param {object} [extra] */
const ev = (slug, start, extra = {}) =>
	/** @type {any} */ ({ slug, title: slug, start, unpublished: false, unlisted: false, ...extra });
const events = [
	ev('hace-40-dias', '2026-10-15T20:00-03:00'),
	ev('a-principio-de-mes', '2026-11-02T20:00-03:00'),
	ev('ayer', '2026-11-23T20:00-03:00'),
	ev('ayer-sin-entradas', '2026-11-23T21:00-03:00'),
	ev('hoy', '2026-11-24T20:00-03:00'),
	ev('en-diciembre', '2026-12-05T20:00-03:00')
];
const config = /** @type {any} */ ({
	types: [{ id: 'general', name: 'General', capacity: 10 }],
	goal: { kind: 'ganancia', value: 100000 },
	status: 'abierto'
});
const ticketed = new Map(
	events.filter((e) => e.slug !== 'ayer-sin-entradas').map((e) => [e.slug, config])
);
/** @param {number} amount @param {boolean} [closed] */
const profit = (amount, closed = false) => ({
	amount,
	closed,
	noExpenses: !closed,
	venueDefault: false,
	income: amount,
	expenses: 0
});

describe('ganancia en el Inicio', () => {
	it('los que pasaron en los últimos 30 días, del más nuevo al más viejo', () => {
		expect(recentPastTicketed({ events, ticketed, now: NOW }).map((e) => e.slug)).toEqual([
			'ayer',
			'a-principio-de-mes'
		]);
	});

	it('la ganancia del mes suma los de este mes (cerrados o estimados)', () => {
		const slugs = monthTicketedSlugs({ events, ticketed, now: NOW });
		expect(slugs).toEqual(['a-principio-de-mes', 'ayer', 'hoy']);
		const profits = new Map([
			['a-principio-de-mes', profit(50000, true)],
			['ayer', profit(-10000)],
			['en-diciembre', profit(99999)]
		]);
		expect(monthProfit(slugs, profits)).toEqual({ amount: 40000, events: 2, closed: 1 });
		expect(monthProfit(slugs, null)).toBeNull();
		expect(monthProfit(slugs, new Map())).toBeNull();
	});

	it('cada próximo con entradas lleva su ganancia, y la meta de ganancia la usa', () => {
		const profits = new Map([['hoy', profit(60000)]]);
		const [hoy, dic] = upcomingEvents({ events, ticketed, profits, now: NOW });
		expect(hoy.profit).toEqual(profit(60000));
		expect(hoy.progress?.kind).toBe('ganancia');
		expect(hoy.progress?.pct).toBe(60);
		// Sin ganancia (no vendió nada): sin meta, como siempre.
		expect(dic.profit).toBeNull();
		expect(dic.progress).toBeNull();
	});
});
