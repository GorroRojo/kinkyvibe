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

/**
 * Fecha y hora para una lista: "vie 2 oct · 22:00" (sin hora: "vie 2 oct"). El año va solo si no
 * es el de `today` ("vie 3 oct 2025 · 22:00"), para no confundir ediciones de años distintos.
 * @param {string} start formato del sitio
 * @param {string} [today] YYYY-MM-DD (el día de hoy en Argentina)
 */
export function listDate(start, today = '') {
	const p = dateParts(start);
	if (!p) return '';
	const year = today && String(p.year) !== today.slice(0, 4) ? ` ${p.year}` : '';
	const time = parseEventDate(start).time;
	return `${p.weekday} ${p.day} ${p.month}${year}${time ? ` · ${time}` : ''}`;
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
 * Vocabulario: «Borrador» es el que tiene la marca de la agenda y espera «Confirmar»; un evento
 * sin listar a propósito es «No listado».
 * @param {{ status?: string, unlisted?: boolean, unpublished?: boolean, draft?: boolean }} e
 * @returns {{ label: string, tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' }[]}
 */
export function eventBadges(e) {
	const out = [];
	if (e.unpublished) out.push({ label: 'Despublicado', tone: /** @type {const} */ ('bad') });
	else if (e.unlisted && e.draft)
		out.push({ label: 'Borrador', tone: /** @type {const} */ ('warn') });
	else if (e.unlisted) out.push({ label: 'No listado', tone: /** @type {const} */ ('neutral') });
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

/**
 * Cupo total de un evento a partir de los cupos de sus tipos: la suma, o `null` (sin límite) si
 * algún tipo no tiene cupo (`capacity` vacío o `null` en el frontmatter). `0` es un cupo.
 *
 * @param {unknown[]} capacities
 * @returns {number | null}
 */
export function totalCapacity(capacities) {
	let total = 0;
	for (const c of capacities) {
		if (c === undefined || c === null || c === '') return null;
		total += Number(c) || 0;
	}
	return total;
}
