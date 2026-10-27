/**
 * Lo que muestra cada pestaña de Estadísticas con órdenes (`/admin/estadisticas/ventas` y
 * `/asistencia`), para el período elegido (`$lib/admin/statsPeriod.js`). Puras: reciben las
 * órdenes que cargó la página (`loadPeopleOrders`) y reusan `computeStats` (stats.js) y los
 * gráficos de charts.js. Visitas al sitio no pasa por acá: no lee órdenes.
 *
 * Solo agregados: los mails se usan adentro para contar personas y no salen.
 */
import { seriesOf } from '$lib/utils/sheetImport.js';
import { eventSeriesTags, seriesTagIndex } from '$lib/utils/series.js';
import { dayNumber } from '$lib/admin/salesChart.js';
import { periodRange } from '$lib/admin/statsPeriod.js';
import { normalizeEmail, seriesLabel } from './people.js';
import { computeStats, monthKey } from './stats.js';
import { saleAt } from './saleMonth.js';
import { attendanceReturn, fondoByMonth, salesByDay, salesEvents } from './charts.js';

/** @typedef {import('./people.js').PersonOrder} PersonOrder */
/** @typedef {import('./people.js').EventInfo} EventInfo */
/** @typedef {import('$lib/admin/statsPeriod.js').Period} Period */

/** Cuántos eventos muestran como mucho los gráficos de asistencia (los más nuevos del período). */
export const ATTENDANCE_CHART_EVENTS = 24;

/**
 * Meses de calendario entre dos claves `YYYY-MM`, contando las dos.
 * @param {string} a
 * @param {string} b
 */
function monthsBetween(a, b) {
	const [ya, ma] = a.split('-').map(Number);
	const [yb, mb] = b.split('-').map(Number);
	return Math.max(1, (yb - ya) * 12 + (mb - ma) + 1);
}

/**
 * Entradas, plata, personas y entrada promedio de unas órdenes (solo las aprobadas).
 * @param {PersonOrder[]} orders
 */
export function salesKpis(orders) {
	const ok = orders.filter((o) => o.status === 'approved');
	const tickets = ok.reduce((s, o) => s + o.quantity, 0);
	const revenue = ok.reduce((s, o) => s + o.total, 0);
	return {
		tickets,
		revenue,
		people: new Set(ok.map((o) => normalizeEmail(o.buyer_email))).size,
		avgTicket: tickets ? Math.round(revenue / tickets) : 0
	};
}

/**
 * Las series con ventas para el filtro (clave = el slug sin la fecha, como «Por serie»), por
 * nombre. Si la elegida no tiene ventas cargadas, igual aparece (con su clave como nombre).
 * @param {PersonOrder[]} orders
 * @param {Map<string, EventInfo>} events
 * @param {string} [selected]
 * @returns {{ value: string, label: string }[]}
 */
