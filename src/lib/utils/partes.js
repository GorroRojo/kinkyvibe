/**
 * Talleres en varias partes (docs/talleres-partes.md): textos y reglas puras que comparten las
 * páginas públicas, el panel y el servidor. Sin base ni SvelteKit.
 *
 * El modelo: el taller es un evento (que es también la parte 1) con edges `parte` hacia los
 * eventos de las otras partes, en orden. Cada parte tiene su fecha, su hora y su lugar.
 */
import { dateParts } from '../admin/eventFormat.js';
import { parseEventDate } from './eventDraft.js';

/** El `kind` del edge del taller a cada una de sus otras partes. */
export const PARTE_EDGE = 'parte';

/** Clave del taller (en `extra`, junto con la configuración de entradas): cada parte vende la suya. */
export const POR_PARTE_KEY = 'entradas_por_parte';

/**
 * Claves de la configuración de entradas (src/lib/server/tickets/config.js). Una parte nueva de
 * un taller con una sola entrada no las copia: la entrada se compra en el taller.
 */
export const TICKET_KEYS = /** @type {const} */ ([
	'tickets',
	'tickets_open',
	'tickets_close',
	'payment_methods',
	'mp_fee_percent',
	'puerta',
	'puerta_precio',
	'recordatorios',
	POR_PARTE_KEY
]);

/**
 * «Parte 2 de 3».
 *
 * @param {number} n
 * @param {number} m
 */
export function partLabel(n, m) {
	return `Parte ${n} de ${m}`;
}

/**
 * «vie 2 oct · 22:00» (la hora como está escrita en el evento: hora de Argentina). Sin hora,
 * solo la fecha; si no se entiende, `''`.
 *
 * @param {string | null | undefined} start
 */
export function partDateText(start) {
	if (!start) return '';
	const p = dateParts(String(start));
	if (!p) return '';
	const { time } = parseEventDate(String(start));
	const day = `${p.weekday} ${p.day} ${p.month}`;
	return time ? `${day} · ${time}` : day;
}

/**
 * Título de la lista de partes de un taller: «Las 3 partes del taller».
 *
 * @param {number} total
 */
export function partsListTitle(total) {
	return `Las ${total} partes del taller`;
}

/**
 * Una línea de la lista de partes (mails y página de la entrada): «Parte 2 · vie 9 oct · 22:00 ·
 * Lugar», con « · cancelada» si la parte se canceló. Lo que falta (fecha, lugar) no va.
 *
 * @param {{ n: number, start?: string | null, where?: string | null, status?: string | null }} part
 */
export function partLine({ n, start, where, status }) {
	return [`Parte ${n}`, partDateText(start), where, status === 'cancelado' ? 'cancelada' : '']
		.filter(Boolean)
		.join(' · ');
}

/**
 * ¿Cada parte vende su entrada? Con `entradas_por_parte: true` en el taller; si no, una sola
 * entrada (la del taller) vale para todas.
 *
 * @param {Record<string, unknown> | null | undefined} meta la metadata (o `extra`) del taller
 */
export function sellsPerPart(meta) {
	return meta?.[POR_PARTE_KEY] === true;
}

/**
 * @typedef {{ slug: string, title: string, start: string | null, end: string | null,
 *   status: string | null }} PartInfo
 * @typedef {PartInfo & { n: number }} NumberedPart
 * @typedef {{
 *   workshop: NumberedPart & { perPart: boolean },
 *   parts: NumberedPart[],
 *   total: number
 * }} Workshop
 * `parts`: todas, el taller incluido (parte 1); `total`: cuántas son.
 */

/**
 * Numera las partes: el taller es la 1 y las demás siguen en el orden de los edges.
 *
 * @param {PartInfo & { perPart?: boolean }} workshop
 * @param {PartInfo[]} children en orden (`position`)
 * @returns {Workshop}
 */
export function numberParts(workshop, children) {
	const parts = [workshop, ...children].map((p, i) => ({
		slug: p.slug,
		title: p.title,
		start: p.start,
		end: p.end,
		status: p.status,
		n: i + 1
	}));
	return {
		workshop: { ...parts[0], perPart: Boolean(workshop.perPart) },
		parts,
		total: parts.length
	};
}

