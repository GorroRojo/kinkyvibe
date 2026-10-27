/**
 * Avisos de puerta (decisión 0053, docs/tickets.md «Avisos de puerta»): lo que comparten el
 * servidor, el panel y la puerta. Lo de la base está en $lib/server/tickets/doorNotices.js.
 */

/**
 * Lo único que ve la puerta cuando una entrada coincide con un aviso: ni el motivo, ni quién lo
 * cargó, ni hasta cuándo. Nunca frena el ingreso: decide quien está en la puerta.
 */
export const DOOR_NOTICE_TEXT = 'Avisá a la organización antes de dejar pasar';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Vencimientos para elegir al cargar o renovar un aviso. */
export const DOOR_NOTICE_PRESETS = Object.freeze([
	Object.freeze({ id: '6m', label: '6 meses', days: 183 }),
	Object.freeze({ id: '1y', label: '1 año', days: 365 })
]);

/** Lo más lejos que puede vencer un aviso (2 años), contado desde que se carga o se renueva. */
export const DOOR_NOTICE_MAX_MS = 730 * DAY_MS;

/** Cuántos días antes de vencer sale el mail para renovarlo o dejarlo vencer. */
export const DOOR_NOTICE_REMIND_DAYS = 14;

/** Largo máximo del motivo (privado, solo admins). */
export const DOOR_NOTICE_REASON_MAX = 500;

/** Argentina no tiene horario de verano: siempre UTC−3. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * El vencimiento de un aviso: un preset (`6m`, `1y`) o una fecha `AAAA-MM-DD` (vence al final de
 * ese día, hora de Argentina), de mañana a 2 años. `null` si no vale.
 *
 * @param {unknown} choice
 * @param {number} now
 * @returns {number | null}
 */
export function doorNoticeExpiry(choice, now) {
	const value = typeof choice === 'string' ? choice.trim() : '';
	const preset = DOOR_NOTICE_PRESETS.find((p) => p.id === value);
	if (preset) return now + preset.days * DAY_MS;
	const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return null;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const startUtc = Date.UTC(y, mo - 1, d);
	const check = new Date(startUtc);
	if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
		return null;
	}
	// 23:59:59.999 de ese día en Argentina.
	const end = startUtc + DAY_MS - 1 + AR_OFFSET_MS;
	if (end <= now || end > now + DOOR_NOTICE_MAX_MS) return null;
	return end;
}

/**
 * La fecha más lejana que se puede elegir (para el `max` del campo de fecha), `AAAA-MM-DD` en
 * Argentina.
 *
 * @param {number} now
 */
export function doorNoticeMaxDate(now) {
	// El último día cuyo final (23:59:59.999 en Argentina) no pasa de `now` + 2 años.
	return new Date(now + DOOR_NOTICE_MAX_MS - DAY_MS + 1 - AR_OFFSET_MS).toISOString().slice(0, 10);
}
