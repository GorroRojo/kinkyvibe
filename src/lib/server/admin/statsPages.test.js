/**
 * Las pestañas Ventas y Asistencia de Estadísticas con el período elegido. Datos inventados:
 * eventos «fiesta-…» (serie Fiesta Rara) y «taller-…», personas de example.com.
 */
import { describe, expect, it } from 'vitest';
import { SALES_PERIODS, parsePeriod } from '$lib/admin/statsPeriod.js';
import { dayNumber } from '$lib/admin/salesChart.js';
import {
	attendanceKpis,
	attendancePage,
	salesKpis,
	salesPage,
	serieOptions
} from './statsPages.js';
import { computeStats } from './stats.js';

const NOW = Date.parse('2026-10-11T15:00:00Z');
/** Mediodía de Argentina de una fecha. @param {string} iso */
const at = (iso) => Date.parse(`${iso}T12:00:00-03:00`);
/** @param {string} id */
const period = (id) => parsePeriod(id, SALES_PERIODS, '12m');

let n = 0;
/**
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
		created_at: at('2026-08-01'),
		checked: 0,
		...o
	};
}

/** @type {Map<string, import('./people.js').EventInfo>} */
const events = new Map([
	[
		'fiesta-2025-06',
		{ title: 'Fiesta Rara (junio)', start: '2025-06-20T22:00-03:00', tags: ['Fiesta Rara'] }
	],
	[
		'fiesta-2026-08',
		{ title: 'Fiesta Rara (agosto)', start: '2026-08-20T22:00-03:00', tags: ['Fiesta Rara'] }
	],
	['taller-2026-09', { title: 'Taller Inventado', start: '2026-09-25T18:00-03:00', tags: [] }],
	[
		'fiesta-2026-12',
		{ title: 'Fiesta Rara (diciembre)', start: '2026-12-20T22:00-03:00', tags: ['Fiesta Rara'] }
	]
]);
const seriesIndex = new Map([['fiesta rara', 'fiesta-rara']]);

const ana = 'ana@example.com';
const beto = 'beto@example.com';
const cata = 'cata@example.com';
const orders = [
	order({
		event_slug: 'fiesta-2025-06',
		buyer_email: ana,
		created_at: at('2025-06-01'),
		checked: 1
	}),
	order({ buyer_email: ana, created_at: at('2026-08-01'), checked: 1 }),
	order({
		buyer_email: beto,
		created_at: at('2026-08-20'),
		payment_method: 'transferencia',
		checked: 1
	}),
	order({
		buyer_email: ' Cata@Example.com ',
		created_at: at('2026-08-10'),
		total: 1500,
		checked: 1
	}),
	order({
		event_slug: 'taller-2026-09',
		buyer_email: cata,
		created_at: at('2026-09-20'),
		total: 500,
		fondo_contribution: 100,
		checked: 1
	}),
	// Compró y no vino.
	order({ buyer_email: 'dani@example.com', created_at: at('2026-09-15') }),
	// Un evento que todavía no pasó.
	order({
		event_slug: 'fiesta-2026-12',
		buyer_email: 'eli@example.com',
		created_at: at('2026-10-01'),
		quantity: 2,
		total: 3000
	}),
	order({ status: 'refunded', created_at: at('2026-08-02'), quantity: 5, total: 5000 })
];

describe('salesPage', () => {
	it('30 días: solo lo comprado en el período, comparado con los 30 días anteriores', () => {
		const s = salesPage(orders, events, { period: period('30d'), now: NOW });
		expect(s.period).toBe('30d');
		expect(s.kpis).toEqual({ tickets: 4, revenue: 4500, people: 3, avgTicket: 1125, refunded: 0 });
		// Del 11/8 al 11/9: la compra de beto (20/8).
		expect(s.previous).toEqual({ tickets: 1, revenue: 1000, people: 1, avgTicket: 1000 });
		expect(s.bySeries.map((x) => [x.series, x.tickets])).toEqual([
			['fiesta', 3],
			['taller', 1]
		]);
		// El gráfico arranca en el período y por día.
		expect(s.sales.from).toBe(dayNumber(NOW - 30 * 86_400_000));
		expect(s.sales.bucket).toBe('day');
		expect(s.sales.days.every((d) => d.day >= s.sales.from)).toBe(true);
		// Fondo: septiembre y octubre (el período cruza dos meses).
		expect(s.fondo.rows.map((r) => r.month)).toEqual(['2026-09', '2026-10']);
		expect(s.fondo.totals.contributed).toBe(100);
	});

	it('12 meses (por defecto): todo el último año, con el reembolso aparte', () => {
		const s = salesPage(orders, events, { period: period('12m'), now: NOW });
		expect(s.kpis).toMatchObject({ tickets: 7, revenue: 8000, refunded: 1 });
		expect(s.previous).toMatchObject({ tickets: 1, revenue: 1000 });
		expect(s.sales.bucket).toBe('week');
		expect(s.byMethod.map((m) => [m.key, m.orders])).toEqual([
			['mercadopago', 5],
			['transferencia', 1]
		]);
	});

	it('todo: desde la primera venta, sin período anterior', () => {
		const s = salesPage(orders, events, { period: period('todo'), now: NOW });
		expect(s.kpis.tickets).toBe(8);
		expect(s.previous).toBeNull();
		expect(s.sales.from).toBe(dayNumber(at('2025-06-01')));
		expect(s.sales.bucket).toBe('month');
		expect(s.fondo.rows[0].month).toBe('2025-06');
		expect(s.fondo.rows.at(-1)?.month).toBe('2026-10');
	});

	it('con una serie: solo sus ventas (y la anterior, de la misma serie)', () => {
		const s = salesPage(orders, events, { period: period('30d'), serie: 'fiesta', now: NOW });
		expect(s.serie).toBe('fiesta');
		expect(s.kpis).toMatchObject({ tickets: 3, revenue: 4000 });
		expect(s.previous).toMatchObject({ tickets: 1 });
		expect(s.bySeries.map((x) => x.series)).toEqual(['fiesta']);
		const taller = salesPage(orders, events, { period: period('30d'), serie: 'taller', now: NOW });
		expect(taller.kpis).toMatchObject({ tickets: 1, revenue: 500 });
		expect(taller.previous).toMatchObject({ tickets: 0 });
	});

	it('las opciones de serie, por nombre; la elegida aparece aunque no tenga ventas', () => {
		expect(serieOptions(orders, events)).toEqual([
			{ value: 'fiesta', label: 'Fiesta Rara' },
			{ value: 'taller', label: 'Taller Inventado' }
		]);
		expect(serieOptions(orders, events, 'otra').map((o) => o.value)).toContain('otra');
	});

	it('nada personal sale de la página: ni mails ni nombres', () => {
		const json = JSON.stringify(salesPage(orders, events, { period: period('todo'), now: NOW }));
		expect(json).not.toContain('@example.com');
		expect(json).not.toContain('Persona Inventada');
	});

	it('salesKpis no cuenta los reembolsos', () => {
		expect(salesKpis([order({ status: 'refunded' })])).toEqual({
			tickets: 0,
			revenue: 0,
			people: 0,
			avgTicket: 0
		});
	});
});

