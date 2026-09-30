/**
 * Textos y formatos de eventos que comparten las páginas de eventos del panel (lista, agenda y
 * ficha). Puras: sirven en el navegador y en el servidor.
 */
import { parseEventDate } from '$lib/utils/eventDraft.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/**
 * Fecha para el bloque grande de las listas: `{ day: '12', month: 'dic', weekday: 'sáb', year }`.
 * @param {string} start formato del sitio
 */
export function dateParts(start) {
	const { date } = parseEventDate(start);
	if (!date) return null;
	const [y, m, d] = date.split('-').map(Number);
	const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return { day: String(d), month: MONTHS[m - 1], weekday: WEEKDAYS[wd], year: y };
}

/**
 * "20:00 – 02:00", "20:00" o ''.
 * @param {string} start
 * @param {string} [end]
 */
export function timeRange(start, end) {
	const s = parseEventDate(start).time;
	const e = parseEventDate(end).time;
	if (!s) return '';
	return e ? `${s} – ${e}` : s;
}

/**
 * "sáb 12 dic 2026".
 * @param {string} start
 */
export function shortDate(start) {
	const p = dateParts(start);
	return p ? `${p.weekday} ${p.day} ${p.month} ${p.year}` : '';
}

/** `status` del frontmatter → texto y tono del chip. */
export const STATUS_BADGES =
	/** @type {Record<string, { label: string, tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' }>} */ ({
		anunciado: { label: 'Anunciado', tone: 'info' },
		abierto: { label: 'Abierto', tone: 'ok' },
		agotadas: { label: 'Agotadas', tone: 'neutral' },
		cancelado: { label: 'Cancelado', tone: 'bad' }
	});

/**
 * Chip del estado de un evento (lo que se ve en el sitio).
 * @param {{ status?: string, unlisted?: boolean, unpublished?: boolean }} e
 * @returns {{ label: string, tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' }[]}
 */
export function eventBadges(e) {
	const out = [];
	if (e.unpublished) out.push({ label: 'Despublicado', tone: /** @type {const} */ ('bad') });
	else if (e.unlisted) out.push({ label: 'Borrador', tone: /** @type {const} */ ('warn') });
	const st = e.status ? STATUS_BADGES[e.status] : null;
	if (st) out.push(st);
	else if (e.status) out.push({ label: e.status, tone: /** @type {const} */ ('neutral') });
	return out;
}

/**
 * Texto sin tildes ni mayúsculas, para buscar.
 * @param {string} s
 */
export function foldSearch(s) {
	return String(s ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

/**
 * "mié 30 sep" (o "30/9" corto) para un día YYYY-MM-DD.
 * @param {string} date
 * @param {boolean} [short]
 */
export function dayLabel(date, short = false) {
	const [y, m, d] = date.split('-').map(Number);
	if (short) return `${d}/${m}`;
	const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]}`;
}
