/**
 * Página de una entrada: QR y datos de ESA entrada (nada de otras personas).
 * Si la abre une admin (p. ej. escaneando el QR con la cámara del celu), puede marcar el ingreso.
 *
 * Avisos de puerta (decisión 0053, $lib/server/tickets/doorNotices.js): solo para une admin y en
 * un evento de Kinky Vibe, el bloque de admin muestra «Avisá a la organización antes de dejar
 * pasar» si la entrada coincide (`adminNotice`, y `notice` en la respuesta de `checkin`: el texto
 * o `null`; el texto viaja desde acá, así no está en el JavaScript de la página). Para
 * cualquier otra persona la respuesta es la misma de siempre: ni el campo ni la consulta. La página
 * no queda en cachés compartidas (`cache-control: private, no-store` en ../../+layout.server.js).
 */
import { error, fail } from '@sveltejs/kit';
import { isAdmin, requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { formatEventDate } from '$lib/server/tickets/email.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { siteOrigin, streamLinkFor } from '$lib/server/tickets/index.js';
import { checkIn, getTicketByToken, isValidToken } from '$lib/server/tickets/orders.js';
import {
	DOOR_NOTICE_TEXT,
	isKinkyVibeDoor,
	ticketHasDoorNotice
} from '$lib/server/tickets/doorNotices.js';
import { qrSvg } from '$lib/server/tickets/qr.js';
import { buyerLocation } from '$lib/server/amigues/venues.js';
import { workshopPartsList } from '$lib/server/tickets/workshopParts.js';
import { salePlaceText } from '$lib/utils/eventPlace.js';

/**
 * El texto del aviso de puerta si la entrada coincide y el evento es de Kinky Vibe; si no, `null`.
 * Solo se llama para admins.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} token
 * @param {{ fondoEnabled?: boolean } | null | undefined} config
 */
async function noticeText(db, token, config) {
	if (!isKinkyVibeDoor(config)) return null;
	return (await ticketHasDoorNotice(db, { token, kinkyVibe: true })) ? DOOR_NOTICE_TEXT : null;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, url, locals }) {
	if (!isValidToken(params.token)) error(404, 'Entrada no encontrada.');
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	const ticket = await getTicketByToken(db, params.token);
	if (!ticket) error(404, 'Entrada no encontrada.');
	const valid = ticket.order_status === 'approved';
	// La venta del evento, el lugar y las partes del taller, juntos (cada ida y vuelta a D1 cuenta).
	const configP = getEventTickets(ticket.event_slug);
	const onlineP = configP.then((config) => Boolean(config?.online));
	const [config, buyerVenue, parts, streamLink] = await Promise.all([
		configP,
		// Con la compra aprobada, el lugar completo (aunque en el sitio no se muestre la dirección).
		// Se lee sin esperar a saber si es online; si lo es, no se usa.
		valid ? buyerLocation(db, ticket.event_slug) : null,
		// Taller en varias partes con una sola entrada: la fecha y el lugar de cada parte (el lugar
		// completo solo con la compra aprobada, como el del taller).
		workshopPartsList(db, ticket.event_slug, { online: onlineP, buyer: valid }),
		// Eventos online: el link de la transmisión (solo con la compra aprobada), sin QR.
		onlineP.then((online) => (online && valid ? streamLinkFor(db, ticket.event_slug) : null))
	]);
	const online = Boolean(config?.online);
	const venue = online ? null : buyerVenue;
	const place = venue ?? config;
	const admin = isAdmin(locals.user);
	// Solo une admin, y solo en eventos de Kinky Vibe, llega a consultar los avisos.
	const adminNotice = admin ? await noticeText(db, params.token, config) : null;
	return {
		// Nombre y pronombres, nunca el DNI (esta página la ve cualquiera que tenga el QR).
		ticket: {
			holder: ticket.holder_name,
			pronouns: ticket.holder_pronouns ?? '',
			type: config?.types.find((t) => t.id === ticket.ticket_type)?.name ?? ticket.ticket_type,
			state: /** @type {'void' | 'refunded' | 'used' | 'valid'} */ (
				ticket.order_status === 'refunded'
					? 'refunded'
					: ticket.order_status !== 'approved'
						? 'void'
						: ticket.checked_in_at
							? 'used'
							: 'valid'
			),
			checkedInAt: ticket.checked_in_at,
			code: ticket.code ?? null
		},
		event: {
			slug: ticket.event_slug,
			title: config?.title ?? ticket.event_slug,
			when: formatEventDate(config?.start),
			where: salePlaceText(online, place),
			online,
			parts
		},
		streamLink,
		qr: online ? null : qrSvg(`${siteOrigin(url)}/entradas/t/${params.token}`),
		isAdmin: admin,
		// Para quien no es admin, el campo no existe (la respuesta es la de siempre).
		...(admin ? { adminNotice } : {})
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	checkin: async ({ params, platform, locals, url }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { checkin: { result: 'error', at: null, by: null, notice: null } });
		const ticket = await getTicketByToken(db, params.token);
		if (!ticket)
			return fail(404, { checkin: { result: 'invalid', at: null, by: null, notice: null } });
		const [r, notice] = await Promise.all([
			checkIn(db, {
				token: params.token,
				eventSlug: ticket.event_slug,
				by: admin.login
			}),
			getEventTickets(ticket.event_slug)
				.then((config) => noticeText(db, params.token, config))
				.catch(() => null)
		]);
		return {
			checkin: {
				result: r.result,
				at: r.ticket?.checked_in_at ?? null,
				by: r.ticket?.checked_in_by ?? null,
				notice
			}
		};
	}
};
