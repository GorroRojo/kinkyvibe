/**
 * Estadísticas del panel (`/admin/estadisticas`): agregados de las órdenes aprobadas. Pura
 * (recibe lo que cargan `loadPeopleOrders` / `loadEventInfo` de people.js), para los tests.
 */
import { seriesOf } from '$lib/utils/sheetImport.js';
import { fondoOptionLabel } from '$lib/utils/tickets.js';
import { MONTHS_SHORT_ES, TIMEZONE } from '$lib/utils/dates.js';
import { normalizeEmail, seriesLabel } from './people.js';

/** @typedef {import('./people.js').PersonOrder} PersonOrder */
/** @typedef {import('./people.js').EventInfo} EventInfo */

/** "2026-09" en hora de Argentina. @param {number} ms */
export function monthKey(ms) {
	return new Date(ms).toLocaleDateString('en-CA', { timeZone: TIMEZONE }).slice(0, 7);
}

/** @param {string} key "2026-09" → "sep 26" */
export function monthLabel(key) {
	const [y, m] = key.split('-').map(Number);
	return `${MONTHS_SHORT_ES[m - 1]} ${String(y).slice(2)}`;
}

/**
 * Claves de los últimos `months` meses hasta el de `now`, de la más vieja a la más nueva.
 * @param {number} now
 * @param {number} months
 */
export function lastMonths(now, months) {
	const keys = [];
	const d = new Date(now);
	for (let i = months - 1; i >= 0; i--) {
		keys.push(monthKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 15)));
	}
	return keys;
}

const METHOD_LABELS = /** @type {Record<string, string>} */ ({
	mercadopago: 'Mercado Pago',
	transferencia: 'Transferencia',
	gratis: 'Sin cargo'
});

/**
 * @param {PersonOrder[]} allOrders órdenes aprobadas y reembolsadas
 * @param {Map<string, EventInfo>} events
 * @param {{ now?: number, months?: number }} [opts]
 */
