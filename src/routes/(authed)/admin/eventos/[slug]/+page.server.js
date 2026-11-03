/**
 * Ficha del evento, pestaña Resumen: datos, checklist (imagen, link de la transmisión,
 * recordatorios, venta abierta), el link de la transmisión de los eventos online y los links de
 * puerta de los presenciales (docs/tickets.md, «Link de puerta»).
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
import { getPanelEvent } from '$lib/server/eventos/panel.js';
import { onlineTagMismatch } from '$lib/utils/onlineTagMismatch.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import {
	DOOR_LINK_MIN_MS,
	createDoorLink,
	defaultDoorLinkExpiry,
	doorLinkUrl,
	listDoorLinks,
	parseDoorLinkForm,
	revokeDoorLink
} from '$lib/server/tickets/doorLinks.js';
import { toArgentinaLocalInput } from '$lib/utils/tickets.js';
import { siteOrigin } from '$lib/server/tickets/index.js';

/**
 * Los links de puerta vivos del evento y el vencimiento por defecto para el formulario. `null` si
 * el evento no tiene control de ingreso (no vende entradas o es online). `links: null` si la base
 * falla (o todavía no tiene la migración de `door_links`).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @param {import('$lib/server/tickets/config.js').EventTickets | null} config
 */
async function doorLinksFor(db, slug, config) {
	if (!config || config.online) return null;
	const now = Date.now();
	const expiry = defaultDoorLinkExpiry(config, now);
	const defaultExpires = expiry >= now + DOOR_LINK_MIN_MS ? toArgentinaLocalInput(expiry) : '';
	if (!db) return { links: null, defaultExpires };
	try {
		const links = (await listDoorLinks(db, slug, now)).map((l) => ({
			id: l.id,
			label: l.label,
			createdBy: l.created_by,
			createdAt: Number(l.created_at),
			expiresAt: Number(l.expires_at),
			lastUsedAt: l.last_used_at === null ? null : Number(l.last_used_at)
		}));
		return { links, defaultExpires };
	} catch (e) {
		logDBError('links de puerta en la ficha', e);
		return { links: null, defaultExpires };
	}
}

/** @type {Record<string, string>} */
const CLOSED_REASON = {
	cancelled: 'El evento está cancelado',
	soldout: 'Marcado como «Agotadas»',
	closed: 'Venta cerrada',
	notyet: 'La venta todavía no abrió'
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, parent, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	// Todo lo que se lee de la base sale a la par (cada lectura en fila es una ida). El evento, sin
	// `parent()`: en una navegación, `parent()` hace correr los layouts de arriba en fila antes que
	// esto. Lo mismo que arma el layout de la ficha (getPanelEvent, con `sellsTickets` y `online`
	// de la venta); solo si no está en este deploy, el del layout (que lo lee del repo o da 404).
	const settingsP = getSalesSettings(db);
	settingsP.catch(() => {}); // solo se usa con recordatorios (y ahí se ve su error)
	const venueP = panelVenueRow(db, params.slug);
	const [found, config] = await Promise.all([
		getPanelEvent(params.slug),
		getEventTickets(params.slug)
	]);
	const event = found
		? { ...found, sellsTickets: Boolean(config), online: config?.online ?? found.online }
		: (await parent()).event;
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
				const count = parseReminders((await settingsP).reminders).length;
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
				// Las dos a la par; si fallan las dos, cuenta el error del link (como en fila).
				const currentP = getStreamLink(db, params.slug);
				const approvedP = db
					.prepare("SELECT COUNT(*) AS n FROM orders WHERE event_slug = ?1 AND status = 'approved'")
					.bind(params.slug)
					.first();
				approvedP.catch(() => {});
				const current = await currentP;
				const approved = await approvedP;
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
	// «Lugar»: el vinculado (edge `lugar` del evento, se elige en el formulario del evento).
	const venue = await venueP;
	// Links de puerta (presenciales con entradas).
	const doorLinks = await doorLinksFor(db, params.slug, config);
	// Etiqueta «Online» y además un lugar: un aviso arriba (no cambia nada).
	const onlineMismatch = onlineTagMismatch(
		{ tags: event.tags, location: event.location, location_name: event.locationName },
		{ hasVenue: Boolean(venue) }
	);
	return {
		checklist,
		stream,
		sale,
		online: Boolean(config?.online),
		draft,
		missing,
		venue,
		onlineMismatch,
		doorLinks
	};
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
	},

	/**
	 * «Crear link de puerta»: un link que abre solo el modo puerta de este evento, sin cuenta. El
	 * link (con el token) se devuelve **una sola vez**, en esta respuesta; en la base queda su hash.
	 * El registro anota el id del link, nunca el token.
	 */
	crearLinkPuerta: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		/** @param {number} status @param {string} message */
		const bad = (status, message) => fail(status, { doorLink: { ok: false, message } });
		if (!db) return bad(503, 'No hay base de datos disponible.');
		const config = await getEventTickets(params.slug);
		if (!config) return bad(400, 'Este evento no vende entradas: no tiene puerta.');
		if (config.online) return bad(400, 'Es un evento online: no tiene control de ingreso.');
		const form = await request.formData();
		const parsed = parseDoorLinkForm(
			{ label: form.get('label'), expires: form.get('expires') },
			config
		);
		if (!parsed.ok) return bad(400, parsed.message);
		const r = await createDoorLink(db, {
			eventSlug: params.slug,
			label: parsed.label,
			createdBy: admin.login,
			expiresAt: parsed.expiresAt
		});
		if (!r.ok) return bad(409, 'Este evento ya tiene muchos links de puerta vivos: revocá alguno.');
		await logAdminAction(db, locals, {
			action: 'door_link.create',
			targetType: 'event',
			targetId: params.slug,
			summary: `Creó un link de puerta${parsed.label ? ` («${parsed.label}»)` : ''}`,
			detail: { doorLink: r.link.id, label: parsed.label, expiresAt: parsed.expiresAt }
		});
		return {
			doorLink: {
				ok: true,
				message: 'Link creado. Copialo ahora: después no se puede volver a ver.',
				url: doorLinkUrl(siteOrigin(url), r.token),
				label: parsed.label,
				expiresAt: parsed.expiresAt
			}
		};
	},

	/** «Revocar» un link de puerta de este evento: deja de andar al toque. */
	revocarLinkPuerta: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db)
			return fail(503, { doorLink: { ok: false, message: 'No hay base de datos disponible.' } });
		const id = (await request.formData()).get('id');
		const revoked = await revokeDoorLink(db, { id, eventSlug: params.slug, by: admin.login });
		if (!revoked) {
			return fail(404, { doorLink: { ok: false, message: 'Ese link ya no está vivo.' } });
		}
		await logAdminAction(db, locals, {
			action: 'door_link.revoke',
			targetType: 'event',
			targetId: params.slug,
			summary: `Revocó un link de puerta${revoked.label ? ` («${revoked.label}»)` : ''}`,
			detail: { doorLink: revoked.id, label: revoked.label }
		});
		return { doorLink: { ok: true, message: 'Link revocado: ya no abre la puerta.' } };
	}
};
