/**
 * Agenda impresa: los eventos públicos de un rango de días con lo que necesita cada fila del
 * volante (docs/panel.md#agenda-impresa). Solo lee: los eventos listados del sitio
 * (`sitePosts`), su lugar como lo ve cualquiera (`feedVenues`: nunca una dirección oculta), sus
 * tipos de entrada (`getEventTicketsMany`) y su serie (ícono y descripción de la etiqueta). Lo
 * que se arma con eso está en $lib/utils/agendaImpresa.js (puro, con pruebas).
 */
import { sitePosts } from '$lib/server/contenido/posts.js';
import { feedVenues } from '$lib/server/amigues/venues.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { getEventTicketsMany } from '$lib/server/tickets/events.js';
import { getDB, logDBError } from '$lib/server/db';
import { parseSiteDate } from '$lib/utils/dates.js';
import { flyerRow, inRange } from '$lib/utils/agendaImpresa.js';
import { seriesOfTags, seriesTagIds } from '$lib/utils/series.js';

/**
 * @param {App.Platform | undefined} platform
 * @param {{ from: string, to: string }} range días en hora de Argentina (`parseRange`)
 * @param {{ now?: number }} [opts]
 * @returns {Promise<(import('$lib/utils/agendaImpresa.js').FlyerRow & { start: string, series: string })[]>}
 */
export async function agendaImpresaRows(platform, range, { now = Date.now() } = {}) {
	const posts = (await sitePosts(platform))
		.filter((p) => p.meta?.layout === 'calendario' && p.meta.status !== 'cancelado')
		.filter((p) => inRange(p.meta.start, range))
		.sort((a, b) => parseSiteDate(a.meta.start).getTime() - parseSiteDate(b.meta.start).getTime());
	if (!posts.length) return [];
	const slugs = posts.map((p) => String(p.meta.postID));
	const db = getDB(platform);
	const [venues, tickets, tags] = await Promise.all([
		// Si falla, sin el lugar de nadie (mejor vacío que una dirección que debía estar oculta).
		feedVenues(db, slugs).catch((/** @type {unknown} */ e) => {
			logDBError('agenda impresa: lugares', e);
			return null;
		}),
		getEventTicketsMany(slugs).catch((/** @type {unknown} */ e) => {
			logDBError('agenda impresa: entradas', e);
			return new Map();
		}),
		siteTagManager(platform)
	]);
	const seriesIds = seriesTagIds(tags);
	return posts.map((p) => {
		const slug = String(p.meta.postID);
		const eventTags = Array.isArray(p.meta.tags) ? p.meta.tags.map(String) : [];
		// La serie más específica con ícono (una edición especial antes que su serie madre).
		const ids = seriesOfTags(eventTags, seriesIds).reverse();
		const id = ids.find((x) => tags.get(x)?.icon) ?? ids[0];
		const tag = id ? tags.get(id) : undefined;
		const linked = venues === null ? { level: /** @type {const} */ ('hidden') } : venues.get(slug);
		const row = flyerRow(
			{
				slug,
				title: String(p.meta.title ?? ''),
				start: p.meta.start,
				tags: eventTags,
				meta: p.meta,
				venue: linked ?? null,
				types: tickets.get(slug)?.types ?? null,
				series: tag
					? {
							name: tag.visible_name ?? id,
							icon: tag.icon ?? '',
							description: typeof tag.description === 'string' ? tag.description : ''
						}
					: null
			},
			{ now }
		);
		return { ...row, start: String(p.meta.start), series: tag ? (tag.visible_name ?? id) : '' };
	});
}
