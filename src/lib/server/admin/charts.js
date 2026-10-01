/**
 * Datos de los gráficos de Estadísticas (`/admin/estadisticas`): ventas en el tiempo,
 * asistencia y vuelta, y Fondo y finanzas. Puras: reciben las órdenes que ya carga la página
 * (`loadPeopleOrders`, una sola consulta) y lo que calcula `computeStats`, así no hay consultas
 * de más contra D1.
 *
 * Solo agregados: nada de lo que sale de acá tiene nombres ni mails (los mails se usan adentro
 * para contar quién vuelve y no salen).
 */
import { dayNumber } from '$lib/admin/salesChart.js';
import { normalizeEmail } from './people.js';
import { lastMonths, monthKey, monthLabel } from './stats.js';

/** @typedef {import('./people.js').PersonOrder} PersonOrder */
/** @typedef {import('./people.js').EventInfo} EventInfo */
/** @typedef {ReturnType<typeof import('./stats.js').computeStats>} Stats */

/**
 * @typedef {{ day: number, slug: string, tickets: number, revenue: number }} SalesDay
 */

/**
 * Entradas y plata por evento y por día de compra (hora de Argentina), solo aprobadas. Es lo que
 * viaja a la página: con esto el navegador arma día/semana y general/por evento
 * (`bucketSales` de $lib/admin/chartSeries.js) sin volver a pedir nada.
 * @param {PersonOrder[]} orders
 * @returns {SalesDay[]} ordenado por día
 */
export function salesByDay(orders) {
	/** @type {Map<string, SalesDay>} */
	const map = new Map();
	for (const o of orders) {
		if (o.status !== 'approved') continue;
		const day = dayNumber(o.created_at);
		const key = `${day}|${o.event_slug}`;
		const r = map.get(key) ?? { day, slug: o.event_slug, tickets: 0, revenue: 0 };
		r.tickets += o.quantity;
		r.revenue += o.total;
		map.set(key, r);
	}
	return [...map.values()].sort((a, b) => a.day - b.day || a.slug.localeCompare(b.slug));
}

/**
 * Eventos con ventas para el selector del gráfico, del más nuevo al más viejo.
 * @param {SalesDay[]} days
 * @param {Map<string, EventInfo>} events
 */
export function salesEvents(days, events) {
	const slugs = [...new Set(days.map((d) => d.slug))];
	return slugs
		.map((slug) => ({
			slug,
			title: events.get(slug)?.title ?? slug,
			start: events.get(slug)?.start ?? null
		}))
		.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
}

/**
 * Asistencia y vuelta por evento pasado: vendidas y con check-in (de `computeStats().perEvent`),
 * y de quienes entraron, cuántes venían por primera vez a KinkyVibe (cualquier serie) y cuántes
 * ya habían venido a otro evento antes. Más el total: de todas las personas que entraron alguna
 * vez, cuántas volvieron a otro evento.
 * @param {PersonOrder[]} orders
 * @param {Stats['perEvent']} perEvent
 */
export function attendanceReturn(orders, perEvent) {
	/** @type {Map<string, Set<string>>} quién entró a cada evento */
	const bySlug = new Map();
	for (const o of orders) {
		if (o.status !== 'approved' || o.checked <= 0) continue;
		const email = normalizeEmail(o.buyer_email);
		if (!email) continue;
		const set = bySlug.get(o.event_slug) ?? new Set();
		set.add(email);
		bySlug.set(o.event_slug, set);
	}
	// perEvent viene del más nuevo al más viejo: se recorre al revés para saber quién ya vino.
	const chronological = [...perEvent].sort(
		(a, b) => Date.parse(a.start ?? '') - Date.parse(b.start ?? '')
	);
	/** @type {Map<string, number>} */
	const visits = new Map();
	const rows = chronological.map((e) => {
		const people = [...(bySlug.get(e.slug) ?? [])];
		const returning = people.filter((p) => visits.has(p)).length;
		for (const p of people) visits.set(p, (visits.get(p) ?? 0) + 1);
		return {
			slug: e.slug,
			title: e.title,
			start: e.start,
			sold: e.sold,
			checked: e.checked,
			noShow: Math.max(0, e.sold - e.checked),
			newcomers: people.length - returning,
			returning
		};
	});
	const counts = [...visits.values()];
	return {
		rows,
		people: counts.length,
		cameBack: counts.filter((n) => n >= 2).length
	};
}

/**
 * Fondo y finanzas por mes (fecha de compra, aprobadas): lo que cubrió el Fondo (descuentos
 * `fondo`), lo que se aportó (opciones solidarias), el neto (aportado − usado) y el recargo de
 * Mercado Pago que pagaron les compradores.
 * @param {PersonOrder[]} orders
 * @param {{ now?: number, months?: number }} [opts]
 */
export function fondoByMonth(orders, { now = Date.now(), months = 12 } = {}) {
	const map = new Map(
		lastMonths(now, months).map((m) => [
			m,
			{ month: m, label: monthLabel(m), used: 0, contributed: 0, net: 0, surcharge: 0 }
		])
	);
	for (const o of orders) {
		if (o.status !== 'approved') continue;
		const r = map.get(monthKey(o.created_at));
		if (!r) continue;
		r.used += o.fondo_amount;
		r.contributed += o.fondo_contribution;
		r.surcharge += o.surcharge_amount ?? 0;
	}
	const rows = [...map.values()].map((r) => ({ ...r, net: r.contributed - r.used }));
	const sum = (/** @type {'used'|'contributed'|'surcharge'} */ k) =>
		rows.reduce((s, r) => s + r[k], 0);
	return {
		rows,
		totals: {
			used: sum('used'),
			contributed: sum('contributed'),
			net: sum('contributed') - sum('used'),
			surcharge: sum('surcharge')
		}
	};
}

/**
 * Todo lo de los gráficos, de una vez.
 * @param {PersonOrder[]} orders
 * @param {Map<string, EventInfo>} events
 * @param {Stats} stats
 * @param {{ now?: number }} [opts]
 */
export function computeCharts(orders, events, stats, { now = Date.now() } = {}) {
	const days = salesByDay(orders);
	return {
		sales: { days, events: salesEvents(days, events), today: dayNumber(now) },
		attendance: attendanceReturn(orders, stats.perEvent),
		fondo: fondoByMonth(orders, { now })
	};
}
