/**
 * Lo que comparten la página del modo puerta y sus endpoints: la configuración del evento, los
 * nombres de los tipos y quiénes fueron a ediciones anteriores de la serie (cacheado un minuto
 * por instancia: se usa en cada escaneo y cambia muy poco durante la noche). La serie sale de las
 * etiquetas del evento (hijas de «evento recurrente»), como en las páginas de series.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { readAndKeep } from '$lib/server/db/perRequest.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';
import { doorSeries, priorAttendance } from '$lib/server/tickets/series.js';
import { siteTags } from '$lib/server/series/index.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { PANEL_VIEWER, readWorkshop } from '$lib/server/eventos/partes.js';
import { coveringTicketSlug, partLabel, partOf } from '$lib/utils/partes.js';

const PRIOR_TTL_MS = 60 * 1000;
/**
 * Solo lo ya leído: lo que está en camino se comparte solo dentro del pedido (`readAndKeep`,
 * src/lib/server/db/perRequest.js).
 * @type {Map<string, { at: number, value: import('$lib/server/tickets/series.js').PriorAttendance }>}
 */
const priorCache = new Map();

/**
 * Los eventos salen de la capa compartida de contenido (`sitePosts`: de la base).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {App.Platform} [platform]
 */
export function cachedPrior(db, slug, platform) {
	const now = Date.now();
	const hit = priorCache.get(slug);
	if (hit && now - hit.at < PRIOR_TTL_MS) return Promise.resolve(hit.value);
	return readAndKeep(
		db,
		`prior-attendance\n${slug}`,
		() =>
			sitePosts(platform).then((posts) => priorAttendance(db, { slug, posts, tags: siteTags() })),
		(value) => priorCache.set(slug, { at: now, value })
	).catch((e) => {
		console.error('[puerta] primera vez en la serie:', e);
		return null;
	});
}

/**
 * Nombre de la serie del evento para la pantalla ("Primera vez en Picantearla"); `''` si el
 * evento no tiene etiqueta de serie.
 *
 * @param {string} slug
 * @param {App.Platform} [platform]
 */
export async function doorSeriesLabel(slug, platform) {
	return doorSeries(await sitePosts(platform), siteTags(), slug).series.label;
}

/**
 * Talleres en varias partes (docs/talleres-partes.md): si `slug` es una parte (2 en adelante) de un
 * taller con una sola entrada, las entradas son las del taller (`ticketSlug`) y el ingreso se
 * marca por parte (`part`, src/lib/server/tickets/partCheckins.js). Si no, todo es del evento.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @returns {Promise<{ ticketSlug: string, part: { slug: string, label: string, workshop: string } | null }>}
 */
export async function doorScope(db, slug) {
	const ws = await readWorkshop(db, slug, PANEL_VIEWER).catch((e) => {
		console.error('[puerta] partes del taller:', e);
		return null;
	});
	const host = coveringTicketSlug(ws, slug);
	const part = host && ws ? partOf(ws, slug) : null;
	if (!host || !ws || !part) return { ticketSlug: slug, part: null };
	return {
		ticketSlug: host,
		part: { slug, label: partLabel(part.n, ws.total), workshop: ws.workshop.title }
	};
}

/**
 * @param {{ params: { slug: string }, platform: App.Platform | undefined, fetch: typeof fetch }} event
 * @param {{ fondo?: boolean }} [opts] `fondo`: resolver el porcentaje del Fondo (para vender)
 */
export async function doorContext({ params, platform, fetch }, { fondo = false } = {}) {
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	// La venta del evento se lee junto con las partes del taller, sin esperarlas: casi siempre las
	// entradas son las del mismo evento. Solo en una parte de un taller con una sola entrada se lee
	// después la del taller (y la propia no se usa).
	const fondoP = fondo
		? resolveFondoPercent({ db, fetch }).then((r) => r.percent)
		: Promise.resolve(undefined);
	const ownP = fondoP.then((fondoPercent) => getEventTickets(params.slug, { fondoPercent }));
	ownP.catch(() => {}); // si no se usa, que un error ahí no quede sin atender
	const { ticketSlug, part } = await doorScope(db, params.slug);
	const config =
		ticketSlug === params.slug
			? await ownP
			: await getEventTickets(ticketSlug, { fondoPercent: await fondoP });
	if (!config) error(404, 'Ese evento no vende entradas.');
	if (config.online) error(404, 'Es un evento online: no tiene control de ingreso.');
	/** @type {Record<string, string>} */
	const typeNames = Object.fromEntries(config.types.map((t) => [t.id, t.name]));
	return { db, config, typeNames, ticketSlug, part };
}

export const NO_STORE = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' };