/**
 * La parte que es `slug` en el taller, o `null`.
 *
 * @param {Workshop | null | undefined} ws
 * @param {string} slug
 */
export function partOf(ws, slug) {
	return ws?.parts.find((p) => p.slug === slug) ?? null;
}

/**
 * ¿De qué evento es la entrada que vale para `slug`? La del taller si `slug` es una parte (2 en
 * adelante) de un taller con una sola entrada; si no, `null` (el evento vende la suya, o no vende).
 *
 * @param {Workshop | null | undefined} ws
 * @param {string} slug
 */
export function coveringTicketSlug(ws, slug) {
	if (!ws || ws.total < 2 || ws.workshop.perPart) return null;
	if (slug === ws.workshop.slug || !partOf(ws, slug)) return null;
	return ws.workshop.slug;
}

/**
 * Las etiquetas «Parte N de M» de un conjunto de talleres, por dirección del evento (para las
 * listas y el calendario).
 *
 * @param {Workshop[]} workshops
 * @returns {Map<string, { n: number, m: number, workshop: string }>}
 */
export function partLabelsBySlug(workshops) {
	/** @type {Map<string, { n: number, m: number, workshop: string }>} */
	const out = new Map();
	for (const ws of workshops) {
		if (ws.total < 2) continue;
		for (const p of ws.parts) out.set(p.slug, { n: p.n, m: ws.total, workshop: ws.workshop.slug });
	}
	return out;
}

/**
 * El post con su etiqueta «Parte N de M» (`meta.parte`) si es parte de un taller.
 *
 * @template {{ meta: Record<string, any> }} P
 * @param {P} post
 * @param {Map<string, { n: number, m: number }>} labels de {@link partLabelsBySlug}
 * @returns {P}
 */
export function withPartLabel(post, labels) {
	const label = labels.get(String(post.meta?.postID ?? ''));
	if (!label) return post;
	return { ...post, meta: { ...post.meta, parte: { n: label.n, m: label.m } } };
}

const DATETIME = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/;

/**
 * El mismo horario `days` días después, con la misma zona escrita
 * («2026-10-02T22:00-03:00» + 7 → «2026-10-09T22:00-03:00»). Si no se entiende, igual.
 *
 * @param {string} value
 * @param {number} days
 */
export function addDays(value, days) {
	const m = DATETIME.exec(String(value ?? ''));
	if (!m) return value;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
	return `${d.toISOString().slice(0, 10)}${m[4] ?? ''}`;
}

/** «(parte 1 de 2)», «(parte 2)», «- Parte 3» al final de un título. */
const PART_SUFFIX = /\s*(?:[-–—·]\s*)?\(?\s*parte\s+\d+(?:\s+de\s+\d+)?\s*\)?\s*$/i;

/**
 * El título de una parte nueva: el del taller sin su «(parte 1 de 2)», con «(parte N)».
 *
 * @param {string} workshopTitle
 * @param {number} n
 */
export function newPartTitle(workshopTitle, n) {
	const base = String(workshopTitle ?? '')
		.replace(PART_SUFFIX, '')
		.trim();
	return `${base || 'Taller'} (parte ${n})`;
}

/**
 * Los datos de una parte nueva, copiados del taller: misma descripción, etiquetas, personas e
 * imagen, con su fecha. Sin la configuración de entradas si el taller vende una sola entrada (se
 * compra en el taller); con ella si cada parte vende la suya.
 *
 * @param {Record<string, unknown>} workshopData `data` del objeto del taller
 * @param {{ start: string, end?: string | null }} when
 * @returns {Record<string, unknown>}
 */
export function newPartData(workshopData, { start, end }) {
	/** @type {Record<string, unknown>} */
	const data = { ...workshopData, start };
	if (end) data.end = end;
	else delete data.end;
	delete data.published_date;
	delete data.updated_date;
	const extra =
		workshopData.extra && typeof workshopData.extra === 'object'
			? { .../** @type {Record<string, unknown>} */ (workshopData.extra) }
			: null;
	if (extra) {
		const perPart = sellsPerPart(extra);
		for (const key of TICKET_KEYS) if (!perPart || key === POR_PARTE_KEY) delete extra[key];
		if (Object.keys(extra).length) data.extra = extra;
		else delete data.extra;
	}
	return data;
}
