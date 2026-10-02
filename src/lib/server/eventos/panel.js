/**
 * Datos de los eventos para las páginas del panel (/admin/eventos, la agenda y la ficha
 * /admin/eventos/<slug>). Parten de `listEvents()` (los eventos de este deploy; en los previews,
 * con los cambios del modo demo) y le suman del frontmatter lo que la lista no trae (etiquetas,
 * nombre del lugar, link, organizadores).
 */
import { featuredURL, listEvents } from './index.js';
import { agendaRowFromMeta } from '$lib/utils/agenda.js';
import { eventMissing, missingInputFromMeta } from '$lib/utils/eventMissing.js';
import { splitEventTags } from '$lib/utils/adminTags.js';
import { AR_OFFSET, parseEventDate, todayInArgentina } from '$lib/utils/eventDraft.js';

const metaModules = import.meta.glob('/src/lib/posts/calendario/*.md', { import: 'metadata' });

/**
 * Frontmatter de un evento en este deploy, o null.
 * @param {string} slug
 * @returns {Promise<Record<string, any> | null>}
 */
export async function bundleMeta(slug) {
	const load = metaModules[`/src/lib/posts/calendario/${slug}.md`];
	if (!load || slug.startsWith('_')) return null;
	try {
		return /** @type {Record<string, any>} */ ((await load()) ?? null);
	} catch (e) {
		return null;
	}
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
		online: split.place === 'Online' || meta?.modalidad === 'online',
		kinkyvibe: split.kinkyvibe,
		sellsTickets: Array.isArray(meta?.tickets) && meta.tickets.length > 0,
		thumb: e.thumb ?? featuredURL(e.slug, meta?.featured)
	};
}

/**
 * Todos los eventos, del más nuevo al más viejo, con los datos del panel.
 * @returns {Promise<PanelEvent[]>}
 */
export async function listPanelEvents() {
	const events = await listEvents();
	return Promise.all(events.map(async (e) => toPanelEvent(e, await bundleMeta(e.slug))));
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
	const events = await listEvents();
	const rows = [];
	for (const e of events) {
		if (e.unpublished || !e.start || e.start.slice(0, 10) < today) continue;
		const meta = await bundleMeta(e.slug);
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
			// «Qué falta» (lo muestra la agenda en los borradores).
			missing: eventMissing(missingInputFromMeta({ ...(meta ?? {}), status: e.status }))
		});
	}
	rows.sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
	return rows;
}
