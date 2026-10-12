/**
 * La lista de espera de un evento en CSV (una fila por anotación, en el orden de la pestaña),
 * con el mail de cada persona: tratar el archivo como dato personal. Solo admins: los layouts no
 * protegen los endpoints `+server.js`, así que se controla acá.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import {
	WAITLIST_END_LABELS,
	WAITLIST_STATUS_LABELS,
	waitlistEntriesForCsv
} from '$lib/server/tickets/waitlistAdmin.js';
import { orderReference } from '$lib/utils/tickets.js';
import { csvFilename, csvResponse, toCsv } from '$lib/admin/csv.js';

/** @param {number | null} ms */
const at = (ms) => (ms == null ? '' : new Date(ms));

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, params, platform }) {
	requireAdmin(locals, url);
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const names = Object.fromEntries(config.types.map((t) => [t.id, t.name]));
	const entries = await waitlistEntriesForCsv(db, params.slug);
	/** @type {import('$lib/admin/csv.js').CsvColumn<(typeof entries)[number]>[]} */
	const columns = [
		{
			label: 'alcance',
			value: (e) => (e.ticketType ? (names[e.ticketType] ?? e.ticketType) : 'evento')
		},
		{ label: 'email', value: (e) => e.email },
		{
			label: 'estado',
			value: (e) =>
				WAITLIST_STATUS_LABELS[/** @type {keyof typeof WAITLIST_STATUS_LABELS} */ (e.status)] ??
				e.status
		},
		{ label: 'lugar_en_la_fila', value: (e) => e.position ?? '' },
		{ label: 'anotade', value: (e) => at(e.createdAt) },
		{ label: 'confirmo', value: (e) => at(e.confirmedAt) },
		{ label: 'ofertas', value: (e) => e.offerCount },
		{ label: 'ultima_oferta', value: (e) => at(e.offeredAt) },
		{ label: 'lugar_guardado_hasta', value: (e) => at(e.holdUntil) },
		{ label: 'orden', value: (e) => (e.orderId ? orderReference(e.orderId) : '') },
		{ label: 'estado_orden', value: (e) => e.orderStatus ?? '' },
		{ label: 'termino', value: (e) => at(e.endedAt) },
		{
			label: 'motivo',
			value: (e) =>
				e.endReason
					? (WAITLIST_END_LABELS[/** @type {keyof typeof WAITLIST_END_LABELS} */ (e.endReason)] ??
						e.endReason)
					: ''
		},
		{ label: 'por', value: (e) => e.endedBy ?? '' },
		{ label: 'mails_que_no_salieron', value: (e) => e.failedMails }
	];
	return csvResponse(toCsv(entries, columns), csvFilename('lista-de-espera', params.slug));
}
