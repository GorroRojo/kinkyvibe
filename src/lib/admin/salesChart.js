/**
 * Datos del "termómetro de ventas" de la pestaña Ventas (/admin/eventos/<slug>/ventas): entradas
 * vendidas acumuladas por día y por canal, el ritmo reciente, la proyección al día del evento y
 * la edición anterior de la serie alineada por días antes del evento.
 *
 * Funciones puras (sin D1 ni DOM): sirven en el servidor y en el navegador, y se prueban solas.
 * Los días son números enteros (días desde 1970 en hora de Argentina, UTC−3 fijo), así la cuenta
 * de "días antes del evento" es una resta.
 */

/** Argentina no tiene horario de verano: UTC−3 fijo (igual que el resto del sitio). */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Canales, en el orden en que se apilan (de abajo hacia arriba). */
export const CHANNELS = /** @type {const} */ (['online', 'puerta', 'cortesia']);
/** @typedef {(typeof CHANNELS)[number]} Channel */

export const CHANNEL_LABELS = /** @type {Record<Channel, string>} */ ({
	online: 'Online',
	puerta: 'En la puerta',
	cortesia: 'Cortesía / sin cargo'
});

/** Días de ritmo reciente para la proyección, y mínimo de días con historia para proyectar. */
export const PACE_WINDOW = 7;
export const MIN_HISTORY_DAYS = 3;

/**
 * Día (entero) de un instante, en hora de Argentina.
 * @param {number} ms
 */
export function dayNumber(ms) {
	return Math.floor((ms - AR_OFFSET_MS) / DAY_MS);
}

/**
 * YYYY-MM-DD de un día.
 * @param {number} day
 */
