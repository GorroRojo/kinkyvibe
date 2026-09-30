/**
 * Series de eventos ("Cine para sucixs", "Aberraciones"...) y "¿primera vez en la serie?" para
 * el modo puerta.
 *
 * Qué es la serie de un evento:
 * 1. el campo `serie` del frontmatter, si está (texto libre: "Picantearla");
 * 2. si no, el comienzo del slug hasta la fecha: todo lo que está antes del primer año
 *    (`-2024`) o nombre de mes (`-octubre`, `-sep`). `picantearla-2026-10` → `picantearla`,
 *    `cine-para-sucixs-2024-01-montevideo` → `cine-para-sucixs`,
 *    `antipunitivismo-y-afectos-octubre-2023` → `antipunitivismo-y-afectos`. Un slug sin fecha
 *    es su propia serie (y coincide con las ediciones con fecha: `cine-para-sucixs`).
 *
 * Primera vez: la persona de la entrada NO fue a una edición anterior de la serie (que empezó
 * antes que este evento), según las compras aprobadas guardadas:
 * - otra entrada con el mismo nombre (sin mayúsculas, tildes ni espacios de más), o
 * - si la entrada es de quien compró (mismo nombre), otra compra con el mismo email.
 * Si la serie no tiene ediciones anteriores con entradas vendidas acá, no se sabe (`known:
 * false`) y no se muestra nada: la persona pudo haber ido antes de que existiera la venta.
 */
import { foldText } from './orders.js';
import { toTime } from './config.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

const MONTHS = new Set([
	'enero',
	'ene',
	'febrero',
	'feb',
	'marzo',
	'mar',
	'abril',
	'abr',
	'mayo',
	'junio',
	'jun',
	'julio',
	'jul',
	'agosto',
	'ago',
	'septiembre',
	'setiembre',
	'sep',
	'sept',
	'set',
	'octubre',
	'oct',
	'noviembre',
	'nov',
	'diciembre',
	'dic'
]);

/**
 * Texto → clave de serie ("Cine para Súcixs" → "cine-para-sucixs").
 * @param {unknown} value
 */
export function seriesSlug(value) {
	return foldText(value)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Serie a partir del slug (regla del comienzo hasta la fecha).
 * @param {string} slug
 */
export function seriesFromSlug(slug) {
	const parts = seriesSlug(slug).split('-').filter(Boolean);
	const at = parts.findIndex((p, i) => i > 0 && (/^(19|20)\d{2}$/.test(p) || MONTHS.has(p)));
	return (at > 0 ? parts.slice(0, at) : parts).join('-');
}

/**
 * "cine-para-sucixs" → "Cine para sucixs".
 * @param {string} key
 */
function labelFromKey(key) {
	const text = key.replaceAll('-', ' ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Serie de un evento: `{ key, label }`. `key` sirve para comparar; `label` para mostrar.
 *
 * @param {string} slug
 * @param {Record<string, any> | null | undefined} [meta] frontmatter del evento
 */
export function eventSeries(slug, meta) {
	const explicit = meta?.serie ?? meta?.series;
	if (typeof explicit === 'string' && seriesSlug(explicit)) {
		return { key: seriesSlug(explicit), label: explicit.trim() };
	}
	const key = seriesFromSlug(slug);
	return { key, label: labelFromKey(key) };
}

/**
 * @typedef {{
 *   known: boolean,
 *   series: { key: string, label: string },
 *   events: string[],
 *   names: Set<string>,
 *   emails: Set<string>
 * }} PriorAttendance
 */

/** Tope de parámetros por consulta (D1 acepta 100). */
const CHUNK = 90;

/**
 * Quiénes fueron a ediciones anteriores de la serie del evento `slug`.
 *
 * @param {D1Database} db
 * @param {{
 *   slug: string,
 *   metaOf: (slug: string) => Promise<Record<string, any> | null>,
 *   now?: number
 * }} input `metaOf`: frontmatter de un evento (inyectado para poder testear)
 * @returns {Promise<PriorAttendance>}
 */
export async function priorAttendance(db, { slug, metaOf, now = Date.now() }) {
	const safeMeta = async (/** @type {string} */ s) => {
		try {
			return await metaOf(s);
		} catch {
			return null;
		}
	};
	const meta = await safeMeta(slug);
	const series = eventSeries(slug, meta);
	const start = toTime(meta?.start) ?? now;
	/** @type {PriorAttendance} */
	const out = { known: false, series, events: [], names: new Set(), emails: new Set() };
	if (!series.key) return out;

	const { results } = await db
		.prepare(
			`SELECT event_slug, MIN(created_at) AS first FROM orders
			WHERE status = 'approved' AND event_slug != ?1 GROUP BY event_slug`
		)
		.bind(slug)
		.all();
	for (const row of results) {
		const other = String(row.event_slug);
		const m = await safeMeta(other);
		if (eventSeries(other, m).key !== series.key) continue;
		// Sin fecha (evento despublicado o borrado): cuenta si se vendió antes de este evento.
		const otherStart = toTime(m?.start) ?? Number(row.first);
		if (otherStart < start) out.events.push(other);
	}
	if (!out.events.length) return out;
	out.known = true;

	for (let i = 0; i < out.events.length; i += CHUNK) {
		const chunk = out.events.slice(i, i + CHUNK);
		const marks = chunk.map((_, j) => `?${j + 1}`).join(', ');
		const rows = await db
			.prepare(
				`SELECT t.holder_name, o.buyer_email FROM tickets t JOIN orders o ON o.id = t.order_id
				WHERE o.status = 'approved' AND t.event_slug IN (${marks})`
			)
			.bind(...chunk)
			.all();
		for (const r of rows.results) {
			const name = foldText(r.holder_name);
			if (name) out.names.add(name);
			const email = String(r.buyer_email ?? '')
				.trim()
				.toLowerCase();
			if (email) out.emails.add(email);
		}
	}
	return out;
}

/**
 * ¿Es la primera vez de esta persona en la serie? `null` si no se sabe (ver arriba).
 *
 * @param {{ holder: string, buyerName: string, buyerEmail: string }} person
 * @param {PriorAttendance} prior
 * @returns {boolean | null}
 */
export function isFirstTime({ holder, buyerName, buyerEmail }, prior) {
	if (!prior.known) return null;
	const name = foldText(holder);
	if (name && prior.names.has(name)) return false;
	const email = String(buyerEmail ?? '')
		.trim()
		.toLowerCase();
	if (email && name && name === foldText(buyerName) && prior.emails.has(email)) return false;
	return true;
}
