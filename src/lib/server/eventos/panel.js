/**
 * Datos de los eventos para las páginas del panel (/admin/eventos, la agenda y la ficha
 * /admin/eventos/<slug>). Parten de `listEvents()` (los eventos de la base) y le suman de su
 * metadata lo que la lista no trae (etiquetas, nombre del lugar, link, organizadores).
 */
import { featuredURL, listEvents } from './index.js';
import { agendaRowFromMeta } from '$lib/utils/agenda.js';
import { eventMissing, missingInputFromMeta } from '$lib/utils/eventMissing.js';
import { splitEventTags } from '$lib/utils/adminTags.js';
import { isOnlinePlace } from '$lib/utils/eventPlace.js';
import { AR_OFFSET, parseEventDate, todayInArgentina } from '$lib/utils/eventDraft.js';

/**
 * La metadata de un evento de la base (como la de un .md), o null si no está o está borrado.
 * También los ocultos: el panel los ve.
 * @param {string} slug
 * @returns {Promise<Record<string, any> | null>}
 */
export async function bundleMeta(slug) {
	const { activeContentDB, findDbPostObject } = await import('../contenido/repo.js');
	const db = activeContentDB();
	const fromDb = db ? await findDbPostObject(db, 'calendario', slug) : null;
	if (!fromDb || fromDb.deleted) return null;
	const { eventToMeta } = await import('../contenido/eventos.js');
	return eventToMeta(fromDb.object);
}

/**
 * Lo mismo que {@link bundleMeta} para varios eventos de una vez: UNA consulta para todos (no una
 * o dos por evento) y sin armar el texto de cada uno. Para las listas del panel.
 * @param {string[]} slugs
 * @returns {Promise<Map<string, Record<string, any> | null>>}
 */
export async function bundleMetas(slugs) {
	const { activeContentDB, allDbEventObjects, dbPostFinder } = await import('../contenido/repo.js');
	const { eventToMeta } = await import('../contenido/eventos.js');
	const db = activeContentDB();
	const find = db ? dbPostFinder(await allDbEventObjects(db)) : () => null;
	/** @type {Map<string, Record<string, any> | null>} */
	const out = new Map();
	for (const slug of slugs) {
		const fromDb = find(slug);
		out.set(slug, fromDb && !fromDb.deleted ? eventToMeta(fromDb.object) : null);
	}
	return out;
}

/** @param {unknown} v */
const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

/**
 * @typedef {object} PanelEvent
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} start formato del sitio (2026-10-10T20:00-03:00) o ''
 * @prop {string} end
 * @prop {string} status anunciado | abierto | agotadas | cancelado | ''
 * @prop {string} location dirección
 * @prop {string} locationName
 * @prop {string} place región (etiqueta de lugar)
 * @prop {string[]} tags
 * @prop {string[]} authors
 * @prop {string} link
 * @prop {string} summary
 * @prop {boolean} unlisted
 * @prop {boolean} unpublished
 * @prop {boolean} online
 * @prop {boolean} kinkyvibe
 * @prop {boolean} sellsTickets tiene `tickets` en el frontmatter (aunque la venta esté cerrada)
 * @prop {boolean} draft borrador del panel (`borrador: true`, ver drafts.js)
 * @prop {string} [thumb] URL de la imagen
 */

/**
 * @param {import('./index.js').EventSummary} e
 * @param {Record<string, any> | null} meta
 * @returns {PanelEvent}
 */
function toPanelEvent(e, meta) {
	const tags = list(meta?.tags);
	const split = splitEventTags(tags);
	return {
		slug: e.slug,
		title: e.title,
		start: e.start,
		end: e.end,
		status: e.status,
		location: e.location,
		locationName: meta?.location_name ? String(meta.location_name) : '',
		place: split.place,
		tags,
		authors: list(meta?.authors),
		link: meta?.link ? String(meta.link) : '',
		summary: meta?.summary ? String(meta.summary) : '',
		unlisted: e.unlisted,
		unpublished: e.unpublished,
		// La regla de la página (eventPlace.js); con entradas, la ficha usa la de la venta.
		online: isOnlinePlace(meta ?? { tags, location: e.location }),
		kinkyvibe: split.kinkyvibe,
		sellsTickets: Array.isArray(meta?.tickets) && meta.tickets.length > 0,
		draft: meta?.borrador === true,
		thumb: e.thumb ?? featuredURL(e.slug, meta?.featured)
	};
}

/**
 * Todos los eventos, del más nuevo al más viejo, con los datos del panel y su frontmatter.
 * @returns {Promise<Array<{ event: PanelEvent, meta: Record<string, any> | null }>>}
 */
export async function listPanelEventsWithMeta() {
	const events = await listEvents();
	const metas = await bundleMetas(events.map((e) => e.slug));
	return events.map((e) => {
		const meta = metas.get(e.slug) ?? null;
		return { event: toPanelEvent(e, meta), meta };
	});
}

/**
 * Todos los eventos, del más nuevo al más viejo, con los datos del panel.
 * @returns {Promise<PanelEvent[]>}
 */
export async function listPanelEvents() {
	return (await listPanelEventsWithMeta()).map((x) => x.event);
}

/**
 * Un evento, o null si no existe en este deploy.
 * @param {string} slug
 * @returns {Promise<PanelEvent | null>}
 */
export async function getPanelEvent(slug) {
	const e = (await listEvents()).find((x) => x.slug === slug);
	if (!e) return null;
	return toPanelEvent(e, await bundleMeta(slug));
}

/**
 * Un evento que todavía no está en este deploy (recién creado o editado: el sitio tarda unos
 * minutos en publicarse), armado a partir de su frontmatter leído del repo.
 * @param {string} slug
 * @param {Record<string, any>} meta
 * @returns {PanelEvent}
 */
export function panelEventFromMeta(slug, meta) {
	const date = (/** @type {any} */ v) => {
		const { date: d, time } = parseEventDate(v);
		return d ? `${d}T${time || '00:00'}${AR_OFFSET}` : '';
	};
	return toPanelEvent(
		{
			slug,
			title: String(meta.title ?? slug),
			start: date(meta.start),
			end: date(meta.end),
			status: String(meta.status ?? ''),
			location: String(meta.location ?? ''),
			unlisted: meta.force_unlisted === true,
			unpublished: meta.force_unpublished === true,
			thumb: featuredURL(slug, meta.featured)
		},
		meta
	);
}

/**
 * Filas de la agenda: los eventos desde hoy (hora de Argentina) en adelante, del más cercano al
 * más lejano. Los despublicados (`force_unpublished`) no están: no se ven en ningún lado.
 * @param {{ today?: string }} [options]
 */
export async function agendaRows({ today = todayInArgentina() } = {}) {
	const events = (await listEvents()).filter(
		(e) => !e.unpublished && e.start && e.start.slice(0, 10) >= today
	);
	const metas = await bundleMetas(events.map((e) => e.slug));
	const rows = [];
	for (const e of events) {
		const meta = metas.get(e.slug) ?? null;
		rows.push({
			...agendaRowFromMeta(e.slug, {
				...(meta ?? {}),
				title: e.title,
				start: e.start,
				end: e.end,
				status: e.status,
				force_unlisted: e.unlisted
			}),
			thumb: e.thumb ?? '',
			sellsTickets: Array.isArray(meta?.tickets) && meta.tickets.length > 0,
			// Borrador del panel (`borrador: true`) y «qué falta» (lo muestra la agenda en los borradores).
			draft: meta?.borrador === true,
			missing: eventMissing(missingInputFromMeta({ ...(meta ?? {}), status: e.status }))
		});
	}
	rows.sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
	return rows;
}
