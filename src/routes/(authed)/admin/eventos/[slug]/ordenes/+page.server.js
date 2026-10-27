/**
 * Ficha del evento, pestaña Ventas › Órdenes: todas las órdenes con sus entradas, reenviar el mail
 * (o corregir la dirección y reenviar, `email`), reembolsar (en dos pasos) y marcar como revisadas
 * las que quedaron para revisar a mano.
 *
 * DNI: la página solo trae los últimos 3 dígitos de cada orden. El completo sale de a uno con la
 * acción `dni` («Mostrar», queda en el registro de actividad) y el buscador encuentra órdenes por
 * DNI con `dniSearch` (devuelve solo ids). El CSV (`../ordenes.csv`) sí lleva el DNI completo: se
 * descarga a propósito.
 *
 * Evento cancelado (decisión 0051): arriba, «Reembolsar todas» con la cantidad y el total exactos
 * de las órdenes de Mercado Pago (`refundAllPreview`) y la lista de las que se devuelven a mano.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { pickActions } from '$lib/server/admin/eventActions.js';
import { eventOrderRows } from '$lib/server/admin/eventOrders.js';
import { REFUND_ALL_BATCH, REFUND_ALL_WORD, refundAllPreview } from '$lib/server/admin/refunds.js';
import { orderReference } from '$lib/utils/tickets.js';
import { getEventTickets } from '$lib/server/tickets/events.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const [{ rows }, preview] = await Promise.all([
		eventOrderRows(db, params.slug, config),
		config.status === 'cancelado' ? refundAllPreview(db, params.slug) : null
	]);
	return {
		refundAll: preview
			? {
					...preview,
					manual: preview.manual.map((o) => ({ ...o, reference: orderReference(o.id) })),
					word: REFUND_ALL_WORD,
					batch: REFUND_ALL_BATCH
				}
			: null,
		orders: rows,
		// Órdenes para revisar a mano (pago tardío sin cupo, pago duplicado).
		review: rows.filter((r) => r.needsReview)
	};
}

export const actions = pickActions(
	'reviewed',
	'resend',
	'email',
	'refund',
	'refundAll',
	'dni',
	'dniSearch'
);
