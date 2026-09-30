import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { parseDocument } from 'yaml';
import { POSTS_DIR, getEventAdmin, getRepoClient } from '$lib/server/eventos';
import { getPanelEvent, panelEventFromMeta } from '$lib/server/eventos/panel.js';
import { splitMarkdown, validateSlug } from '$lib/utils/eventDraft.js';
import { getEventTickets } from '$lib/server/tickets/events.js';

/**
 * Un evento que no está en este deploy (recién creado, o el sitio todavía no se publicó): se lee
 * su archivo del repo (`getRepoClient()`: GitHub, el mock o la capa demo). null si no existe.
 * @param {App.Locals} locals
 * @param {string} slug
 */
async function eventFromRepo(locals, slug) {
	const admin = getEventAdmin(locals);
	if (!admin || validateSlug(slug)) return null;
	try {
		const raw = await (await getRepoClient()).getFile(admin.token, `${POSTS_DIR}/${slug}.md`);
		if (raw === null) return null;
		const meta = parseDocument(splitMarkdown(raw).frontmatter).toJS() ?? {};
		return panelEventFromMeta(slug, meta);
	} catch (e) {
		console.error(`[admin] no se pudo leer calendario/${slug}:`, e);
		return null;
	}
}

/**
 * Ficha de un evento (/admin/eventos/<slug>/*): datos del encabezado y contadores de las
 * pestañas. Cada pestaña carga lo suyo en su propio `load` (y puede usar esto con `parent()`).
 * @type {import('./$types').LayoutServerLoad}
 */
export async function load({ locals, url, params, platform }) {
	requireAdmin(locals, url);
	const event = (await getPanelEvent(params.slug)) ?? (await eventFromRepo(locals, params.slug));
	if (!event) error(404, 'No encontramos ese evento.');
	// Vende entradas de verdad (configuración válida y publicada): las pestañas de venta.
	const config = await getEventTickets(params.slug);
	const db = getDB(platform);
	const counts = { orders: 0, transfers: 0, review: 0 };
	if (db && config) {
		try {
			const row = await db
				.prepare(
					`SELECT
						SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS orders,
						SUM(CASE WHEN status = 'awaiting_transfer' AND expires_at > ?2 THEN 1 ELSE 0 END) AS transfers,
						SUM(CASE WHEN needs_review IS NOT NULL THEN 1 ELSE 0 END) AS review
					FROM orders WHERE event_slug = ?1`
				)
				.bind(params.slug, Date.now())
				.first();
			counts.orders = Number(row?.orders ?? 0);
			counts.transfers = Number(row?.transfers ?? 0);
			counts.review = Number(row?.review ?? 0);
		} catch (e) {
			logDBError('contadores de la ficha del evento', e);
		}
	}
	return {
		event: { ...event, sellsTickets: Boolean(config), online: config?.online ?? event.online },
		tabCounts: counts,
		dbAvailable: Boolean(db)
	};
}
