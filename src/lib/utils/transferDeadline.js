/**
 * Hasta cuándo se guarda el lugar de una compra por transferencia (decisión 0031).
 *
 * Una sola regla: la reserva dura **2 días hábiles completos después del día de la compra** y
 * vence a las 20:00 (hora de Argentina) del segundo día hábil. El día de la compra nunca cuenta,
 * sea la hora que sea. Si el evento empieza antes, la reserva dura hasta que empieza. Los
 * feriados no se tienen en cuenta.
 *
 * Funciones puras (el reloj y el evento son parámetros), para el servidor y el navegador.
 * Argentina no tiene horario de verano: la cuenta usa el desfasaje fijo UTC−3 de
 * src/lib/utils/dates.js (`AR_UTC_OFFSET_MS`), y no depende de la zona horaria del entorno.
 */
import { AR_UTC_OFFSET_MS, WEEKDAYS_ES, arClock, argDeadline } from './dates.js';

/**
 * Los días hábiles para las transferencias, como `Date#getDay` (0 = domingo): de martes a
 * sábado. Está en un solo lugar para que algún día pueda ser un ajuste.
 */
export const TRANSFER_WORKING_DAYS = Object.freeze([2, 3, 4, 5, 6]);

/** Hora (de Argentina) en que empieza un día hábil. Solo se muestra; no cambia la cuenta. */
export const TRANSFER_OPENING_HOUR = 14;

/** Hora (de Argentina) en que termina un día hábil: a esa hora vence la reserva. */
export const TRANSFER_CLOSING_HOUR = 20;

/** Cuántos días hábiles completos, después del día de la compra, dura la reserva. */
export const TRANSFER_WORKING_DAYS_TO_PAY = 2;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Un instante en ms, o `null` si no se puede leer (o no hay).
 * @param {number | string | Date | null | undefined} value
 */
function toMs(value) {
	if (value === null || value === undefined || value === '') return null;
	const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
	return Number.isFinite(ms) ? ms : null;
}

/**
 * El vencimiento sin mirar el evento: las 20:00 (Argentina) del segundo día hábil después del
 * día (en Argentina) de `createdAt`.
 *
 * @param {number} createdAt ms
 * @returns {number} ms
 */
export function workingDaysDeadline(createdAt) {
	const local = arClock(createdAt);
	// Medianoche (Argentina) del día de la compra, contada como si fuera UTC.
	let day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
	let counted = 0;
	while (counted < TRANSFER_WORKING_DAYS_TO_PAY) {
		day += DAY_MS;
		if (TRANSFER_WORKING_DAYS.includes(new Date(day).getUTCDay())) counted++;
	}
	return day + TRANSFER_CLOSING_HOUR * HOUR_MS - AR_UTC_OFFSET_MS;
}

/**
 * Los días hábiles en palabras («de martes a sábado»), a partir de {@link TRANSFER_WORKING_DAYS}
 * (días seguidos).
 */
export function workingDaysText() {
	const first = TRANSFER_WORKING_DAYS[0];
	const last = TRANSFER_WORKING_DAYS[TRANSFER_WORKING_DAYS.length - 1];
	return `de ${WEEKDAYS_ES[first]} a ${WEEKDAYS_ES[last]}`;
}

/**
 * La regla en una frase, para las condiciones de compra y el panel: «hasta las 20:00 (hora de
 * Argentina) del segundo día hábil después de la compra, sin contar el día en que se compra
 * (los días hábiles son de martes a sábado)».
 */
export function transferRuleText() {
	const n =
		['primer', 'segundo', 'tercer', 'cuarto', 'quinto'][TRANSFER_WORKING_DAYS_TO_PAY - 1] ??
		`${TRANSFER_WORKING_DAYS_TO_PAY}.º`;
	return `hasta las ${String(TRANSFER_CLOSING_HOUR).padStart(2, '0')}:00 (hora de Argentina) del ${n} día hábil después de la compra, sin contar el día en que se compra (los días hábiles son ${workingDaysText()})`;
}

/**
 * Lo que se le dice a quien compra: «Te guardamos el lugar hasta el miércoles 15 de octubre a
 * las 20:00. Transferí y mandanos el comprobante antes de esa hora; si no llega, la reserva se
 * libera.» Con `note`, la aclaración de la hora va entre paréntesis después de la fecha (en los
 * mails no sabemos la zona de quien lee).
 *
 * @param {number} deadline ms
 * @param {{ note?: string }} [opts]
 */
export function transferHoldText(deadline, { note } = {}) {
	return `Te guardamos el lugar hasta el ${argDeadline(deadline)}${note ? ` (${note})` : ''}. ${TRANSFER_HOLD_AFTER}`;
}

/** La segunda mitad de {@link transferHoldText} (para las páginas, donde la fecha es un componente). */
export const TRANSFER_HOLD_AFTER =
	'Transferí y mandanos el comprobante antes de esa hora; si no llega, la reserva se libera.';

/**
 * Hasta cuándo se guarda el lugar de una compra por transferencia hecha en `createdAt`:
 * `min(vencimiento por días hábiles, comienzo del evento)`.
 *
 * Si el evento ya había empezado al comprar (la venta puede seguir abierta con `tickets_close`
 * después del comienzo), el comienzo no acorta nada: una reserva que nace vencida no sirve.
 *
 * @param {number} createdAt ms
 * @param {number | string | Date | null} [eventStart] comienzo del evento (el mismo que cierra la
 *   venta por defecto); sin él, solo los días hábiles
 * @returns {number} ms
 */
export function transferDeadline(createdAt, eventStart = null) {
	const deadline = workingDaysDeadline(createdAt);
	const start = toMs(eventStart);
	if (start === null || start <= createdAt) return deadline;
	return Math.min(deadline, start);
}