export function serieOptions(orders, events, selected = '') {
	/** @type {Map<string, string>} */
	const map = new Map();
	for (const o of orders) {
		const key = seriesOf(o.event_slug);
		if (!map.has(key)) map.set(key, seriesLabel(events.get(o.event_slug)?.title ?? key));
	}
	if (selected && !map.has(selected)) map.set(selected, selected);
	return [...map.entries()]
		.map(([value, label]) => ({ value, label }))
		.sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/**
 * Fin (exclusivo) del mes calendario de Argentina que contiene `now`.
 * @param {number} now
 */
function monthEnd(now) {
	const [y, m] = monthKey(now).split('-').map(Number);
	// 1 del mes siguiente a las 00:00 de Argentina (UTC−3).
	return Date.UTC(y, m, 1, 3);
}

/**
 * Pestaña Ventas: KPIs (con el período anterior, si hay), ventas en el tiempo, por serie, cómo
 * pagan, opciones del fondo y Fondo y finanzas, todo del período y, si se eligió, de una serie.
 *
 * Todo cuenta por el **mes del evento** (./saleMonth.js): las ventas de los eventos que empiezan
 * desde el comienzo del período hasta el fin del mes en curso (en hora de Argentina), así los
 * números de arriba y los meses de «Fondo y finanzas» cierran con «Entradas este mes» del Inicio.
 * Solo el gráfico «Ventas en el tiempo» va por **fecha de compra** (muestra cuándo se vendió),
 * desde el comienzo del período hasta ahora. Las órdenes pueden traer de más (el período
 * anterior): se filtran acá.
 *
 * @param {PersonOrder[]} orders aprobadas y reembolsadas
 * @param {Map<string, EventInfo>} events
 * @param {{ period: Period, serie?: string, now?: number }} opts
 */
export function salesPage(orders, events, { period, serie = '', now = Date.now() }) {
	const range = periodRange(period, now);
	/** @param {PersonOrder} o */
	const ofSerie = (o) => !serie || seriesOf(o.event_slug) === serie;
	const end = monthEnd(now);
	const current = orders.filter((o) => {
		const t = saleAt(o);
		return ofSerie(o) && (range.from === null || t >= range.from) && t < end;
	});
	const previous =
		range.prevFrom === null || range.prevTo === null
			? null
			: orders.filter((o) => {
					const t = saleAt(o);
					return (
						ofSerie(o) &&
						t >= /** @type {number} */ (range.prevFrom) &&
						t < /** @type {number} */ (range.prevTo)
					);
				});
	const bought = orders.filter(
		(o) => ofSerie(o) && (range.from === null || o.created_at >= range.from) && o.created_at <= now
	);
	const stats = computeStats(current, events, { now });
	const days = salesByDay(bought);
	// El gráfico arranca donde arranca el período (con «todo», en la primera venta).
	const fromDay =
		range.from !== null ? dayNumber(range.from) : days.length ? days[0].day : dayNumber(now);
	const firstMonth =
		range.from !== null
			? monthKey(range.from)
			: current.length
				? monthKey(Math.min(...current.map(saleAt)))
				: monthKey(now);
	const months = monthsBetween(firstMonth, monthKey(now));
	return {
		period: period.id,
		serie,
		serieOptions: serieOptions(orders, events, serie),
		kpis: { ...salesKpis(current), refunded: stats.kpis.refunded },
		previous: previous ? salesKpis(previous) : null,
		bySeries: stats.bySeries,
		byMethod: stats.byMethod,
		byFondo: stats.byFondo,
		sales: {
			days,
			events: salesEvents(days, events),
			today: dayNumber(now),
			from: fromDay,
			// Cómo arranca agrupado el gráfico: por día en 30 días, por mes con todo.
			bucket: period.days === 30 ? 'day' : period.days || period.months ? 'week' : 'month'
		},
		fondo: fondoByMonth(current, { now, months })
	};
}

/**
 * KPIs de asistencia de los eventos que empezaron en `[from, to)`: vendidas y con check-in, y de
 * las personas que entraron, cuántas venían por primera vez a KinkyVibe y cuántas vinieron a 2
 * eventos o más (contando todo hasta `to`). Lo mismo dentro de cada serie (etiquetas bajo
 * «evento recurrente»).
 *
 * @param {PersonOrder[]} orders todas (hace falta la historia para «primera vez»)
 * @param {ReturnType<typeof computeStats>['perEvent']} perEvent eventos pasados, de computeStats
 * @param {Map<string, EventInfo>} events
 * @param {{ from: number | null, to: number, seriesIndex: Map<string, string> }} opts
 */
export function attendanceKpis(orders, perEvent, events, { from, to, seriesIndex }) {
	/** @param {string | null} start */
	const startMs = (start) => (start ? Date.parse(start) : NaN);
	/** @param {string | null} start */
	const inWindow = (start) => {
		const t = startMs(start);
		return Number.isFinite(t) && t < to && (from === null || t >= from);
	};
	const inRange = perEvent.filter((e) => inWindow(e.start));
	const sold = inRange.reduce((s, e) => s + e.sold, 0);
	const checked = inRange.reduce((s, e) => s + e.checked, 0);

	/** @type {Map<string, number>} */
	const startOf = new Map(perEvent.map((e) => [e.slug, startMs(e.start)]));
	/** Por persona: los eventos (hasta `to`) a los que entró. @type {Map<string, Set<string>>} */
	const byPerson = new Map();
	for (const o of orders) {
		if (o.status !== 'approved' || o.checked <= 0) continue;
		const t = startOf.get(o.event_slug);
		if (t === undefined || !Number.isFinite(t) || t >= to) continue;
		const email = normalizeEmail(o.buyer_email);
		if (!email) continue;
		const set = byPerson.get(email) ?? new Set();
		set.add(o.event_slug);
		byPerson.set(email, set);
	}
	const windowSlugs = new Set(inRange.map((e) => e.slug));
	/** @type {Map<string, string[]>} */
	const seriesCache = new Map();
	/** @param {string} slug */
	const seriesOfEvent = (slug) => {
		let s = seriesCache.get(slug);
		if (!s) {
			s = eventSeriesTags(events.get(slug)?.tags, seriesIndex);
			seriesCache.set(slug, s);
		}
		return s;
	};

	let people = 0;
	let firstTime = 0;
	let returning = 0;
	let seriesPeople = 0;
	let seriesReturning = 0;
	for (const slugs of byPerson.values()) {
		const here = [...slugs].filter((s) => windowSlugs.has(s));
		if (!here.length) continue;
		people++;
		const first = Math.min(...[...slugs].map((s) => /** @type {number} */ (startOf.get(s))));
		if (from === null || first >= from) firstTime++;
		if (slugs.size >= 2) returning++;
		const seriesHere = new Set(here.flatMap(seriesOfEvent));
		if (!seriesHere.size) continue;
		seriesPeople++;
		const sameSeries = [...seriesHere].some(
			(serie) => [...slugs].filter((s) => seriesOfEvent(s).includes(serie)).length >= 2
		);
		if (sameSeries) seriesReturning++;
	}
	return {
		events: inRange.length,
		sold,
		checked,
		checkinRate: sold ? checked / sold : 0,
		people,
		firstTime,
		returning,
		returningRate: people ? returning / people : 0,
		seriesPeople,
		seriesReturning
	};
}

/**
 * Pestaña Asistencia: los eventos que empezaron en el período. «Primera vez» y «vuelven» se
 * cuentan con toda la historia (por eso recibe todas las órdenes), y después se muestran solo
 * los eventos del período.
 *
 * @param {PersonOrder[]} orders todas las aprobadas y reembolsadas
 * @param {Map<string, EventInfo>} events
 * @param {{ period: Period, now?: number, seriesIndex?: Map<string, string> }} opts
 */
export function attendancePage(orders, events, { period, now = Date.now(), seriesIndex }) {
	const index = seriesIndex ?? seriesTagIndex();
	const range = periodRange(period, now);
	const stats = computeStats(orders, events, { now });
	const all = attendanceReturn(orders, stats.perEvent, events, index);
	/** @param {string | null} start */
	const inPeriod = (start) => {
		const t = start ? Date.parse(start) : NaN;
		return Number.isFinite(t) && t < now && (range.from === null || t >= range.from);
	};
	const rows = all.rows.filter((r) => inPeriod(r.start));
	const perEvent = stats.perEvent.filter((e) => inPeriod(e.start));
	const slugs = new Set(perEvent.map((e) => e.slug));
	const retention = computeStats(
		orders.filter((o) => slugs.has(o.event_slug)),
		events,
		{ now }
	).retention;
	const kpis = attendanceKpis(orders, stats.perEvent, events, {
		from: range.from,
		to: now,
		seriesIndex: index
	});
	const previous =
		range.prevFrom === null || range.prevTo === null
			? null
			: attendanceKpis(orders, stats.perEvent, events, {
					from: range.prevFrom,
					to: range.prevTo,
					seriesIndex: index
				});
	return {
		period: period.id,
		kpis,
		previous,
		rows: rows.slice(-ATTENDANCE_CHART_EVENTS),
		seriesRows: rows.filter((r) => r.seriesReturning !== null).slice(-ATTENDANCE_CHART_EVENTS),
		retention,
		perEvent
	};
}
