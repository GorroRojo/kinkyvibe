/**
 * Ventas › Órdenes: el aviso «2 compras nuevas · Mostrar» ($lib/admin/newOrders.js). La página
 * pregunta cada tanto, con `?desde=<ms>` (cuándo leyó las órdenes), qué compras aprobadas o
 * transferencias reservadas cambiaron desde entonces; devuelve solo ids y estados (nada de la
 * persona). Solo admins: los layouts no protegen los endpoints `+server.js`.
 */
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';

/** Como mucho (el aviso solo cuenta). */
const LIMIT = 200;

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, params, platform }) {
	requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const since = Number(url.searchParams.get('desde'));
	if (!Number.isSafeInteger(since) || since <= 0) error(400, 'Falta desde cuándo.');
	const { results } = await db
		.prepare(
			`SELECT id, status FROM orders
			WHERE event_slug = ?1 AND updated_at > ?2
				AND (status = 'approved' OR (status = 'awaiting_transfer' AND expires_at > ?3))
			LIMIT ?4`
		)
		.bind(params.slug, since, Date.now(), LIMIT)
		.all();
	return json(
		{ orders: results.map((r) => ({ id: String(r.id), status: String(r.status) })) },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
}
