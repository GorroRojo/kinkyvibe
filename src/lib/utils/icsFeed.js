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
 * La dirección que puede ir en un calendario, o `undefined`.
 *
 * Hoy los eventos tienen la dirección en texto libre (`location`) y es pública en la página del
 * evento, así que va igual que siempre.
 * TODO(#137, privacidad de lugares): cuando los lugares tengan niveles de privacidad, devolver
 * `undefined` (o solo el barrio) si la dirección del lugar está oculta, y usar esto también en la
 * página del evento. Es el ÚNICO lugar por donde la dirección entra a un .ics.
 *
 * @param {{ location?: unknown }} meta
 * @returns {string | undefined}
 */
export function feedLocation(meta) {
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
			location: feedLocation(post.meta) ?? postPath,
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
