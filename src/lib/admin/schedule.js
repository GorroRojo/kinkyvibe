/**
 * La fecha y hora de un evento en el formulario («Fecha y hora», ScheduleSection), igual al
 * crear (/admin/eventos/nuevo) y al editar (PostEditor). El formulario usa día y hora por
 * separado; esto pasa de eso a lo que se guarda y de vuelta, sin cambiar el formato de nada.
 *
 * Al crear, el formulario sale de `formFromSource` y se guarda con `buildEventMarkdown`
 * (`$lib/utils/eventDraft.js`). Al editar, sale de `start` / `end` del archivo pasados por
 * `toInput` (`$lib/admin/postFields.js`, `YYYY-MM-DDThh:mm`) y vuelve a esos mismos valores con
 * `scheduleToInputs`, que PostEditor compara con los del archivo: si no cambiaron, no se tocan.
 *
 * Sin imports de Svelte: corre en el navegador y en vitest.
 */
import {
	addDays,
	daysBetween,
	describeSchedule,
	formatEventDate,
	isValidDate,
	isValidTime,
	validateSchedule
} from '$lib/utils/eventDraft.js';

/**
 * @typedef {object} Schedule
 * @prop {string} startDate YYYY-MM-DD ('' = sin elegir)
 * @prop {string} startTime hh:mm
 * @prop {boolean} hasEnd
 * @prop {string} endDate YYYY-MM-DD
 * @prop {string} endTime hh:mm
 */

/** Las horas que se proponen cuando el archivo no tiene (las mismas que `formFromSource`). */
export const DEFAULT_START_TIME = '20:00';
export const DEFAULT_END_TIME = '23:00';

/** @param {string} v `YYYY-MM-DDThh:mm` (o '') */
const splitInput = (v) => {
	const [date = '', time = ''] = String(v ?? '').split('T');
	return { date, time };
};

/**
 * Los inputs de Editar (`start` / `end` como `YYYY-MM-DDThh:mm`, lo que da `toInput`) → el
 * formulario de la sección.
 * @param {string} start
 * @param {string} end
 * @returns {Schedule}
 */
export function scheduleFromInputs(start, end) {
	const s = splitInput(start);
	const e = splitInput(end);
	return {
		startDate: s.date,
		startTime: s.time || DEFAULT_START_TIME,
		hasEnd: Boolean(e.date),
		endDate: e.date,
		endTime: e.time || DEFAULT_END_TIME
	};
}

/**
 * El formulario de la sección → los inputs de Editar. Lo incompleto queda vacío (y
 * `scheduleProblems` dice qué falta). No valida: un valor raro que ya estaba en el archivo y
 * nadie tocó vuelve igual, así que no se reescribe.
 * @param {Schedule} s
 * @returns {{ start: string, end: string }}
 */
export function scheduleToInputs(s) {
	/** @param {string} date @param {string} time */
	const join = (date, time) => (date && time ? `${date}T${time}` : '');
	return {
		start: join(s.startDate, s.startTime),
		end: s.hasEnd ? join(s.endDate, s.endTime) : ''
	};
}

/**
 * Lo que se guarda (formato del sitio), el error y el horario en palabras.
 * @param {Schedule} s
 * @returns {{ start: string, end: string, error: string | null, text: string }}
 */
export function scheduleSummary(s) {
	const start =
		isValidDate(s.startDate) && isValidTime(s.startTime)
			? formatEventDate(s.startDate, s.startTime)
			: '';
	const end =
		s.hasEnd && isValidDate(s.endDate) && isValidTime(s.endTime)
			? formatEventDate(s.endDate, s.endTime)
			: '';
	const error = start && (end || !s.hasEnd) ? validateSchedule(start, end) : null;
	return { start, end, error, text: start ? describeSchedule(start, end) : '' };
}

/**
 * Lo que falta o está mal en la fecha y hora, para «Antes de guardar».
 * @param {Schedule} s
 * @returns {string[]}
 */
export function scheduleProblems(s) {
	return /** @type {string[]} */ (
		[
			!isValidDate(s.startDate) && 'Falta la fecha de inicio.',
			!isValidTime(s.startTime) && 'Falta la hora de inicio.',
			s.hasEnd && isValidDate(s.startDate) && !isValidDate(s.endDate) && 'Falta la fecha de fin.',
			s.hasEnd && !isValidTime(s.endTime) && 'Falta la hora de fin.',
			scheduleSummary(s).error
		].filter(Boolean)
	);
}

/**
 * Cuántos días dura el evento (el fin sigue al inicio con esa distancia cuando se cambia el día).
 * @param {Schedule} s
 * @param {{ fixSameDayTypo?: boolean }} [o] `fixSameDayTypo`: «21:00 a 01:00» el mismo día es un
 *   error común en los eventos viejos y quiere decir el día siguiente (al duplicar). Al editar no
 *   se corrige solo.
 * @returns {number}
 */
export function scheduleSpan(s, { fixSameDayTypo = false } = {}) {
	if (!isValidDate(s.startDate) || !isValidDate(s.endDate)) return 0;
	const span = Math.max(0, daysBetween(s.startDate, s.endDate));
	if (fixSameDayTypo && span === 0 && s.endTime < s.startTime) return 1;
	return span;
}

/**
 * El día de fin después de cambiar el de inicio (o de prender «Tiene hora de finalización»):
 * mantiene la duración en días. Sin día de inicio válido, no cambia.
 * @param {Schedule} s
 * @param {number} span
 * @returns {string}
 */
export function endDateFollowingStart(s, span) {
	return isValidDate(s.startDate) ? addDays(s.startDate, span) : s.endDate;
}
