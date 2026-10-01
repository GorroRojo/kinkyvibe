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
import { venueLine } from './venues.js';

/** Origen de los links de los calendarios (los clientes de calendario no conocen el sitio). */
export const SITE_ORIGIN = 'https://kinkyvibe.ar';

/**
 * The HTML description of a calendar event.
 * @param {string} postPath absolute URL of the event page
 * @param {unknown} summary
 */
export function eventHtml(postPath, summary) {
	const link = escapeHtml(postPath);
	return `<!DOCTYPE html><html><body><p><a href="${link}">${link}</a></p><p>${escapeHtml(summary)}</p></body></html>`;
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
 * `location` del .md no se usa. Oculto → nada; "solo el barrio" → el barrio, si hay.
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
	const { calName = 'KinkyVibe', origin = SITE_ORIGIN, includeCancelled = false } = opts;
	const profiles = opts.profiles ?? posts;
	/** @type {ics.EventAttributes[]} */
	const events = [];
	for (const post of posts) {
		if (post.meta.category != 'calendario') continue;
		if (post.meta.status == 'cancelado' && !includeCancelled) continue;
		// one event with a missing/invalid start would make createEvents() fail for the whole feed
		if (isNaN(new Date(post.meta.start).getTime())) continue;
		const organizer = post.meta.tags?.includes('KinkyVibe')
			? 'KinkyVibe'
			: (post.meta.authors?.[0] ?? 'KinkyVibe');
		const postPath = origin + post.path;
		/** @type {ics.EventAttributes} */
		const event = {
			// stable UID so subscribed calendars update events instead of re-creating them
			uid: post.meta.postID + '@kinkyvibe.ar',
			start: stringToDateArray(post.meta.start),
			end: stringToDateArray(eventEnd(post.meta.start, post.meta.end)),
			title: post.meta.title,
			url: postPath,
			description: postPath + ' \n' + post.meta.summary,
			htmlContent: eventHtml(postPath, post.meta.summary),
			location: feedLocation(post.meta, opts.venues?.get(String(post.meta.postID))) ?? postPath,
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
