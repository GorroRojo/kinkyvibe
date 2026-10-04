/**
 * Calendarios .ics del sitio, con el paquete `ics`. Una sola forma de pasar un evento a .ics para
 * todos los calendarios: el general (/calendario.ics, prerenderizado), el de una etiqueta o serie
 * y el personal ("lo tuyo"), estos dos detrás del interruptor `series` (src/routes/ics/).
 *
 * Sin Svelte ni SvelteKit: se prueba en vitest (icsFeed.test.js).
 */
import * as ics from 'ics';
import { eventEnd } from './dates.js';
import { escapeHtml } from './escape.js';
import { eventPlace } from './eventPlace.js';
import { venueLine } from './venues.js';

/** Origen de los links de los calendarios (los clientes de calendario no conocen el sitio). */
export const SITE_ORIGIN = 'https://kinkyvibe.ar';

/**
 * The HTML description of a calendar event (with the map link of a one-off place, if any).
 * @param {string} postPath absolute URL of the event page
 * @param {unknown} summary
 * @param {string} [mapUrl] `eventPlace(...).mapUrl`
 */
export function eventHtml(postPath, summary, mapUrl = '') {
	const link = escapeHtml(postPath);
	const map = mapUrl ? `<p><a href="${escapeHtml(mapUrl)}">${escapeHtml(MAP_LABEL)}</a></p>` : '';
	return `<!DOCTYPE html><html><body><p><a href="${link}">${link}</a></p><p>${escapeHtml(summary)}</p>${map}</body></html>`;
}

/** Texto del link al mapa (página y .ics). */
export const MAP_LABEL = 'Ver en el mapa';

/**
 * La descripción en texto de un evento: el link, el resumen y, si es un lugar de una sola vez con
 * link al mapa (sin lugar vinculado, que manda), «Ver en el mapa: <link>».
 * @param {string} postPath
 * @param {unknown} summary
 * @param {string} [mapUrl]
 */
export function eventDescription(postPath, summary, mapUrl = '') {
	return postPath + ' \n' + summary + (mapUrl ? `\n${MAP_LABEL}: ${mapUrl}` : '');
}

/**
 * Converts a string to an array representing the date and time.
 *
 * @param {string|Date} s - The string to convert.
 * @return {import('ics').DateArray} [year, month, day, hours, minutes].
 */
function stringToDateArray(s) {
	let d = new Date(s);
	return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
}

/**
 * La dirección que puede ir en un calendario, o `undefined`. Es el ÚNICO lugar por donde la
 * dirección entra a un .ics.
 *
 * Si el evento tiene lugar (#137, interruptor `perfiles_publicos`), manda la privacidad del lugar,
 * igual que en la página del evento: `venue` es lo que la página le muestra a cualquiera
 * (`publicVenueForEvent` con ANON, ver `feedVenues` en $lib/server/amigues/venues.js), y el
 * `location` del .md no se usa. Oculto → nada; "solo el barrio" → el barrio, si hay;
 * "Sólo dirección" → la dirección, el barrio y la ciudad, sin el nombre.
 * Sin lugar, la dirección en texto libre del .md, que es pública en la página del evento.
 *
 * @param {{ location?: unknown }} meta
 * @param {import('./venues.js').VenueView | null} [venue]
 * @returns {string | undefined}
 */
export function feedLocation(meta, venue) {
	if (venue) {
		if (venue.level === 'hidden') return undefined;
		if (venue.level === 'area')
			return [venue.area, venue.city].filter(Boolean).join(', ') || undefined;
		if (venue.level === 'address')
			return [venue.address, venue.area, venue.city].filter(Boolean).join(', ') || undefined;
		return venueLine(venue) || undefined;
	}
	const loc = typeof meta.location === 'string' ? meta.location.trim() : '';
	return loc || undefined;
}

/** Estado del evento → STATUS del .ics. */
const STATUS = /** @type {Record<string, import('ics').EventStatus>} */ ({
	abierto: 'CONFIRMED',
	cancelado: 'CANCELLED',
	anunciado: 'TENTATIVE',
	agotadas: 'CONFIRMED'
});

