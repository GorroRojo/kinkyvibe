/**
 * Bandeja de transferencias de todos los eventos: las que esperan comprobante (la que vence
 * antes arriba), las vencidas y las rechazadas de los últimos 7 días. Confirmar, cancelar y
 * deshacer un rechazo usan las mismas
 * funciones idempotentes que la página de cada evento. Solo admins (`requireAdmin` en el `load`
 * y en cada action: las actions no pasan por el layout).
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { listTransferInbox } from '$lib/server/admin/sales.js';
import {
	cancelTransferFromPanel,
	confirmTransferFromPanel,
	reopenTransferFromPanel
} from '$lib/server/admin/transfers.js';
import { getEventTickets, isValidEventSlug } from '$lib/server/tickets/events.js';
import {
	inBackground,
	sendOrderEmail,
	siteOrigin,
	transferHoldMs
} from '$lib/server/tickets/index.js';
import { readOverride } from '$lib/server/tickets/overrides.js';
import { orderReference } from '$lib/utils/tickets.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const now = Date.now();
	const raw = url.searchParams.get('evento') ?? '';
	const eventSlug = isValidEventSlug(raw) ? raw : '';
	const [all, filtered] = await Promise.all([
		listTransferInbox(db, { now }),
		eventSlug ? listTransferInbox(db, { now, eventSlug }) : null
	]);
	const inbox = filtered ?? all;
	// Títulos y nombres de los tipos, una vez por evento.
	const slugs = [
		...new Set([...all.pending, ...all.expired, ...all.rejected].map((o) => o.event_slug))
	];
	const configs = new Map(
		await Promise.all(slugs.map(async (s) => /** @type {const} */ ([s, await getEventTickets(s)])))
	);
	/** @param {import('$lib/server/tickets/orders.js').Order} o */
	const row = (o) => {
		const config = configs.get(o.event_slug);
		return {
			id: o.id,
			reference: orderReference(o.id),
			slug: o.event_slug,
			event: config?.title ?? o.event_slug,
			type: config?.types.find((t) => t.id === o.ticket_type)?.name ?? o.ticket_type,
			quantity: o.quantity,
			name: o.buyer_name,
			pronouns: o.buyer_pronouns ?? '',
			email: o.buyer_email,
			total: o.total,
			discountCode: o.discount_code,
			createdAt: o.created_at,
			expiresAt: o.expires_at,
			updatedAt: o.updated_at,
			rejectedBy: o.status === 'cancelled' ? (o.confirmed_by ?? '') : ''
		};
	};
	/** @type {Map<string, number>} */
	const perEvent = new Map();
	for (const o of all.pending) perEvent.set(o.event_slug, (perEvent.get(o.event_slug) ?? 0) + 1);
	return {
		now,
		eventSlug,
		events: slugs
			.map((s) => ({ slug: s, title: configs.get(s)?.title ?? s, pending: perEvent.get(s) ?? 0 }))
			.sort((a, b) => b.pending - a.pending || a.title.localeCompare(b.title)),
		pending: inbox.pending.map(row),
		expired: inbox.expired.map(row),
		rejected: inbox.rejected.map(row)
	};
}

/** @param {FormData} form */
const orderIdOf = (form) => String(form.get('order') ?? '').slice(0, 60);

/** @type {import('./$types').Actions} */
export const actions = {
	// "Confirmar pago": aprueba, emite las entradas y las manda por mail. Idempotente.
	confirm: async ({ locals, url, platform, request, fetch }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { transfer: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const r = await confirmTransferFromPanel({
			db,
			locals,
			by: admin.login,
			orderId: orderIdOf(form),
			// Clave del diálogo "Esto pasa el cupo" (solo si le admin confirmó; ver overrides.js).
			override: readOverride(form),
			sendMail: (order, tickets) =>
				inBackground(
					sendOrderEmail({ db, order, tickets, origin: siteOrigin(url), fetch }),
					platform
				)
		});
		const body = {
			transfer: {
				ok: r.ok,
				message: r.message,
				order: orderIdOf(form),
				needsConfirmation: r.needsConfirmation ?? null
			}
		};
		return r.ok ? body : fail(r.status, body);
	},

	cancel: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { transfer: { ok: false, message: 'Sin base de datos.' } });
		const r = await cancelTransferFromPanel({
			db,
			locals,
			by: admin.login,
			orderId: orderIdOf(await request.formData())
		});
		const body = { transfer: { ok: r.ok, message: r.message } };
		return r.ok ? body : fail(r.status, body);
	},

	// "Deshacer rechazo": la transferencia cancelada vuelve a esperar comprobante, con la reserva
	// renovada. Solo si hay lugar; si no, el mismo aviso que confirmar una tardía (`override`).
	reopen: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { transfer: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const r = await reopenTransferFromPanel({
			db,
			locals,
			by: admin.login,
			orderId: orderIdOf(form),
			holdMs: transferHoldMs(),
			override: readOverride(form)
		});
		const body = {
			transfer: {
				ok: r.ok,
				message: r.message,
				order: orderIdOf(form),
				action: 'reopen',
				needsConfirmation: r.needsConfirmation ?? null
			}
		};
		return r.ok ? body : fail(r.status, body);
	}
};
