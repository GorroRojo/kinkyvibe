/**
 * Cargar un evento rápido desde la agenda: «¿Querés duplicar un evento que ya existe?».
 *
 * - `duplicateCandidates`: los eventos que se pueden duplicar, uno por familia (la parte del slug
 *   antes de la fecha, como en la importación de la planilla: `picantearla-2026-09` →
 *   `picantearla`), con su edición más reciente (pasada o próxima). Primero los que se repiten
 *   (están en una serie o tienen varias ediciones), después el resto; en cada grupo, el más
 *   reciente primero;
 * - `searchDuplicates`: los que coinciden con lo que escribieron (título, slug o serie);
 * - `quickDraftChoice`: lo que se manda para crear el borrador (título, día y horas), con el mismo
 *   formato que una fila de la importación (`buildImportedEvent` en sheetImport.js), que es quien
 *   arma el archivo: un borrador no listado y «anunciado».
 */
import { foldSearch } from '$lib/admin/eventFormat.js';
import { isValidDate, isValidTime, parseEventDate } from './eventDraft.js';
import { eventTimes, proposeTitle, scheduleFor, seriesOf } from './sheetImport.js';

/**
 * @typedef {object} DuplicableEvent
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} start formato del sitio ('' si no tiene)
 * @prop {string} [end]
 * @prop {string} [series] nombre de la serie ('' si no está en ninguna)
 * @prop {boolean} [unpublished] despublicado (`force_unpublished`): no se ofrece
 */

/**
 * @typedef {object} DuplicateCandidate
 * @prop {string} slug la edición más reciente
 * @prop {string} title
 * @prop {string} date YYYY-MM-DD de esa edición ('' si no tiene)
 * @prop {string} start
 * @prop {string} end
 * @prop {string} series
 * @prop {number} editions cuántas ediciones tiene la familia
 */

/**
 * @param {DuplicableEvent[]} events
 * @returns {DuplicateCandidate[]}
 */
export function duplicateCandidates(events) {
	/** @type {Map<string, { head: DuplicableEvent, editions: number, series: string }>} */
	const families = new Map();
	for (const e of events) {
		if (!e?.slug || e.slug.startsWith('_') || e.unpublished) continue;
		const key = seriesOf(e.slug);
		const f = families.get(key);
		const series = String(e.series ?? '');
		if (!f) {
			families.set(key, { head: e, editions: 1, series });
			continue;
		}
		f.editions++;
		if (!f.series && series) f.series = series;
		if ((e.start || '') > (f.head.start || '')) f.head = e;
	}
	const out = [...families.values()].map(({ head, editions, series }) => ({
		slug: head.slug,
		title: String(head.title || head.slug),
		date: parseEventDate(head.start).date,
		start: head.start || '',
		end: head.end || '',
		series: series || String(head.series ?? ''),
		editions
	}));
	/** @param {DuplicateCandidate} c */
	const repeats = (c) => (c.series || c.editions > 1 ? 0 : 1);
	return out.sort(
		(a, b) =>
			repeats(a) - repeats(b) || b.start.localeCompare(a.start) || a.slug.localeCompare(b.slug)
	);
}

/**
 * Los candidatos que coinciden con la búsqueda (todas las palabras, sin tildes ni mayúsculas), en
 * el mismo orden. Sin búsqueda, los primeros.
 * @param {DuplicateCandidate[]} candidates
 * @param {string} query
 * @param {number} [limit]
 */
export function searchDuplicates(candidates, query, limit = 8) {
	const words = foldSearch(query).split(/\s+/).filter(Boolean);
	const out = [];
	for (const c of candidates) {
		if (out.length >= limit) break;
		if (!words.length) {
			out.push(c);
			continue;
		}
		const hay = foldSearch(`${c.title} ${c.slug.replace(/-/g, ' ')} ${c.series}`);
		if (words.every((w) => hay.includes(w))) out.push(c);
	}
	return out;
}

/** «(61ª Edición)» en un título. */
const EDITION = /\s*\(\d+\s*[ªº°]\s*Edici[oó]n\)/i;

/**
 * @typedef {object} QuickDraftInput
 * @prop {{ slug: string, title: string, start?: string, end?: string } | null} source el evento
 *   a duplicar, o null para empezar de cero
 * @prop {string} [title] el título (obligatorio de cero; duplicando, se propone el del original con
 *   la edición siguiente)
 * @prop {string} date YYYY-MM-DD
 * @prop {string} [startTime] la hora elegida en la agenda (la vista semana)
 * @prop {string} [endTime]
 */

/**
 * La «fila» para `buildImportedEvent`: título, día y horas del borrador. Las horas: las que
 * eligieron en la agenda; si no, las del original (en el día nuevo); de cero y sin hora, 20:00.
 * Si eligieron solo la hora de inicio, dura lo mismo que el original.
 *
 * @param {QuickDraftInput} input
 * @returns {{ ok: true, choice: { title: string, date: string, startTime: string, endTime: string, source: string } } | { ok: false, error: string }}
 */
export function quickDraftChoice({ source, title = '', date, startTime = '', endTime = '' }) {
	if (!isValidDate(date)) return { ok: false, error: 'Elegí un día.' };
	const own = String(title ?? '').trim();
	if (!source && !own) return { ok: false, error: 'Escribí el título.' };
	if (own.length > 200) return { ok: false, error: 'El título es demasiado largo.' };
	if (/[\r\n]/.test(own)) return { ok: false, error: 'El título va en una sola línea.' };
	const sourceTitle = String(source?.title ?? '').trim();
	const finalTitle =
		own || proposeTitle(sourceTitle.replace(EDITION, '').trim() || sourceTitle, sourceTitle);
	let start = isValidTime(startTime) ? startTime : '';
	let end = start && isValidTime(endTime) ? endTime : '';
	if (!start) {
		const times = eventTimes(source);
		start = times.startTime || '20:00';
		end = times.startTime ? times.endTime : '';
	} else if (!end && source) {
		end = scheduleFor(
			{ date, startTime: start, endTime: '' },
			{ start: source.start ?? '', end: source.end }
		).endTime;
	}
	return {
		ok: true,
		choice: {
			title: finalTitle,
			date,
			startTime: start,
			endTime: end,
			source: source?.slug ?? ''
		}
	};
}