/**
 * @typedef {object} FeedOptions
 * @prop {string} [calName] nombre del calendario (X-WR-CALNAME)
 * @prop {string} [origin] origen de los links (SITE_ORIGIN)
 * @prop {readonly Pick<ProcessedPost, 'meta'>[]} [profiles] posts donde buscar el mail de quien
 *   organiza (los perfiles de amigues); por defecto, los mismos `posts`
 * @prop {boolean} [includeCancelled] incluir los cancelados como CANCELLED (por defecto se saltean,
 *   como el calendario general)
 * @prop {ReadonlyMap<string, import('./venues.js').VenueView>} [venues] el lugar de cada evento
 *   que tiene uno (por dirección), ya filtrado por su privacidad (ver `feedLocation`)
 */

/**
 * Los eventos de `posts` (los que no son de calendario se ignoran) como texto .ics.
 *
 * @param {readonly Pick<ProcessedPost, 'meta' | 'path'>[]} posts
 * @param {FeedOptions} [opts]
 * @returns {string}
 */
export function buildIcsFeed(posts, opts = {}) {
	const { calName = 'Kinky Vibe', origin = SITE_ORIGIN, includeCancelled = false } = opts;
	const profiles = opts.profiles ?? posts;
	/** @type {ics.EventAttributes[]} */
	const events = [];
	for (const post of posts) {
		if (post.meta.category != 'calendario') continue;
		if (post.meta.status == 'cancelado' && !includeCancelled) continue;
		// one event with a missing/invalid start would make createEvents() fail for the whole feed
		if (isNaN(new Date(post.meta.start).getTime())) continue;
		const organizer = post.meta.tags?.includes('KinkyVibe')
			? 'Kinky Vibe'
			: (post.meta.authors?.[0] ?? 'Kinky Vibe');
		const postPath = origin + post.path;
		const venue = opts.venues?.get(String(post.meta.postID));
		// El link al mapa del «Dónde» del .md, solo sin lugar vinculado (ver eventPlace.js).
		const { mapUrl } = eventPlace(post.meta, venue);
		/** @type {ics.EventAttributes} */
		const event = {
			// stable UID so subscribed calendars update events instead of re-creating them
			uid: post.meta.postID + '@kinkyvibe.ar',
			start: stringToDateArray(post.meta.start),
			end: stringToDateArray(eventEnd(post.meta.start, post.meta.end)),
			title: post.meta.title,
			url: postPath,
			description: eventDescription(postPath, post.meta.summary, mapUrl),
			htmlContent: eventHtml(postPath, post.meta.summary, mapUrl),
			location: feedLocation(post.meta, venue) ?? postPath,
			calName,
			organizer: {
				name: organizer,
				email:
					profiles.find((p) => p.meta.postID == organizer)?.meta?.email ?? 'kinkyvibe@gmail.com'
			},
			status: STATUS[post.meta.status] ?? 'CONFIRMED'
		};
		events.push(event);
	}
	if (!events.length) return emptyCalendar(calName);
	const { value, error } = ics.createEvents(events);
	if (error) console.error('[ics] no se pudo armar el calendario:', error);
	return value ?? emptyCalendar(calName);
}

/**
 * Un calendario sin eventos (el paquete `ics` no arma uno vacío). Válido para los clientes de
 * calendario: se suscriben igual y se llena cuando haya eventos.
 *
 * @param {string} calName
 */
function emptyCalendar(calName) {
	const name = calName.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\r?\n/g, ' ');
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'CALSCALE:GREGORIAN',
		'PRODID:kinkyvibe.ar',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${name}`,
		'X-PUBLISHED-TTL:PT1H',
		'END:VCALENDAR',
		''
	].join('\r\n');
}

/**
 * Respuesta HTTP de un calendario.
 *
 * @param {string} body
 * @param {{ private?: boolean, filename?: string }} [opts] `private`: no lo guarda ninguna caché
 *   compartida (calendarios personales)
 */
export function icsResponse(body, opts = {}) {
	/** @type {Record<string, string>} */
	const headers = { 'Content-Type': 'text/calendar; charset=utf-8' };
	if (opts.private) {
		headers['cache-control'] = 'private, no-store';
		headers['x-robots-tag'] = 'noindex';
		headers['referrer-policy'] = 'no-referrer';
	} else headers['cache-control'] = 'public, max-age=900';
	if (opts.filename) headers['content-disposition'] = `inline; filename="${opts.filename}"`;
	return new Response(body, { headers });
}
