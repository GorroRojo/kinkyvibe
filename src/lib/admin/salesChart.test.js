import { describe, expect, it } from 'vitest';
import {
	alignPrevious,
	buildSalesChart,
	channelOf,
	cumulativeSeries,
	dayDate,
	dayNumber,
	dayShort,
	previousEditions,
	projectSales,
	projectionSentence,
	recentPace,
	seriesKey
} from './salesChart.js';

/** Mediodía en Argentina de un día YYYY-MM-DD. */
const at = (/** @type {string} */ date, hour = 12) =>
	new Date(`${date}T${String(hour).padStart(2, '0')}:00:00-03:00`).getTime();
const day = (/** @type {string} */ date) => dayNumber(at(date));

/** @param {string} date @param {number} quantity @param {Record<string, any>} [extra] */
const order = (date, quantity, extra = {}) => ({
	status: 'approved',
	quantity,
	created_at: at(date),
	payment_method: 'mercadopago',
	...extra
});

describe('días', () => {
	it('usa la fecha de Argentina (UTC−3), también cerca de medianoche', () => {
		expect(dayDate(day('2026-10-08'))).toBe('2026-10-08');
		// 23:30 en Argentina ya es el día siguiente en UTC: sigue siendo el 8.
		expect(dayDate(dayNumber(at('2026-10-08', 23) + 30 * 60 * 1000))).toBe('2026-10-08');
		expect(dayShort(day('2026-10-08'))).toBe('8/10');
		expect(dayShort(day('2026-10-08'), true)).toBe('jue 8/10');
	});
});

describe('channelOf', () => {
	it('separa online, puerta y cortesía', () => {
		expect(channelOf({ payment_method: 'mercadopago' })).toBe('online');
		expect(channelOf({ payment_method: 'transferencia' })).toBe('online');
		expect(channelOf({ payment_method: 'efectivo' })).toBe('puerta');
		expect(channelOf({ payment_method: 'transferencia', channel: 'puerta' })).toBe('puerta');
		expect(channelOf({ payment_method: 'gratis' })).toBe('cortesia');
		expect(channelOf({ payment_method: 'transferencia', channel: 'manual' })).toBe('cortesia');
	});
});

describe('cumulativeSeries', () => {
	it('acumula por día y por canal, con los días sin ventas y solo aprobadas', () => {
		const from = day('2026-10-01');
		const s = cumulativeSeries(
			[
				order('2026-10-01', 2),
				order('2026-10-03', 1, { payment_method: 'efectivo' }),
				order('2026-10-03', 3, { payment_method: 'gratis' }),
				order('2026-10-02', 5, { status: 'pending' }),
				order('2026-10-02', 4, { status: 'refunded' })
			],
			{ from, to: from + 3 }
		);
		expect(s.map((p) => p.total)).toEqual([2, 2, 6, 6]);
		expect(s.map((p) => p.added)).toEqual([2, 0, 4, 0]);
		expect(s[3]).toMatchObject({ online: 2, puerta: 1, cortesia: 3, day: from + 3 });
	});

	it('lo vendido antes del rango entra en el primer día; lo de después, no', () => {
		const from = day('2026-10-05');
		const s = cumulativeSeries([order('2026-09-20', 3), order('2026-10-09', 1)], {
			from,
			to: from + 1
		});
		expect(s.map((p) => p.total)).toEqual([3, 3]);
	});
});

describe('recentPace', () => {
	const series = (/** @type {number[]} */ totals) =>
		totals.map((total, i) => ({ day: i, total, online: total, puerta: 0, cortesia: 0, added: 0 }));

	it('promedia los últimos 7 días', () => {
		// Los 7 días que terminan hoy: de 4 (antes de la ventana) a 18 → 2 por día.
		expect(recentPace(series([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]))).toEqual({
			perDay: 2,
			days: 7
		});
	});

	it('con menos de 7 días de historia usa los que hay; con menos de 3, nada', () => {
		expect(recentPace(series([0, 0, 3, 6, 9]))).toEqual({ perDay: 3, days: 3 });
		expect(recentPace(series([0, 0, 0, 4, 8]))).toBeNull();
		expect(recentPace(series([0, 0, 0]))).toBeNull();
		expect(recentPace([])).toBeNull();
	});
});

