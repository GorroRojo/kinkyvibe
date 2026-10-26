/**
 * Calendarios .ics del sitio, con el paquete `ics`. Una sola forma de pasar un evento a .ics para
 * todos los calendarios: el general (/calendario.ics, prerenderizado), el de una etiqueta o serie
 * y el personal ("lo tuyo") (src/routes/ics/).
 *
 * Sin Svelte ni SvelteKit: se prueba en vitest (icsFeed.test.js).
 */
import * as ics from 'ics';
import { eventEnd, parseSiteDate } from './dates.js';
import { escapeHtml } from './escape.js';
import { MAP_LABEL, eventPlace } from './eventPlace.js';
import { venueLine } from './venues.js';
import { SITE_URL } from './site.js';
import { DEFAULT_CONTACT_EMAIL } from './tickets.js';

/** Origen de los links de los calendarios (los clientes de calendario no conocen el sitio). */
export const SITE_ORIGIN = SITE_URL;

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

// El texto del link al mapa vive en eventPlace.js (la página lo usa sin bajar el paquete `ics`).
export { MAP_LABEL };

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
 * Si el evento tiene lugar (#137), manda la privacidad del lugar,
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

/**
 * El UID de un evento en cualquier .ics del sitio (los calendarios y el adjunto del mail de las
 * entradas): el mismo siempre, así un calendario actualiza el evento en lugar de duplicarlo.
 * @param {unknown} slug el `postID` del evento
 */
export const eventUid = (slug) => `${slug}@kinkyvibe.ar`;

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
 * @prop {number} [since] ms: saltear los eventos que terminaron antes (los calendarios públicos
 *   usan {@link publicIcsSince}); sin esto, van todos
 */

/** Cuántos días de eventos pasados llevan los calendarios públicos (docs/seo.md). */
export const PUBLIC_ICS_PAST_DAYS = 90;

/**
 * Desde cuándo van los eventos en un calendario público: los últimos {@link PUBLIC_ICS_PAST_DAYS}
 * días (los más viejos hacían pesado el archivo que cada calendario suscripto baja cada hora). Un
 * calendario suscripto copia el archivo: los más viejos dejan de verse ahí, no en el sitio.
 * @param {number} [now]
 */
export const publicIcsSince = (now = Date.now()) =>
	now - PUBLIC_ICS_PAST_DAYS * 24 * 60 * 60 * 1000;

/**
 * Cada cuánto conviene volver a bajar el calendario. `X-PUBLISHED-TTL` (lo pone el paquete `ics`)
 * es de Outlook; `REFRESH-INTERVAL` es el estándar (RFC 7986), que leen Apple y otros.
 */
const REFRESH_INTERVAL = 'REFRESH-INTERVAL;VALUE=DURATION:PT1H';

/** @param {string} text un VCALENDAR con `X-PUBLISHED-TTL` */
const withRefreshInterval = (text) =>
	text.replace(/^X-PUBLISHED-TTL:PT1H\r\n/m, (line) => `${line}${REFRESH_INTERVAL}\r\n`);

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
		if (isNaN(parseSiteDate(post.meta.start).getTime())) continue;
		if (opts.since !== undefined && eventEnd(post.meta.start, post.meta.end).getTime() < opts.since)
			continue;
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
			uid: eventUid(post.meta.postID),
			start: stringToDateArray(post.meta.start),
			end: stringToDateArray(eventEnd(post.meta.start, post.meta.end)),
			title: post.meta.title,
			url: postPath,
			description: eventDescription(postPath, post.meta.summary, mapUrl),
			htmlContent: eventHtml(postPath, post.meta.summary, mapUrl),
			location: feedLocation(post.meta, venue) ?? postPath,
			calName,
			// El mail del perfil de amigues de quien organiza si lo tiene; si no (y en los de Kinky
			// Vibe), el contacto público de la organización (gorrite, 26/10).
			organizer: {
				name: organizer,
				email:
					profiles.find((p) => p.meta.postID == organizer)?.meta?.email ?? DEFAULT_CONTACT_EMAIL
			},
			status: STATUS[post.meta.status] ?? 'CONFIRMED'
		};
		events.push(event);
	}
	if (!events.length) return emptyCalendar(calName);
	const { value, error } = ics.createEvents(events);
	if (error) console.error('[ics] no se pudo armar el calendario:', error);
	return value ? withRefreshInterval(value) : emptyCalendar(calName);
}

/**
 * Un solo evento como .ics (para adjuntarlo a un mail; ver tickets/calendarFile.js). A diferencia
 * de {@link buildIcsFeed}, la dirección y la descripción las decide quien llama: el mail de las
 * entradas le da a quien compró lo mismo que ya dice el mail. Las horas van en UTC (`Z`), así
 * que da igual la zona horaria del servidor y la del celu de quien lo abre.
 *
 * `stamp` (ms): la versión del archivo. Va como DTSTAMP y, en minutos desde 1970, como SEQUENCE
 * (un archivo posterior con el mismo UID reemplaza al anterior en lugar de duplicarlo; ver
 * tickets/calendarFile.js). Sin él, DTSTAMP es ahora y no hay SEQUENCE.
 *
 * @param {{ slug: string, title: string, start: string | undefined, end?: string | null,
 *   location?: string, description?: string, status?: string, origin?: string,
 *   stamp?: number }} ev
 * @returns {string | null} `null` si el evento no tiene una fecha válida (o el paquete falla)
 */
export function buildEventIcs(ev) {
	if (!ev.start || isNaN(parseSiteDate(ev.start).getTime())) return null;
	const url = `${ev.origin ?? SITE_ORIGIN}/calendario/${ev.slug}`;
	const { value, error } = ics.createEvent({
		productId: 'kinkyvibe.ar',
		method: 'PUBLISH',
		uid: eventUid(ev.slug),
		start: utcDateArray(ev.start),
		startInputType: 'utc',
		startOutputType: 'utc',
		end: utcDateArray(eventEnd(ev.start, ev.end ?? undefined)),
		endInputType: 'utc',
		endOutputType: 'utc',
		title: ev.title,
		url,
		description: ev.description ? `${ev.description}\n\n${url}` : url,
		location: ev.location || undefined,
		status: STATUS[ev.status ?? ''] ?? 'CONFIRMED',
		...(ev.stamp === undefined ? {} : { timestamp: ev.stamp, sequence: calendarSequence(ev.stamp) })
	});
	if (error || !value) {
		console.error('[ics] no se pudo armar el evento:', error);
		return null;
	}
	return value;
}

/**
 * El SEQUENCE de un .ics con versión `stamp` (ms): minutos desde 1970. Crece solo, sin guardar
 * nada en la base (un entero de 32 bits alcanza por miles de años).
 * @param {number} stamp
 */
export function calendarSequence(stamp) {
	return Math.floor(stamp / 60_000);
}

/**
 * Una fecha como [año, mes, día, hora, minutos] en UTC.
 * @param {string | Date} s
 * @returns {import('ics').DateArray}
 */
function utcDateArray(s) {
	const d = new Date(s);
	return [
		d.getUTCFullYear(),
		d.getUTCMonth() + 1,
		d.getUTCDate(),
		d.getUTCHours(),
		d.getUTCMinutes()
	];
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
		REFRESH_INTERVAL,
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
