/**
 * Ficha del evento, Ventas › Gastos y reparto (prototipo, interruptor `gastos_reparto`;
 * docs/tickets.md, «Gastos y reparto»): lo que entró con el evento, de sus órdenes de verdad. Los
 * gastos, las personas y el reparto se cargan en la página y no se guardan en la base (no hay
 * acciones: nada que escribir). Solo admins.
 */
import { error, redirect } from '@sveltejs/kit';
import { eventHref } from '$lib/admin/nav.js';
import { eventIncome } from '$lib/admin/reparto.js';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { gastosRepartoEnabled } from '$lib/server/flags.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { listOrders } from '$lib/server/tickets/orders.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!(await gastosRepartoEnabled(platform))) error(404, 'No encontramos esta página.');
	const config = await getEventTickets(params.slug);
	if (!config) redirect(303, eventHref(params.slug));
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const orders = await listOrders(db, params.slug);
	return {
		income: eventIncome(orders),
		fondoEnabled: config.fondoEnabled
	};
}