describe('projectSales', () => {
	const today = 100;

	it('sin cupo: llega a lo vendido + ritmo × días que faltan', () => {
		const p = projectSales({ sold: 10, today, eventDay: 110, pace: 1.5, capacity: null });
		expect(p?.final).toBe(25);
		expect(p?.sellOutDay).toBeNull();
		expect(p?.points).toEqual([
			{ day: 100, total: 10 },
			{ day: 110, total: 25 }
		]);
	});

	it('con cupo: se corta el día en que se agotaría', () => {
		const p = projectSales({ sold: 30, today, eventDay: 120, pace: 4, capacity: 40 });
		expect(p?.sellOutDay).toBe(103);
		expect(p?.final).toBe(40);
		expect(p?.points.at(-1)).toEqual({ day: 103, total: 40 });
	});

	it('nada que proyectar: sin ritmo, evento hoy o pasado, o ya en el cupo (o sobrevendido)', () => {
		expect(projectSales({ sold: 5, today, eventDay: 110, pace: 0, capacity: null })).toBeNull();
		expect(projectSales({ sold: 5, today, eventDay: 110, pace: null, capacity: null })).toBeNull();
		expect(projectSales({ sold: 5, today, eventDay: 100, pace: 2, capacity: null })).toBeNull();
		expect(projectSales({ sold: 5, today, eventDay: null, pace: 2, capacity: null })).toBeNull();
		expect(projectSales({ sold: 42, today, eventDay: 110, pace: 2, capacity: 40 })).toBeNull();
	});
});

describe('projectionSentence', () => {
	const base = { today: day('2026-10-01'), eventDay: day('2026-10-10'), capacity: null };
	const pace = { perDay: 2, days: 7 };

	it('dice a cuántas se llegaría el día del evento', () => {
		const projection = projectSales({ ...base, sold: 10, pace: 2 });
		expect(projectionSentence({ ...base, sold: 10, pace, projection })).toBe(
			'A este ritmo llegarías a ~28 entradas el sáb 10/10, el día del evento.'
		);
	});

	it('o el día en que se agotaría', () => {
		const input = { ...base, sold: 30, capacity: 40 };
		const projection = projectSales({ ...input, pace: 2 });
		expect(projectionSentence({ ...input, pace, projection })).toBe(
			'A este ritmo se agotaría el mar 6/10.'
		);
	});

	it('sobrevendidas, agotadas, sin datos y sin ventas recientes', () => {
		const none = { pace: null, projection: null };
		expect(projectionSentence({ ...base, ...none, sold: 45, capacity: 40 })).toBe(
			'Sobrevendidas: 5 por encima del cupo de 40.'
		);
		expect(projectionSentence({ ...base, ...none, sold: 40, capacity: 40 })).toBe(
			'Agotadas: se llegó al cupo.'
		);
		expect(projectionSentence({ ...base, ...none, sold: 3 })).toMatch(/pocos días/);
		expect(
			projectionSentence({ ...base, sold: 3, pace: { perDay: 0, days: 7 }, projection: null })
		).toBe('Sin ventas en los últimos 7 días.');
		expect(projectionSentence({ ...base, ...none, sold: 3, eventDay: base.today - 1 })).toBe('');
	});
});

describe('series y edición anterior', () => {
	it('seriesKey corta en el año o el mes', () => {
		expect(seriesKey('picantearla-2026-10')).toBe('picantearla');
		expect(seriesKey('picantearla-deluxe-2025-02')).toBe('picantearla-deluxe');
		expect(seriesKey('picantearla-octubre-2023')).toBe('picantearla');
		expect(seriesKey('cine-para-sucixs')).toBe('cine-para-sucixs');
	});

	it('previousEditions: misma serie, antes de este evento, la más reciente primero', () => {
		const events = [
			{ slug: 'picantearla-2026-08', start: 8 },
			{ slug: 'picantearla-2026-09', start: 9 },
			{ slug: 'picantearla-deluxe-2026-09', start: 9 },
			{ slug: 'picantearla-2026-11', start: 11 },
			{ slug: 'picantearla-sin-fecha', start: null },
			{ slug: 'picantearla-2026-10', start: 10 }
		];
		expect(
			previousEditions(events, { slug: 'picantearla-2026-10', start: 10 }).map((e) => e.slug)
		).toEqual(['picantearla-2026-09', 'picantearla-2026-08']);
	});

	it('alignPrevious alinea por días antes del evento', () => {
		// Anterior: evento el día 50, vendió 2 el día 40 (10 antes) y 3 el 48 (2 antes).
		// Este evento es el día 100: esas ventas caen en los días 90 y 98.
		const pts = alignPrevious(
			[
				{ day: 40, tickets: 2 },
				{ day: 48, tickets: 3 },
				{ day: 20, tickets: 1 } // antes del rango: entra en el primer punto
			],
			{ prevEventDay: 50, eventDay: 100, from: 88, to: 100 }
		);
		expect(pts[0]).toEqual({ day: 88, total: 1 });
		expect(pts.find((p) => p.day === 89)?.total).toBe(1);
		expect(pts.find((p) => p.day === 90)?.total).toBe(3);
		expect(pts.find((p) => p.day === 98)?.total).toBe(6);
		expect(pts.at(-1)).toEqual({ day: 100, total: 6 });
	});
});

