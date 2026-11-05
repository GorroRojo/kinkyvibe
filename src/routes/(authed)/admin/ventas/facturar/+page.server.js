/**
 * Compras para facturar: las compras con plata de todos los eventos que todavía no se marcaron
 * «Facturada», de la más vieja a la más nueva y por mes de compra. Con `?mes=AAAA-MM` se ven
 * también las ya facturadas de ese mes. La casilla es la misma de Ventas › Órdenes
 * ($lib/server/admin/invoiced.js). Solo admins (`requireAdmin` en el `load` y en la acción: las
 * acciones no pasan por el layout).
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import {
	INVOICE_LIST_LIMIT,
	invoiceMonthLabel,
	invoiceMonths,
	invoicedFromPanel,
	listInvoicedInMonth,
	listUninvoicedOrders,
	parseMonthKey
} from '$lib/server/admin/invoiced.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const open = parseMonthKey(url.searchParams.get('mes'));
	const [pending, months, invoiced] = await Promise.all([
		listUninvoicedOrders(db, { limit: INVOICE_LIST_LIMIT }),
		invoiceMonths(db),
		open ? listInvoicedInMonth(db, open) : []
	]);
	const byMonth = new Map(months.map((m) => [m.month, m]));
	// Un grupo por mes con compras sin facturar (y el mes abierto, aunque esté al día).
	const keys = [...new Set([...pending.map((o) => o.month), ...(open ? [open] : [])])].sort();
	const groups = keys.map((month) => ({
		month,
		label: invoiceMonthLabel(month),
		pending: byMonth.get(month)?.pending ?? 0,
		invoiced: byMonth.get(month)?.invoiced ?? 0,
		open: month === open,
		orders: [...pending, ...invoiced]
			.filter((o) => o.month === month)
			.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
	}));
	const total = months.reduce((n, m) => n + m.pending, 0);
	return {
		open,
		total,
		truncated: total > pending.length,
		limit: INVOICE_LIST_LIMIT,
		groups,
		// Meses al día (todo facturado), los últimos 12: para abrirlos y ver lo facturado.
		done: months
			.filter((m) => !m.pending && m.invoiced && m.month !== open)
			.slice(-12)
			.reverse()
			.map((m) => ({ ...m, label: invoiceMonthLabel(m.month) }))
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	invoiced: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { invoiced: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const r = await invoicedFromPanel(db, locals, {
			orderId: String(form.get('order') ?? ''),
			invoiced: form.get('invoiced') === '1',
			by: admin.login
		});
		return r.ok ? r.body : fail(r.status, r.body);
	}
};
