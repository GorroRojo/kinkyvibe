/**
 * Ventas › Órdenes: el aviso «2 compras nuevas · Mostrar» (plan `ordenes-editar`). Mientras la
 * página está abierta (y a la vista), pregunta cada tanto a `ordenes/nuevas` qué compras
 * aprobadas o transferencias reservadas cambiaron desde que cargó; las que la página no tiene así
 * son nuevas. No se meten solas en la lista (saltaría): el aviso las trae al tocar «Mostrar».
 */

/** Cada cuánto se pregunta, con la pestaña a la vista. */
export const NEW_ORDERS_POLL_MS = 30_000;

/**
 * Cuántas de las que mandó el servidor la página todavía no tiene así: una orden que no está o que
 * está en otro estado (una reserva que se pagó). Una que se ve igual no cuenta.
 *
 * @param {{ id: string, status: string }[]} remote
 * @param {{ id: string, status: string }[]} local
 */
export function countNewOrders(remote, local) {
	const have = new Map(local.map((o) => [o.id, o.status]));
	return new Set(remote.filter((o) => have.get(o.id) !== o.status).map((o) => o.id)).size;
}

/** «1 compra nueva», «3 compras nuevas». @param {number} n */
export function newOrdersText(n) {
	return n === 1 ? '1 compra nueva' : `${n} compras nuevas`;
}