export function computeStats(allOrders, events, { now = Date.now(), months = 12 } = {}) {
	const orders = allOrders.filter((o) => o.status === 'approved');
	/** @param {string} slug */
	const start = (slug) => {
		const s = events.get(slug)?.start;
		return s ? Date.parse(s) : NaN;
	};

	// Ventas por mes (fecha de compra), los últimos `months` meses, con los vacíos en 0.
	const keys = lastMonths(now, months);
	const byMonth = new Map(keys.map((k) => [k, { month: k, tickets: 0, revenue: 0, orders: 0 }]));
	for (const o of orders) {
		const m = byMonth.get(monthKey(o.created_at));
		if (!m) continue;
		m.tickets += o.quantity;
		m.revenue += o.total;
		m.orders++;
	}

	// Por serie.
	/** @type {Map<string, { series: string, title: string, tickets: number, revenue: number, events: Set<string> }>} */
	const bySeries = new Map();
	for (const o of orders) {
		const key = seriesOf(o.event_slug);
		const s = bySeries.get(key) ?? {
			series: key,
			title: seriesLabel(events.get(o.event_slug)?.title ?? key),
			tickets: 0,
			revenue: 0,
			events: new Set()
		};
		s.tickets += o.quantity;
		s.revenue += o.total;
		s.events.add(o.event_slug);
		bySeries.set(key, s);
	}

	// Por medio de pago y por opción del fondo (órdenes).
	/** @param {(o: PersonOrder) => string} key @param {(k: string) => string} label */
	const countBy = (key, label) => {
		/** @type {Map<string, { key: string, label: string, orders: number, tickets: number, revenue: number }>} */
		const m = new Map();
		for (const o of orders) {
			const k = key(o);
			const r = m.get(k) ?? { key: k, label: label(k), orders: 0, tickets: 0, revenue: 0 };
			r.orders++;
			r.tickets += o.quantity;
			r.revenue += o.total;
			m.set(k, r);
		}
		return [...m.values()].sort((a, b) => b.orders - a.orders);
	};
	const byMethod = countBy(
		(o) => o.payment_method,
		(k) => METHOD_LABELS[k] ?? k
	);
	const byFondo = countBy(
		(o) => o.fondo_option,
		(k) => (k === 'gorra' ? 'A la gorra' : fondoOptionLabel(/** @type {any} */ (k)) || k)
	);

	// Asistencia por evento pasado: vendidas, con check-in, primera vez en la serie.
	const past = [...new Set(orders.map((o) => o.event_slug))]
		.filter((s) => start(s) < now)
		.sort((a, b) => start(a) - start(b));
	/** Personas que ya vinieron a cada serie (en orden de fecha). */
	/** @type {Map<string, Set<string>>} */
	const seen = new Map();
	const perEvent = past.map((slug) => {
		const evOrders = orders.filter((o) => o.event_slug === slug);
		const sold = evOrders.reduce((s, o) => s + o.quantity, 0);
		const checked = evOrders.reduce((s, o) => s + Math.min(o.checked, o.quantity), 0);
		const series = seriesOf(slug);
		const already = seen.get(series) ?? new Set();
		const attendees = new Set(
			evOrders.filter((o) => o.checked > 0).map((o) => normalizeEmail(o.buyer_email))
		);
		const firstTimers = [...attendees].filter((e) => !already.has(e)).length;
		for (const e of attendees) already.add(e);
		seen.set(series, already);
		return {
			slug,
			title: events.get(slug)?.title ?? slug,
			start: events.get(slug)?.start ?? null,
			series,
			sold,
			checked,
			rate: sold ? checked / sold : 0,
			attendees: attendees.size,
			firstTimers
		};
	});

	// Vuelven: por serie, cuántas personas vinieron a 2 o más eventos de esa serie.
	/** @type {Map<string, Map<string, Set<string>>>} */
	const visits = new Map();
	for (const o of orders) {
		if (o.checked <= 0) continue;
		const series = seriesOf(o.event_slug);
		const bySerie = visits.get(series) ?? new Map();
		const email = normalizeEmail(o.buyer_email);
		const slugs = bySerie.get(email) ?? new Set();
		slugs.add(o.event_slug);
		bySerie.set(email, slugs);
		visits.set(series, bySerie);
	}
	const retention = [...visits.entries()]
		.map(([series, people]) => {
			const counts = [...people.values()].map((v) => v.size);
			return {
				series,
				title: bySeries.get(series)?.title ?? series,
				people: counts.length,
				returning: counts.filter((n) => n >= 2).length,
				rate: counts.length ? counts.filter((n) => n >= 2).length / counts.length : 0
			};
		})
		.sort((a, b) => b.people - a.people);

	const totalTickets = orders.reduce((s, o) => s + o.quantity, 0);
	const totalChecked = perEvent.reduce((s, e) => s + e.checked, 0);
	const totalSoldPast = perEvent.reduce((s, e) => s + e.sold, 0);
	const people = new Set(orders.map((o) => normalizeEmail(o.buyer_email)));
	const allVisits = [...visits.values()].flatMap((m) => [...m.entries()]);
	/** @type {Map<string, number>} */
	const eventsPerPerson = new Map();
	for (const [email, set] of allVisits)
		eventsPerPerson.set(email, (eventsPerPerson.get(email) ?? 0) + set.size);
	const returningAny = [...eventsPerPerson.values()].filter((n) => n >= 2).length;

	return {
		kpis: {
			tickets: totalTickets,
			revenue: orders.reduce((s, o) => s + o.total, 0),
			people: people.size,
			avgTicket: totalTickets
				? Math.round(orders.reduce((s, o) => s + o.total, 0) / totalTickets)
				: 0,
			checkinRate: totalSoldPast ? totalChecked / totalSoldPast : 0,
			returningRate: eventsPerPerson.size ? returningAny / eventsPerPerson.size : 0,
			refunded: allOrders.filter((o) => o.status === 'refunded').length
		},
		byMonth: [...byMonth.values()].map((m) => ({ ...m, label: monthLabel(m.month) })),
		bySeries: [...bySeries.values()]
			.map((s) => ({
				series: s.series,
				title: s.title,
				tickets: s.tickets,
				revenue: s.revenue,
				events: s.events.size
			}))
			.sort((a, b) => b.tickets - a.tickets),
		byMethod,
		byFondo,
		retention,
		perEvent: perEvent.reverse()
	};
}
