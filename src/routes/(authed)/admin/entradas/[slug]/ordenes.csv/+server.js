/**
 * Exporta las entradas de un evento en CSV (para planillas), una fila por entrada, con el DNI
 * de quien compró (tratar el archivo como dato personal). Solo
 * admins: los layouts no protegen los endpoints `+server.js`, así que se chequea acá.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { listEventTickets, listOrders, orderHolders } from '$lib/server/tickets/orders.js';
import { orderReference } from '$lib/utils/tickets.js';

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
	const [orders, tickets] = await Promise.all([
		listOrders(db, params.slug),
		listEventTickets(db, params.slug)
	]);
	const names = Object.fromEntries(config.types.map((t) => [t.id, t.name]));
	/** @type {Map<string, import('$lib/server/tickets/orders.js').Ticket[]>} */
	const byOrder = new Map();
	for (const t of tickets) byOrder.set(t.order_id, [...(byOrder.get(t.order_id) ?? []), t]);

	// Una fila por entrada (persona). Los montos de la orden van solo en la fila de la entrada 1,
	// así se pueden sumar en la planilla sin contar dos veces.
	const header = [
		'orden',
		'referencia',
		'fecha',
		'estado',
		'medio_pago',
		'tipo',
		'comprador',
		'pronombres_comprador',
		'email',
		'dni_comprador',
		'entrada',
		'codigo',
		'nombre',
		'pronombres',
		'ingreso',
		'cantidad',
		'precio_lista',
		'opcion_fondo',
		'fondo',
		'aporte_fondo',
		'subtotal',
		'codigo_descuento',
		'descuento',
		'recargo_mp',
		'total',
		'pago_mp',
		'confirmo'
	];
	const lines = [header.map(csvCell).join(',')];
	for (const o of orders) {
		const issued = byOrder.get(o.id) ?? [];
		const people = issued.length
			? issued.map((t) => ({
					name: t.holder_name,
					pronouns: t.holder_pronouns ?? '',
					checkedIn: t.checked_in_at ? new Date(t.checked_in_at).toISOString() : '',
					code: t.code ?? ''
				}))
			: orderHolders(o).map((h) => ({ ...h, checkedIn: '', code: '' }));
		people.forEach((p, i) => {
			const first = i === 0;
			lines.push(
				[
					o.id,
					orderReference(o.id),
					new Date(o.created_at).toISOString(),
					o.status,
					o.payment_method,
					names[o.ticket_type] ?? o.ticket_type,
					o.buyer_name,
					o.buyer_pronouns ?? '',
					o.buyer_email,
					o.buyer_dni ?? '',
					`${i + 1}/${people.length}`,
					p.code,
					p.name,
					p.pronouns,
					p.checkedIn,
					first ? o.quantity : '',
					first ? o.unit_price * o.quantity : '',
					o.fondo_option,
					first ? o.fondo_amount : '',
					first ? o.fondo_contribution : '',
					first ? o.subtotal : '',
					o.discount_code ?? '',
					first ? o.discount_amount : '',
					first ? o.surcharge_amount : '',
					first ? o.total : '',
					o.mp_payment_id,
					o.confirmed_by
				]
					.map(csvCell)
					.join(',')
			);
		});
	}
	// BOM para que Excel reconozca UTF-8 (tildes y ñ).
	return new Response('\uFEFF' + lines.join('\r\n') + '\r\n', {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="entradas-${params.slug}.csv"`,
			'cache-control': 'private, no-store'
		}
	});
}
