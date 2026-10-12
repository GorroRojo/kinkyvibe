/**
 * `/hoy`, `/semana` y `/finde`: qué eventos caen en cada ventana, en hora de Argentina (UTC−3 todo
 * el año, sin horario de verano desde 2009, como en reminders.js). Funciones puras: reciben los
 * próximos eventos (ya filtrados por events.js: públicos y sin empezar) y el instante actual.
 */

import { parseSiteDate } from '$lib/utils/dates.js';
/** @typedef {import('./format.js').BotEvent} BotEvent */
/** @typedef {'hoy' | 'semana' | 'finde'} EventWindow */

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** El día (número de días desde 1970) en Argentina. @param {number} ms */
const arDay = (ms) => Math.floor((ms - AR_OFFSET_MS) / DAY);

/** Día de la semana en Argentina (0 = domingo … 6 = sábado). @param {number} ms */
const arWeekday = (ms) => new Date(ms - AR_OFFSET_MS).getUTCDay();

/**
 * El primer y el último día (inclusive) de la ventana.
 *
 * - `hoy`: hoy.
 * - `semana`: hoy y los 6 días que siguen (7 días, no «hasta el domingo»: el sábado sigue sirviendo).
 * - `finde`: viernes, sábado y domingo; de lunes a jueves, el que viene; de viernes a domingo, este.
 *
 * @param {EventWindow} window
 * @param {number} now
 * @returns {[number, number]}
 */
export function windowDays(window, now) {
	const today = arDay(now);
	if (window === 'hoy') return [today, today];
	if (window === 'semana') return [today, today + 6];
	const wd = arWeekday(now);
	const friday = wd === 0 ? today - 2 : wd === 6 ? today - 1 : today + (5 - wd);
	return [friday, friday + 2];
}

/**
 * Los eventos que empiezan dentro de la ventana, en el mismo orden.
 *
 * @param {BotEvent[]} events
 * @param {EventWindow} window
 * @param {number} now
 */
export function eventsInWindow(events, window, now) {
	const [from, to] = windowDays(window, now);
	return events.filter((e) => {
		const start = parseSiteDate(e.start).getTime();
		if (!Number.isFinite(start)) return false;
		const day = arDay(start);
		return day >= from && day <= to;
	});
}