describe('buildSalesChart', () => {
	const now = at('2026-10-10');
	const base = {
		now,
		opensAt: at('2026-10-01'),
		eventStart: at('2026-10-17', 21),
		capacity: 40,
		orders: [
			order('2026-10-01', 4),
			order('2026-10-03', 2),
			order('2026-10-05', 3, { payment_method: 'gratis' }),
			order('2026-10-09', 7)
		]
	};

	it('rango de la apertura al evento; serie real hasta hoy; canales con ventas', () => {
		const c = buildSalesChart(base);
		expect(dayDate(c.from)).toBe('2026-10-01');
		expect(dayDate(c.to)).toBe('2026-10-17');
		expect(dayDate(c.today)).toBe('2026-10-10');
		expect(c.series).toHaveLength(10);
		expect(c.sold).toBe(16);
		expect(c.channels).toEqual(['online', 'cortesia']);
		// Los 7 días que terminan hoy (del 4 al 10): 3 + 7 = 10 → 10/7 por día; faltan 7 días.
		expect(c.pace?.perDay).toBeCloseTo(10 / 7);
		expect(c.projection?.final).toBeCloseTo(16 + 10);
		expect(c.sentence).toMatch(/^A este ritmo llegarías a ~26 entradas el sáb 17\/10/);
	});

	it('sin cupo y sobrevendido', () => {
		expect(buildSalesChart({ ...base, capacity: null }).capacity).toBeNull();
		const over = buildSalesChart({ ...base, capacity: 10 });
		expect(over.projection).toBeNull();
		expect(over.sentence).toBe('Sobrevendidas: 6 por encima del cupo de 10.');
	});

	it('las ventas previas a la apertura amplían el rango; los cierres son marcas', () => {
		const c = buildSalesChart({
			...base,
			orders: [...base.orders, order('2026-09-28', 2, { payment_method: 'gratis' })],
			closes: [
				{ name: 'Anticipada', at: at('2026-10-05', 23) },
				{ name: 'Preventa', at: at('2026-10-05', 12) },
				{ name: 'Vieja', at: at('2026-08-01') }
			]
		});
		expect(dayDate(c.from)).toBe('2026-09-28');
		expect(c.markers).toEqual([{ day: day('2026-10-05'), label: 'cierra Anticipada y Preventa' }]);
	});

	it('evento pasado: sin proyección ni frase de ritmo', () => {
		const c = buildSalesChart({ ...base, now: at('2026-10-20') });
		expect(dayDate(c.to)).toBe('2026-10-17');
		expect(c.series.at(-1)?.day).toBe(c.to);
		expect(c.projection).toBeNull();
		expect(c.sentence).toBe('');
	});

	it('edición anterior alineada, con lo que llevaba a esta altura', () => {
		const c = buildSalesChart({
			...base,
			previous: {
				slug: 'picantearla-2026-09',
				title: 'Picantearla septiembre',
				start: at('2026-09-19', 21),
				daily: [
					{ day: day('2026-09-10'), tickets: 5 }, // 9 días antes → 8/10
					{ day: day('2026-09-18'), tickets: 10 } // 1 día antes → 16/10
				]
			}
		});
		expect(c.previous?.atToday).toBe(5);
		expect(c.previous?.final).toBe(15);
		expect(c.previous?.points.at(-1)?.total).toBe(15);
	});

	it('sin ventas en la anterior: no hay comparación', () => {
		const c = buildSalesChart({
			...base,
			previous: { slug: 'x-2026-09', title: 'X', start: at('2026-09-19'), daily: [] }
		});
		expect(c.previous).toBeNull();
	});
});
