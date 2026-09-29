import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import {
	checkIn,
	getTicketByToken,
	searchTickets,
	undoCheckIn
} from '$lib/server/tickets/orders.js';

/**
 * Acepta el token solo, o la URL completa del QR (/entradas/t/<token>).
 *
 * @param {unknown} raw
 */
function extractToken(raw) {
	const s = String(raw ?? '').trim();
	const m = s.match(/\/entradas\/t\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/);
	return m ? m[1] : s;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
async function progress(db, slug) {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS total, COUNT(t.checked_in_at) AS inside FROM tickets t
			JOIN orders o ON o.id = t.order_id WHERE t.event_slug = ?1 AND o.status = 'approved'`
		)
		.bind(slug)
		.first();
	return { total: Number(row?.total ?? 0), inside: Number(row?.inside ?? 0) };
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const q = url.searchParams.get('q')?.trim() ?? '';
	const names = Object.fromEntries(config.types.map((t) => [t.id, t.name]));
	const results = q
		? (await searchTickets(db, params.slug, q)).map((t) => ({
				id: t.id,
				token: t.token,
				holder: t.holder_name,
				pronouns: t.holder_pronouns ?? '',
				buyer: t.buyer_name,
				dni: t.buyer_dni ?? '',
				email: t.buyer_email,
				type: names[t.ticket_type] ?? t.ticket_type,
				checkedInAt: t.checked_in_at,
				checkedInBy: t.checked_in_by
			}))
		: [];
	return {
		slug: params.slug,
		title: config.title,
		q,
		results,
		progress: await progress(db, params.slug)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	checkin: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) {
			return fail(503, {
				checkin: {
					result: 'error',
					holder: null,
					pronouns: null,
					buyer: null,
					dni: null,
					type: null,
					at: null,
					by: null,
					ticketId: null,
					otherEvent: null,
					stamp: Date.now()
				}
			});
		}
		const token = extractToken((await request.formData()).get('token'));
		const r = await checkIn(db, { token, eventSlug: params.slug, by: admin.login });
		// Quién compró y su DNI (el UPDATE del check-in devuelve solo la entrada).
		const full = r.ticket && r.result !== 'wrong-event' ? await getTicketByToken(db, token) : null;
		let otherEvent = null;
		if (r.result === 'wrong-event' && r.ticket) {
			otherEvent = (await getEventTickets(r.ticket.event_slug))?.title ?? r.ticket.event_slug;
		}
		const config = await getEventTickets(params.slug);
		const type = config?.types.find((t) => t.id === r.ticket?.ticket_type)?.name;
		return {
			checkin: {
				result: r.result,
				// Para "otro evento" no mostramos datos de la persona, solo de qué evento es.
				holder: r.result === 'wrong-event' ? null : (r.ticket?.holder_name ?? null),
				pronouns: r.result === 'wrong-event' ? null : (r.ticket?.holder_pronouns ?? null),
				// Quién compró y su DNI, por si la puerta necesita chequearlo con el documento.
				buyer: full?.buyer_name ?? null,
				dni: full?.buyer_dni ?? null,
				type: r.result === 'wrong-event' ? null : (type ?? null),
				at: r.ticket?.checked_in_at ?? null,
				by: r.ticket?.checked_in_by ?? null,
				ticketId: r.result === 'ok' ? (r.ticket?.id ?? null) : null,
				otherEvent,
				stamp: Date.now()
			}
		};
	},
	undo: async ({ locals, url, params, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { undo: { ok: false } });
		const ticketId = String((await request.formData()).get('ticket') ?? '');
		const ok = await undoCheckIn(db, { ticketId, eventSlug: params.slug });
		return { undo: { ok } };
	}
};
