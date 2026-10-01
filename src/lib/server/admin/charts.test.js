import { describe, expect, it } from 'vitest';
import {
	attendanceReturn,
	computeCharts,
	fondoByMonth,
	salesByDay,
	salesEvents
} from './charts.js';
import { computeStats } from './stats.js';

/** 21:00 hora de Argentina de una fecha (= 00:00 UTC del día siguiente). @param {string} iso */
const at = (iso) => Date.parse(`${iso}T21:00:00-03:00`);
/** @param {string} iso */
const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

let n = 0;
/**
 * Orden inventada.
 * @param {Partial<import('./people.js').PersonOrder>} o
 * @returns {import('./people.js').PersonOrder}
 */
function order(o) {
	n++;
	return {
		id: `o${n}`,
		event_slug: 'fiesta-2026-08',
		ticket_type: 'general',
		quantity: 1,
		total: 1000,
		payment_method: 'mercadopago',
		fondo_option: 'completo',
		fondo_amount: 0,
		fondo_contribution: 0,
		surcharge_amount: 0,
		buyer_name: 'Persona Inventada',
		buyer_pronouns: null,
		buyer_email: `persona${n}@example.com`,
		status: 'approved',
		created_at: at('2026-08-10'),
		checked: 0,
		...o
	};
}

const events = new Map([
	['fiesta-2026-08', { title: 'Fiesta de agosto', start: '2026-08-20T22:00-03:00' }],
	['fiesta-2026-09', { title: 'Fiesta de septiembre', start: '2026-09-20T22:00-03:00' }],
	['taller-2026-09', { title: 'Taller inventado', start: '2026-09-05T18:00-03:00' }]
]);

describe('salesByDay', () => {
	it('adds approved tickets and money per event and Argentina day, nothing personal', () => {
		const rows = salesByDay([
			order({ quantity: 2, total: 2000 }),
			order({ quantity: 1, total: 1000 }),
			order({ status: 'refunded', quantity: 9 }),
			order({ event_slug: 'fiesta-2026-09', created_at: at('2026-09-01') })
		]);
		expect(rows).toEqual([
			{ day: dayOf('2026-08-10'), slug: 'fiesta-2026-08', tickets: 3, revenue: 3000 },
			{ day: dayOf('2026-09-01'), slug: 'fiesta-2026-09', tickets: 1, revenue: 1000 }
		]);
		expect(salesEvents(rows, events).map((e) => e.slug)).toEqual([
			'fiesta-2026-09',
			'fiesta-2026-08'
		]);
	});
});

describe('attendanceReturn', () => {
	it('counts newcomers and people who came back to another event, in date order', () => {
		const orders = [
			order({ buyer_email: 'a@example.com', checked: 1 }),
			order({ buyer_email: 'b@example.com', checked: 1 }),
			order({ buyer_email: 'c@example.com', quantity: 2, checked: 0 }),
			order({ event_slug: 'taller-2026-09', buyer_email: ' A@example.com ', checked: 1 }),
			order({ event_slug: 'fiesta-2026-09', buyer_email: 'a@example.com', checked: 1 }),
			order({ event_slug: 'fiesta-2026-09', buyer_email: 'b@example.com', checked: 1 }),
			order({ event_slug: 'fiesta-2026-09', buyer_email: 'd@example.com', checked: 1 })
		];
		const stats = computeStats(orders, events, { now: at('2026-10-01') });
		const r = attendanceReturn(orders, stats.perEvent);
		expect(
			r.rows.map((e) => [e.slug, e.sold, e.checked, e.noShow, e.newcomers, e.returning])
		).toEqual([
			['fiesta-2026-08', 4, 2, 2, 2, 0],
			['taller-2026-09', 1, 1, 0, 0, 1],
			['fiesta-2026-09', 3, 3, 0, 1, 2]
		]);
		expect(r).toMatchObject({ people: 3, cameBack: 2 });
		expect(JSON.stringify(r)).not.toContain('example.com');
	});
});

describe('fondoByMonth', () => {
	it('adds what the Fondo covered and received, the net and the MP surcharge per month', () => {
		const r = fondoByMonth(
			[
				order({ fondo_option: 'fondo', fondo_amount: 500, total: 500 }),
				order({ fondo_option: 'solidaria', fondo_contribution: 300, surcharge_amount: 70 }),
				order({ created_at: at('2026-09-02'), fondo_option: 'sugar', fondo_contribution: 1000 }),
				order({ status: 'refunded', fondo_contribution: 999 })
			],
			{ now: at('2026-09-15'), months: 3 }
		);
		expect(r.rows.map((m) => [m.month, m.used, m.contributed, m.net, m.surcharge])).toEqual([
			['2026-07', 0, 0, 0, 0],
			['2026-08', 500, 300, -200, 70],
			['2026-09', 0, 1000, 1000, 0]
		]);
		expect(r.totals).toEqual({ used: 500, contributed: 1300, net: 800, surcharge: 70 });
	});
});

describe('computeCharts', () => {
	it('puts it all together for the page', () => {
		const orders = [order({ checked: 1 })];
		const now = at('2026-10-01');
		const c = computeCharts(orders, events, computeStats(orders, events, { now }), { now });
		expect(c.sales.today).toBe(dayOf('2026-10-01'));
		expect(c.sales.days).toHaveLength(1);
		expect(c.attendance.rows).toHaveLength(1);
		expect(c.fondo.rows).toHaveLength(12);
	});
});
