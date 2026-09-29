/**
 * Página de una entrada: QR y datos de ESA entrada (nada de otras personas).
 * Si la abre une admin (p. ej. escaneando el QR con la cámara del celu), puede marcar el ingreso.
 */
import { error, fail } from '@sveltejs/kit';
import { isAdmin, requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { formatEventDate } from '$lib/server/tickets/email.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { siteOrigin } from '$lib/server/tickets/index.js';
import { checkIn, getTicketByToken, isValidToken } from '$lib/server/tickets/orders.js';
import { qrSvg } from '$lib/server/tickets/qr.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, url, locals }) {
	if (!isValidToken(params.token)) error(404, 'Entrada no encontrada.');
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	const ticket = await getTicketByToken(db, params.token);
	if (!ticket) error(404, 'Entrada no encontrada.');
	const config = await getEventTickets(ticket.event_slug);
	return {
		// Nombre y pronombres, nunca el DNI (esta página la ve cualquiera que tenga el QR).
		ticket: {
			holder: ticket.holder_name,
			pronouns: ticket.holder_pronouns ?? '',
			type: config?.types.find((t) => t.id === ticket.ticket_type)?.name ?? ticket.ticket_type,
			state: /** @type {'void' | 'used' | 'valid'} */ (
				ticket.order_status !== 'approved' ? 'void' : ticket.checked_in_at ? 'used' : 'valid'
			),
			checkedInAt: ticket.checked_in_at
		},
		event: {
			slug: ticket.event_slug,
			title: config?.title ?? ticket.event_slug,
			when: formatEventDate(config?.start),
			where: [config?.location_name, config?.location].filter(Boolean).join(' · ')
		},
		qr: qrSvg(`${siteOrigin(url)}/entradas/t/${params.token}`),
		isAdmin: isAdmin(locals.user)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	checkin: async ({ params, platform, locals, url }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { checkin: { result: 'error', at: null, by: null } });
		const ticket = await getTicketByToken(db, params.token);
		if (!ticket) return fail(404, { checkin: { result: 'invalid', at: null, by: null } });
		const r = await checkIn(db, {
			token: params.token,
			eventSlug: ticket.event_slug,
			by: admin.login
		});
		return {
			checkin: {
				result: r.result,
				at: r.ticket?.checked_in_at ?? null,
				by: r.ticket?.checked_in_by ?? null
			}
		};
	}
};
