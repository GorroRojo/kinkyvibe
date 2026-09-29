/**
 * Exporta las órdenes de un evento en CSV (para planillas). Solo admins: los layouts no protegen
 * los endpoints `+server.js`, así que se chequea acá.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { listOrders } from '$lib/server/tickets/orders.js';

/**
 * Celda CSV segura: comillas escapadas y sin fórmulas (una celda que empieza con = + - @ se
 * ejecuta en Excel/Sheets; los nombres los escribe quien compra).
 *
 * @param {unknown} value
 */
function csvCell(value) {
	let s = value === null || value === undefined ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return `"${s.replaceAll('"', '""')}"`;
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, params, platform }) {
	requireAdmin(locals, url);
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const orders = await listOrders(db, params.slug);
	const names = Object.fromEntries(config.types.map((t) => [t.id, t.name]));
	const header = [
		'orden',
		'fecha',
		'nombre',
		'email',
		'tipo',
		'cantidad',
		'precio_unitario',
		'total',
		'estado',
		'ingresaron',
		'pago_mp'
	];
	const lines = [header.map(csvCell).join(',')];
	for (const o of orders) {
		lines.push(
			[
				o.id,
				new Date(o.created_at).toISOString(),
				o.buyer_name,
				o.buyer_email,
				names[o.ticket_type] ?? o.ticket_type,
				o.quantity,
				o.unit_price,
				o.total,
				o.status,
				o.checked_in,
				o.mp_payment_id
			]
				.map(csvCell)
				.join(',')
		);
	}
	// BOM para que Excel reconozca UTF-8 (tildes y ñ).
	return new Response('﻿' + lines.join('\r\n') + '\r\n', {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="entradas-${params.slug}.csv"`,
			'cache-control': 'private, no-store'
		}
	});
}
