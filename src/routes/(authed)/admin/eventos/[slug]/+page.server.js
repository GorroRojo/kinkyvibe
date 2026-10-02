/**
 * Ficha del evento, pestaña Resumen: datos, checklist (imagen, link de la transmisión,
 * recordatorios, venta abierta) y el link de la transmisión de los eventos online.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { pickActions } from '$lib/server/admin/eventActions.js';
import { salesState } from '$lib/server/tickets/config.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { parseReminders } from '$lib/server/tickets/reminders.js';
import { getSalesSettings } from '$lib/server/tickets/settings.js';
import { getStreamLink, streamLinkRecipients } from '$lib/server/tickets/stream.js';
import { saleWindowText } from '$lib/utils/tickets.js';
import { getEventAdmin, getRepoClient } from '$lib/server/eventos';
import { confirmDraft } from '$lib/server/eventos/drafts.js';
import { eventMissing } from '$lib/utils/eventMissing.js';
import { panelVenueRow } from '$lib/server/amigues/eventFormVenue.js';

/** @type {Record<string, string>} */
const CLOSED_REASON = {
	cancelled: 'El evento está cancelado',
	soldout: 'Marcado como agotado',
	closed: 'La venta cerró',
	notyet: 'La venta todavía no abrió'
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, parent, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const { event } = await parent();
	const db = getDB(platform);
	const config = await getEventTickets(params.slug);
	/** @type {{ id: string, label: string, ok: boolean, detail: string, href?: string }[]} */
	const checklist = [
		{
			id: 'imagen',
			label: 'Imagen',
			ok: Boolean(event.thumb),
			detail: event.thumb ? 'Tiene imagen.' : 'Sin imagen: se ve un degradé en las listas.',
			href: event.thumb ? undefined : 'editar'
		},
		{
			id: 'publicado',
			label: 'Publicado',
			ok: !event.unlisted,
			detail: event.unlisted
				? 'No listado: no aparece en el calendario, solo se ve con el link.'
				: 'Aparece en el calendario.',
			href: event.unlisted ? 'editar' : undefined
		}
	];

	/** @type {{ link: string | null, updatedAt: number | null, updatedBy: string | null, pending: number, approvedOrders: number } | null} */
	let stream = null;
	/** @type {{ open: boolean, text: string } | null} */
	let sale = null;
	if (config) {
		const state = salesState(config);
		const window = saleWindowText(config);
		sale = {
			open: state.open,
			text: state.open
				? (window ?? 'Se pueden comprar entradas.')
				: `${CLOSED_REASON[state.reason] ?? 'Venta cerrada'}.`
		};
		checklist.push({ id: 'venta', label: 'Venta abierta', ok: state.open, detail: sale.text });
		let remindersOn = config.reminders;
		let remindersDetail = config.reminders
			? 'Se mandan los recordatorios por mail configurados en Ajustes.'
			: 'Este evento tiene `recordatorios: false`: no se mandan.';
		if (config.reminders) {
			try {
				const count = parseReminders((await getSalesSettings(db)).reminders).length;
				remindersOn = count > 0;
				if (!count) remindersDetail = 'No hay recordatorios configurados en Ajustes.';
				else
					remindersDetail = `${count} ${count === 1 ? 'recordatorio' : 'recordatorios'} por mail antes del evento.`;
			} catch (e) {
				logDBError('recordatorios en la ficha', e);
			}
		}
		checklist.push({
			id: 'recordatorios',
			label: 'Recordatorios',
			ok: remindersOn,
			detail: remindersDetail
		});
		if (config.online && db) {
			try {
				const current = await getStreamLink(db, params.slug);
				const approved = await db
					.prepare("SELECT COUNT(*) AS n FROM orders WHERE event_slug = ?1 AND status = 'approved'")
					.bind(params.slug)
					.first();
				stream = {
					link: current?.link ?? null,
					updatedAt: current?.updatedAt ?? null,
					updatedBy: current?.updatedBy ?? null,
					pending: current
						? (
								await streamLinkRecipients(db, params.slug, current.link, {
									includeFailed: true
								})
							).length
						: 0,
					approvedOrders: Number(approved?.n ?? 0)
				};
			} catch (e) {
				logDBError('link de la transmisión en la ficha', e);
			}
			checklist.push({
				id: 'link',
				label: 'Link de la transmisión',
				ok: Boolean(stream?.link),
				detail: stream?.link
					? 'Cargado: les compradores lo reciben por mail.'
					: 'Falta cargarlo (abajo).'
			});
		}
	}
	// Borrador del panel (`borrador: true` y no listado): «Confirmar», con lo que le falta.
	const draft = Boolean(event.draft && event.unlisted);
	const missing = draft
		? eventMissing({
				image: Boolean(event.thumb),
				summary: event.summary,
				location: event.location,
				locationName: event.locationName,
				tags: event.tags,
				authors: event.authors,
				link: event.link,
				tickets: Boolean(event.sellsTickets),
				status: event.status
			})
		: [];
	// «Lugar»: el vinculado (en `event_venues`, se elige en el formulario del evento).
	const venue = await panelVenueRow(db, params.slug);
	return { checklist, stream, sale, online: Boolean(config?.online), draft, missing, venue };
}

export const actions = {
	...pickActions('setLink', 'sendLink'),
	/** «Confirmar» un borrador: pasa a publicado (lo mismo que en la agenda). */
	confirmar: async ({ locals, url, params, platform }) => {
		requireAdmin(locals, url);
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { confirm: { ok: false, message: 'No tenés permiso.' } });
		const r = await confirmDraft({
			platform,
			locals,
			client: await getRepoClient(),
			admin,
			slug: params.slug
		});
		return r.ok ? { confirm: r } : fail(r.status, { confirm: r });
	}
};
