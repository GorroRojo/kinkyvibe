/**
 * Ventas de la edición anterior de la serie de un evento, para comparar en el termómetro de
 * ventas (pestaña Ventas de la ficha). Una sola consulta: entradas aprobadas por evento y por día
 * de las últimas ediciones de la serie; se usa la más reciente que vendió acá.
 */
import { previousEditions } from '$lib/admin/salesChart.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Día en hora de Argentina (UTC−3 fijo), calculado en SQL igual que `dayNumber` de
 * salesChart.js: (created_at − 3 h) / 1 día, división entera.
 */
const DAY_SQL = 'CAST((created_at - 10800000) / 86400000 AS INTEGER)';

/**
 * @param {D1Database} db
 * @param {{
 *   slug: string,
 *   start: number,
 *   events: { slug: string, title: string, start: number | null }[]
 * }} input `events`: los eventos del sitio (con su comienzo en ms)
 * @returns {Promise<{ slug: string, title: string, start: number,
 *   daily: { day: number, tickets: number }[] } | null>}
 */
export async function previousEditionSales(db, { slug, start, events }) {
	const candidates = previousEditions(events, { slug, start });
	if (!candidates.length) return null;
	const marks = candidates.map((_, i) => `?${i + 1}`).join(', ');
	const { results } = await db
		.prepare(
			`SELECT event_slug, ${DAY_SQL} AS day, SUM(quantity) AS tickets
			FROM orders WHERE status = 'approved' AND event_slug IN (${marks})
			GROUP BY event_slug, day`
		)
		.bind(...candidates.map((c) => c.slug))
		.all();
	for (const c of candidates) {
		const daily = results
			.filter((r) => r.event_slug === c.slug)
			.map((r) => ({ day: Number(r.day), tickets: Number(r.tickets) }));
		if (daily.length) {
			return {
				slug: c.slug,
				title: c.title,
				start: /** @type {number} */ (c.start),
				daily
			};
		}
	}
	return null;
}
