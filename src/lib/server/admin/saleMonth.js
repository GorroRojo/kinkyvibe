/**
 * En qué mes cuenta una venta para los números por mes del panel (Inicio «Entradas este mes») y
 * de Estadísticas › Ventas: el **mes del evento**, no el de la compra ni el de la aprobación
 * (decisión de gorrite, Mesa `plata-numeros-panel`; docs/panel.md «Ventas por mes»).
 *
 * - El momento que cuenta es el **comienzo** del evento (`start`, columna generada `start_at` de
 *   `objects`, migración 0031). Un evento de varios días cuenta entero en el mes en que empieza.
 * - El mes es el calendario de **Argentina** (UTC−3): un evento que empieza el 31/10 a las 22:00
 *   es de octubre aunque en UTC ya sea 1/11.
 * - Si el evento no está en la base (una orden de un slug que ya no existe), cuenta la fecha de
 *   compra (`created_at`), para que esa plata no desaparezca de los totales.
 *
 * Una sola definición: {@link SALE_AT_SQL} en las consultas (con la tabla `orders` como `o`) y
 * {@link saleAt} sobre las filas de `loadPeopleOrders` (que traen `event_start`).
 */

/** Comienzo del evento de la orden `o`, en ms (o NULL si el evento no está en la base). */
export const EVENT_START_SQL = `(SELECT ev.start_at FROM objects ev
	WHERE ev.type = 'evento' AND ev.slug = o.event_slug)`;

/** El instante que cuenta para el mes de la venta de la orden `o`. */
export const SALE_AT_SQL = `COALESCE(${EVENT_START_SQL}, o.created_at)`;

/**
 * {@link SALE_AT_SQL} en JS.
 * @param {{ created_at: number, event_start?: number | null }} o
 */
export function saleAt(o) {
	return typeof o.event_start === 'number' && Number.isFinite(o.event_start)
		? o.event_start
		: o.created_at;
}
