/**
 * Cada cuánto la página de estado de una compra (/entradas/<orden>/estado) vuelve a consultar
 * mientras espera la confirmación del pago. Cada consulta recarga solo la orden
 * (`invalidate('kv:orden')`, no el layout) y, si sigue sin aprobar, el servidor vuelve a
 * preguntarle el pago a Mercado Pago (con un tope de 10 por minuto por orden). Espaciadas cada
 * vez más: 5, 10, 20 y después cada 30 segundos, 8 veces en total (unos 3 minutos). Después, el
 * webhook igual actualiza la compra y manda las entradas por mail.
 */

/** Milisegundos antes de cada consulta. */
export const ORDER_POLL_DELAYS = Object.freeze([
	5_000, 10_000, 20_000, 30_000, 30_000, 30_000, 30_000, 30_000
]);

/**
 * Cuánto esperar antes de la consulta número `done + 1` (ya se hicieron `done`), o `null` si ya no
 * hay que consultar más.
 *
 * @param {number} done
 * @returns {number | null}
 */
export function nextOrderPollDelay(done) {
	return Number.isInteger(done) && done >= 0 && done < ORDER_POLL_DELAYS.length
		? ORDER_POLL_DELAYS[done]
		: null;
}
