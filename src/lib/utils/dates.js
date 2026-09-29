// Events and posts are dated in Argentina time (UTC-3, no DST), but pages are
// rendered on the server in UTC and in browsers in whatever timezone the viewer
// has. These helpers make displayed dates independent of the runtime timezone.

export const TIMEZONE = 'America/Argentina/Buenos_Aires';
const OFFSET_MS = -3 * 60 * 60 * 1000;

/**
 * Returns a Date whose *local* fields (getDate, getHours..., and so what
 * date-fns `format` prints) are the wall-clock time in Argentina at `d`.
 * Only use it for display/grouping, not for comparing instants.
 * @param {string|number|Date} d
 * @returns {Date}
 */
export function toArgentina(d) {
	const shifted = new Date(new Date(d).getTime() + OFFSET_MS);
	return new Date(
		shifted.getUTCFullYear(),
		shifted.getUTCMonth(),
		shifted.getUTCDate(),
		shifted.getUTCHours(),
		shifted.getUTCMinutes(),
		shifted.getUTCSeconds()
	);
}

/**
 * The end of an event as a Date. Falls back to the start if there's no valid
 * end, and fixes the common mistake of an end past midnight written with the
 * start's date (e.g. 20:00 -> 01:30 on the same day) by moving it a day later.
 * @param {string|Date} start
 * @param {string|Date|undefined} end
 * @returns {Date}
 */
export function eventEnd(start, end) {
	const s = new Date(start);
	const e = new Date(end ?? start);
	if (isNaN(e.getTime())) return s;
	if (
		e.getTime() < s.getTime() &&
		toArgentina(e).toDateString() == toArgentina(s).toDateString()
	) {
		return new Date(e.getTime() + 24 * 60 * 60 * 1000);
	}
	return e;
}