export function dayDate(day) {
	return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/**
 * "8/10" o, con el día de la semana, "jue 8/10".
 * @param {number} day
 * @param {boolean} [weekday]
 */
export function dayShort(day, weekday = false) {
	const d = new Date(day * DAY_MS);
	const text = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
	return weekday ? `${WEEKDAYS[d.getUTCDay()]} ${text}` : text;
}

/**
 * Canal de venta de una orden:
 * - `puerta`: vendida en la puerta (`channel = 'puerta'`, o pagada en efectivo);
 * - `cortesia`: sin cargo (entrada gratis o de cortesía cargada a mano);
 * - `online`: la compra de la página (Mercado Pago o transferencia).
 *
 * @param {{ payment_method?: string, channel?: string | null }} order
 * @returns {Channel}
 */
export function channelOf(order) {
	const channel = order.channel ?? '';
	if (channel === 'puerta' || order.payment_method === 'efectivo') return 'puerta';
	if (channel === 'manual' || channel === 'cortesia' || order.payment_method === 'gratis')
		return 'cortesia';
	return 'online';
}

/**
 * @typedef {{ day: number, online: number, puerta: number, cortesia: number, total: number,
 *   added: number }} SeriesPoint
 */

/**
 * Serie acumulada por día y canal, de `from` a `to` (inclusive), solo órdenes aprobadas. Lo
 * vendido antes de `from` entra en el primer punto; lo de después de `to` no entra.
 *
 * @param {{ status: string, quantity: number, created_at: number, payment_method?: string,
 *   channel?: string | null }[]} orders
 * @param {{ from: number, to: number }} range días (ver {@link dayNumber})
 * @returns {SeriesPoint[]}
 */
export function cumulativeSeries(orders, { from, to }) {
	const n = Math.max(0, to - from + 1);
	/** @type {Record<Channel, number[]>} */
	const per = { online: Array(n).fill(0), puerta: Array(n).fill(0), cortesia: Array(n).fill(0) };
	for (const o of orders) {
		if (o.status !== 'approved') continue;
		const i = Math.max(0, dayNumber(o.created_at) - from);
		if (i >= n) continue;
		per[channelOf(o)][i] += Number(o.quantity) || 0;
	}
	/** @type {SeriesPoint[]} */
	const out = [];
	const acc = { online: 0, puerta: 0, cortesia: 0 };
	for (let i = 0; i < n; i++) {
		let added = 0;
		for (const c of CHANNELS) {
			acc[c] += per[c][i];
			added += per[c][i];
		}
		const total = acc.online + acc.puerta + acc.cortesia;
		out.push({ day: from + i, ...acc, total, added });
	}
	return out;
}

/**
 * Ritmo reciente: entradas por día en los últimos `window` días (hasta el último punto de la
 * serie, que es hoy). `null` si hay menos de `minDays` días desde la primera venta: con tan
 * poco, una proyección engaña.
 *
 * @param {SeriesPoint[]} series
 * @param {{ window?: number, minDays?: number }} [options]
 * @returns {{ perDay: number, days: number } | null}
 */
export function recentPace(series, { window = PACE_WINDOW, minDays = MIN_HISTORY_DAYS } = {}) {
	if (!series.length) return null;
	const first = series.findIndex((p) => p.total > 0);
	if (first < 0) return null;
	const history = series.length - first;
	if (history < minDays) return null;
	const days = Math.min(window, history);
	const last = series[series.length - 1];
	const before = series.length - 1 - days >= 0 ? series[series.length - 1 - days].total : 0;
	return { perDay: (last.total - before) / days, days };
}

/**
 * @typedef {{
 *   points: { day: number, total: number }[],
 *   final: number,
 *   sellOutDay: number | null
 * }} Projection
 */

/**
 * Proyección lineal desde hoy hasta el día del evento al ritmo `pace` (entradas por día). Con
 * cupo, se corta el día en que se agotaría (`sellOutDay`). `null` si no hay nada que proyectar:
 * sin ritmo, el evento es hoy o ya pasó, o ya se llegó al cupo.
 *
 * @param {{ sold: number, today: number, eventDay: number | null, pace: number | null,
 *   capacity: number | null }} input
 * @returns {Projection | null}
 */
export function projectSales({ sold, today, eventDay, pace, capacity }) {
	if (eventDay === null || pace === null || !(pace > 0) || eventDay <= today) return null;
	if (capacity !== null && sold >= capacity) return null;
	const daysLeft = eventDay - today;
	const reach = sold + pace * daysLeft;
	if (capacity !== null && reach >= capacity) {
		const sellOutDay = today + Math.max(1, Math.ceil((capacity - sold) / pace));
		return {
			points: [
				{ day: today, total: sold },
				{ day: sellOutDay, total: capacity }
			],
			final: capacity,
			sellOutDay
		};
	}
	return {
		points: [
			{ day: today, total: sold },
			{ day: eventDay, total: reach }
		],
		final: reach,
		sellOutDay: null
	};
}

/**
 * Frase del estado y la proyección, para arriba del gráfico.
 *
 * @param {{ sold: number, capacity: number | null, eventDay: number | null, today: number,
 *   pace: { perDay: number, days: number } | null, projection: Projection | null }} input
 */
export function projectionSentence({ sold, capacity, eventDay, today, pace, projection }) {
	if (capacity !== null && sold > capacity)
		return `Sobrevendidas: ${sold - capacity} por encima del cupo de ${capacity}.`;
	if (capacity !== null && capacity > 0 && sold === capacity) return 'Agotadas: se llegó al cupo.';
	if (eventDay === null || eventDay < today) return '';
	if (eventDay === today) return 'El evento es hoy.';
	if (!pace) return 'Todavía hay pocos días de venta para estimar cómo sigue.';
	if (!projection)
		return `Sin ventas en los últimos ${pace.days} ${pace.days === 1 ? 'día' : 'días'}.`;
	if (projection.sellOutDay !== null)
		return projection.sellOutDay >= eventDay
			? `A este ritmo se agotaría justo para el evento (${dayShort(eventDay, true)}).`
			: `A este ritmo se agotaría el ${dayShort(projection.sellOutDay, true)}.`;
	const n = Math.round(projection.final);
	return `A este ritmo llegarías a ~${n} ${n === 1 ? 'entrada' : 'entradas'} el ${dayShort(eventDay, true)}, el día del evento.`;
}

/** Meses en slugs con fecha escrita (`picantearla-octubre-2023`). */
const MONTHS = new Set(
	'enero ene febrero feb marzo mar abril abr mayo junio jun julio jul agosto ago septiembre setiembre sep sept set octubre oct noviembre nov diciembre dic'.split(
		' '
	)
);

/**
 * Serie de un evento a partir del slug: todo lo que está antes del primer año (`-2026`) o nombre
 * de mes. `picantearla-2026-10` → `picantearla`, `picantearla-deluxe-2025-02` →
 * `picantearla-deluxe`. Un slug sin fecha es su propia serie.
 *
 * @param {string} slug
 */
export function seriesKey(slug) {
	const parts = String(slug ?? '')
		.toLowerCase()
		.split('-')
		.filter(Boolean);
	const at = parts.findIndex((p, i) => i > 0 && (/^(19|20)\d{2}$/.test(p) || MONTHS.has(p)));
	return (at > 0 ? parts.slice(0, at) : parts).join('-');
}

/**
 * Ediciones anteriores de la misma serie (empezaron antes que este evento), de la más reciente a
 * la más vieja.
 *
 * @template {{ slug: string, start: number | null }} E
 * @param {E[]} events
 * @param {{ slug: string, start: number }} current
 * @param {number} [limit]
 * @returns {E[]}
 */
export function previousEditions(events, current, limit = 5) {
	const key = seriesKey(current.slug);
	if (!key) return [];
	return events
		.filter(
			(e) =>
				e.slug !== current.slug &&
				e.start !== null &&
				e.start < current.start &&
				seriesKey(e.slug) === key
		)
		.sort((a, b) => /** @type {number} */ (b.start) - /** @type {number} */ (a.start))
		.slice(0, limit);
}

/**
 * La edición anterior, alineada por días antes del evento: lo que llevaba vendido la edición
 * anterior N días antes de su evento se dibuja N días antes de este. Devuelve un punto por día de
 * `from` a `to` (lo vendido antes de `from` ya cuenta en el primero).
 *
 * @param {{ day: number, tickets: number }[]} daily entradas aprobadas por día de la anterior
 * @param {{ prevEventDay: number, eventDay: number, from: number, to: number }} range
 * @returns {{ day: number, total: number }[]}
 */
export function alignPrevious(daily, { prevEventDay, eventDay, from, to }) {
	const shift = eventDay - prevEventDay;
	const n = Math.max(0, to - from + 1);
	const per = Array(n).fill(0);
	for (const d of daily) {
		const i = Math.max(0, d.day + shift - from);
		if (i < n) per[i] += Number(d.tickets) || 0;
	}
	let acc = 0;
	return per.map((v, i) => ({ day: from + i, total: (acc += v) }));
}

/**
 * @typedef {{
 *   from: number,
 *   to: number,
 *   today: number,
 *   eventDay: number | null,
 *   capacity: number | null,
 *   sold: number,
 *   series: SeriesPoint[],
 *   channels: Channel[],
 *   pace: { perDay: number, days: number } | null,
 *   projection: Projection | null,
 *   sentence: string,
 *   markers: { day: number, label: string }[],
 *   previous: { slug: string, title: string, points: { day: number, total: number }[],
 *     atToday: number | null, final: number } | null
 * }} SalesChart
 */

/**
 * Todo lo que dibuja el termómetro.
 *
 * @param {{
 *   orders: { status: string, quantity: number, created_at: number, payment_method?: string,
 *     channel?: string | null }[],
 *   now: number,
 *   opensAt: number | null,
 *   eventStart: number | null,
 *   capacity: number | null,
 *   closes?: { name: string, at: number }[],
 *   previous?: { slug: string, title: string, start: number,
 *     daily: { day: number, tickets: number }[] } | null
 * }} input
 * @returns {SalesChart}
 */
export function buildSalesChart({
	orders,
	now,
	opensAt,
	eventStart,
	capacity,
	closes = [],
	previous = null
}) {
	const today = dayNumber(now);
	const eventDay = eventStart === null ? null : dayNumber(eventStart);
	let firstSale = Infinity;
	let lastSale = -Infinity;
	for (const o of orders) {
		if (o.status !== 'approved') continue;
		const d = dayNumber(o.created_at);
		if (d < firstSale) firstSale = d;
		if (d > lastSale) lastSale = d;
	}
	const from = Math.min(opensAt === null ? Infinity : dayNumber(opensAt), firstSale, today);
	const to = Math.max(eventDay ?? today, lastSale, from);
	// La serie real llega hasta hoy (o hasta el final, si el evento ya pasó).
	const series = cumulativeSeries(orders, { from, to: Math.min(today, to) });
	const sold = series.length ? series[series.length - 1].total : 0;
	const channels = CHANNELS.filter((c) => series.some((p) => p[c] > 0));
	const pace = eventDay !== null && today < eventDay ? recentPace(series) : null;
	const projection = projectSales({ sold, today, eventDay, pace: pace?.perDay ?? null, capacity });

	/** @type {Map<number, string[]>} */
	const byDay = new Map();
	for (const c of closes) {
		const d = dayNumber(c.at);
		if (d < from || d > to) continue;
		byDay.set(d, [...(byDay.get(d) ?? []), c.name]);
	}
	const markers = [...byDay]
		.sort((a, b) => a[0] - b[0])
		.map(([day, names]) => ({ day, label: `cierra ${names.join(' y ')}` }));

	let prev = null;
	if (previous && eventDay !== null) {
		const points = alignPrevious(previous.daily, {
			prevEventDay: dayNumber(previous.start),
			eventDay,
			from,
			to
		});
		const final = previous.daily.reduce((s, d) => s + (Number(d.tickets) || 0), 0);
		if (final > 0) {
			const at = points.find((p) => p.day === today);
			prev = {
				slug: previous.slug,
				title: previous.title,
				points,
				atToday: at && today < to ? at.total : null,
				final
			};
		}
	}

	return {
		from,
		to,
		today,
		eventDay,
		capacity,
		sold,
		series,
		channels,
		pace,
		projection,
		sentence: projectionSentence({ sold, capacity, eventDay, today, pace, projection }),
		markers,
		previous: prev
	};
}