describe('attendancePage', () => {
	it('12 meses: los eventos pasados del período; «primera vez» con toda la historia', () => {
		const a = attendancePage(orders, events, { period: period('12m'), now: NOW, seriesIndex });
		expect(a.period).toBe('12m');
		expect(a.kpis).toEqual({
			events: 2,
			sold: 5,
			checked: 4,
			checkinRate: 0.8,
			people: 3,
			// ana ya había venido en junio de 2025.
			firstTime: 2,
			returning: 2,
			returningRate: 2 / 3,
			seriesPeople: 3,
			seriesReturning: 1
		});
		// El año anterior: la fiesta de junio de 2025, con ana por primera vez.
		expect(a.previous).toMatchObject({ events: 1, people: 1, firstTime: 1, returning: 0 });
		expect(a.rows.map((r) => r.slug)).toEqual(['fiesta-2026-08', 'taller-2026-09']);
		// En la fiesta de agosto, ana ya había venido (en 2025) y beto y cata no.
		expect(a.rows[0]).toMatchObject({ newcomers: 2, returning: 1, seriesReturning: 1 });
		expect(a.seriesRows.map((r) => r.slug)).toEqual(['fiesta-2026-08']);
		expect(a.perEvent.map((e) => e.slug)).toEqual(['taller-2026-09', 'fiesta-2026-08']);
		expect(a.retention.map((r) => r.series)).toEqual(['fiesta', 'taller']);
	});

	it('30 días: solo el taller; cata ya había venido, así que no es primera vez', () => {
		const a = attendancePage(orders, events, { period: period('30d'), now: NOW, seriesIndex });
		expect(a.kpis).toMatchObject({
			events: 1,
			sold: 1,
			checked: 1,
			people: 1,
			firstTime: 0,
			returning: 1,
			seriesPeople: 0
		});
		expect(a.rows.map((r) => r.slug)).toEqual(['taller-2026-09']);
		expect(a.seriesRows).toEqual([]);
		// Los 30 días anteriores: la fiesta de agosto.
		expect(a.previous).toMatchObject({ events: 1, people: 3 });
	});

	it('todo: todos los eventos pasados (el de diciembre todavía no), sin período anterior', () => {
		const a = attendancePage(orders, events, { period: period('todo'), now: NOW, seriesIndex });
		expect(a.kpis).toMatchObject({ events: 3, people: 3, firstTime: 3, returning: 2 });
		expect(a.previous).toBeNull();
		expect(a.perEvent.map((e) => e.slug)).not.toContain('fiesta-2026-12');
	});

	it('nada personal sale de la página', () => {
		const json = JSON.stringify(
			attendancePage(orders, events, { period: period('todo'), now: NOW, seriesIndex })
		);
		expect(json).not.toContain('@example.com');
		expect(json).not.toContain('Persona Inventada');
	});

	it('attendanceKpis sin eventos en el período: todo en cero, sin dividir por cero', () => {
		const stats = computeStats(orders, events, { now: NOW });
		const k = attendanceKpis(orders, stats.perEvent, events, {
			from: at('2020-01-01'),
			to: at('2020-02-01'),
			seriesIndex
		});
		expect(k).toEqual({
			events: 0,
			sold: 0,
			checked: 0,
			checkinRate: 0,
			people: 0,
			firstTime: 0,
			returning: 0,
			returningRate: 0,
			seriesPeople: 0,
			seriesReturning: 0
		});
	});
});
