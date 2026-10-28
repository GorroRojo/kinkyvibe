import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { parseDocument } from 'yaml';
import { POSTS_DIR, getEventAdmin, getRepoClient } from '$lib/server/eventos';
import { getPanelEvent, panelEventFromMeta } from '$lib/server/eventos/panel.js';
import { splitMarkdown, validateSlug } from '$lib/utils/eventDraft.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { PANEL_VIEWER, readWorkshop } from '$lib/server/eventos/partes.js';
import { coveringTicketSlug, partLabel, partOf } from '$lib/utils/partes.js';
import { dateChangeOffer } from '$lib/server/tickets/dateChange.js';
import { isFlagOn } from '$lib/server/flags.js';
import { waitlistLiveByScope } from '$lib/server/tickets/waitlistAdmin.js';

/**
 * Talleres en varias partes (docs/talleres-partes.md): el chip del encabezado («Parte 2 de 3» con
 * link al taller, o «Taller en 3 partes») y si el modo puerta de esta parte usa las entradas del
 * taller. `null` si el evento no es parte de ningún taller.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {string} slug
 */
async function workshopChip(db, slug) {
	try {
		const ws = await readWorkshop(db, slug, PANEL_VIEWER);
		const part = partOf(ws, slug);
		if (!ws || !part) return null;
		return {
			label: part.n === 1 ? `Taller en ${ws.total} partes` : partLabel(part.n, ws.total),
			workshopSlug: ws.workshop.slug,
			workshopTitle: ws.workshop.title,
			isWorkshop: part.n === 1,
			coveredDoor: coveringTicketSlug(ws, slug) !== null
		};
	} catch (e) {
		logDBError('partes del taller', e);
		return null;
	}
}

/**
 * Los contadores de las pestañas de venta (órdenes aprobadas, transferencias vigentes, para
 * revisar), en una consulta. En 0 si la base falla.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
async function orderCounts(db, slug) {
	const counts = { orders: 0, transfers: 0, review: 0 };
	try {
		const row = await db
			.prepare(
				`SELECT
					SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS orders,
					SUM(CASE WHEN status = 'awaiting_transfer' AND expires_at > ?2 THEN 1 ELSE 0 END) AS transfers,
					SUM(CASE WHEN needs_review IS NOT NULL OR offline_review IS NOT NULL THEN 1 ELSE 0 END) AS review
				FROM orders WHERE event_slug = ?1`
			)
			.bind(slug, Date.now())
			.first();
		counts.orders = Number(row?.orders ?? 0);
		counts.transfers = Number(row?.transfers ?? 0);
		counts.review = Number(row?.review ?? 0);
	} catch (e) {
		logDBError('contadores de la ficha del evento', e);
	}
	return counts;
}

/**
 * El aviso de «Cambiaste la fecha» (`dateChangeOffer`), o null (también si la base falla).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {import('$lib/server/tickets/config.js').EventTickets} config
 * @returns {Promise<Awaited<ReturnType<typeof dateChangeOffer>>>}
 */
async function dateChangeOf(db, slug, config) {
	try {
		return await dateChangeOffer(db, slug, { cancelled: config.status === 'cancelado' });
	} catch (e) {
		logDBError('cambio de fecha en la ficha del evento', e);
		return null;
	}
}

/**
 * Las anotaciones vivas de la lista de espera del evento; 0 si la base falla (o sin la migración
 * 0053).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
async function waitlistCount(db, slug) {
	try {
		return Object.values(await waitlistLiveByScope(db, slug)).reduce((a, b) => a + b, 0);
	} catch (e) {
		logDBError('contador de la lista de espera', e);
		return 0;
	}
}

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
	// Las dos lecturas a la vez (cada una es una ida a la base).
	const [found, config] = await Promise.all([
		getPanelEvent(params.slug),
		// Vende entradas de verdad (configuración válida y publicada): las pestañas de venta.
		getEventTickets(params.slug)
	]);
	const event = found ?? (await eventFromRepo(locals, params.slug));
	if (!event) error(404, 'No encontramos ese evento.');
	const db = getDB(platform);
	// Ya con el evento y su venta: lo demás no depende entre sí, a la par (con las tandas
	// automáticas, en una ida). Cada parte con su manejo de errores de siempre.
	const [tabCounts, dateChange, waitlist, workshop, gastosTab] = await Promise.all([
		db && config ? orderCounts(db, params.slug) : { orders: 0, transfers: 0, review: 0 },
		// «Cambiaste la fecha»: el aviso de arriba de todas las pestañas (dateChange.js), con
		// «Avisar a les compradores». Solo si hay a quién avisar.
		db && config ? dateChangeOf(db, params.slug, config) : null,
		// Lista de espera: la pestaña (con el interruptor, o si el evento ya tiene lista o gente
		// anotada) y su contador (las anotaciones vivas). Sin la migración 0053, nada.
		config
			? Promise.all([isFlagOn(db, 'lista_espera'), db ? waitlistCount(db, params.slug) : 0])
			: null,
		workshopChip(db, params.slug),
		// Gastos y reparto (prototipo): la vista de Ventas, solo con el interruptor.
		config ? isFlagOn(db, 'gastos_reparto') : false
	]);
	const counts = { ...tabCounts, waitlist: waitlist ? waitlist[1] : 0 };
	const waitlistTab = config
		? Boolean(waitlist?.[0]) || Boolean(config.waitlist) || counts.waitlist > 0
		: false;
	return {
		event: { ...event, sellsTickets: Boolean(config), online: config?.online ?? event.online },
		workshop,
		tabCounts: counts,
		dateChange,
		dbAvailable: Boolean(db),
		// Pestaña Preguntas (preguntas de inscripción).
		signupFieldsTab: Boolean(db && config),
		waitlistTab,
		gastosTab
	};
}
