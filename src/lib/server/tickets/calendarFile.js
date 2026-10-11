/**
 * «Agregalo a tu calendario» en el mail con las entradas: el archivo `<slug>.ics` adjunto, el link
 * «Agregar a Google Calendar» y el marcado schema.org (`EventReservation`) que Gmail puede leer.
 * Los tres salen de los mismos datos ({@link calendarEvent}): las mismas horas en UTC, el mismo
 * lugar y la misma descripción.
 *
 * El .ics sale con `buildEventIcs` de $lib/utils/icsFeed.js (el mismo UID que los calendarios del
 * sitio, así no se duplica si la persona además está suscripta).
 *
 * Qué lleva: título, inicio y fin, el link a la página del evento y el estado. En un evento
 * presencial, el lugar tal como lo dice el mail (quien compró recibe la dirección completa). En un
 * evento online con el link de la transmisión ya cargado al mandar el mail, ese link (es el mismo
 * para todes les que compraron; pedido de gorrite) con «Si el link cambia, te llega por mail.»; sin
 * link todavía, «Online» y que el link llega por mail. Todo esto va SOLO en el mail de quien
 * compró: el link de la transmisión nunca entra a un calendario ni a una página pública.
 */
import { buildEventIcs } from '$lib/utils/icsFeed.js';
import { salePlaceText } from '$lib/utils/eventPlace.js';
import { eventEnd } from '$lib/utils/dates.js';

/** Lo que dice el .ics de un evento online que todavía no tiene el link de la transmisión. */
export const ONLINE_ICS_NOTE =
	'Es un evento online: el link de la transmisión te llega por mail y está en la página de tu entrada.';

/** La línea que acompaña al link de la transmisión en el calendario. */
export const STREAM_CHANGE_NOTE = 'Si el link cambia, te llega por mail.';

/** El tipo del adjunto: `.ics` de publicación (no una invitación con RSVP). */
export const ICS_CONTENT_TYPE = 'text/calendar; method=PUBLISH; charset=UTF-8';

/**
 * @typedef {{ filename: string, content: string, contentType: string }} CalendarFile
 */

/**
 * Lo que el mail sabe del evento.
 * @typedef {{
 *   slug: string,
 *   title: string,
 *   start?: string,
 *   end?: string | null,
 *   status?: string,
 *   online?: boolean,
 *   streamLink?: string | null,
 *   location?: string,
 *   location_name?: string,
 *   origin: string
 * }} MailEvent
 */

/**
 * Los datos comunes del .ics, el link de Google Calendar y el marcado de Gmail, o `null` si el
 * evento no tiene una fecha válida.
 *
 * @param {MailEvent} event
 */
export function calendarEvent(event) {
	if (!event.start) return null;
	const start = new Date(event.start);
	if (Number.isNaN(start.getTime())) return null;
	const end = eventEnd(event.start, event.end ?? undefined);
	const online = Boolean(event.online);
	const page = `${event.origin}/calendario/${event.slug}`;
	const stream = online && event.streamLink ? event.streamLink : null;
	return {
		start,
		end,
		online,
		page,
		stream,
		/** Lo que va como lugar: el link de la transmisión, «Online» o el lugar del mail. */
		location: stream ?? (salePlaceText(online, event) || undefined),
		/** La nota de la descripción (sin el link a la página, que se suma después). */
		note: stream
			? `Link de la transmisión: ${stream}\n${STREAM_CHANGE_NOTE}`
			: online
				? ONLINE_ICS_NOTE
				: undefined
	};
}

/**
 * El .ics del evento de una compra, o `null` si el evento no tiene fecha válida.
 *
 * @param {MailEvent} event
 * @returns {CalendarFile | null}
 */
export function ticketCalendarFile(event) {
	const cal = calendarEvent(event);
	if (!cal) return null;
	const content = buildEventIcs({
		slug: event.slug,
		title: event.title,
		start: event.start,
		end: event.end,
		status: event.status,
		origin: event.origin,
		location: cal.location,
		description: cal.note
	});
	if (!content) return null;
	return {
		// El slug ya es seguro para un nombre de archivo (isValidEventSlug: letras, números, - y _).
		filename: `${event.slug}.ics`,
		content,
		contentType: ICS_CONTENT_TYPE
	};
}

/**
 * Una fecha en UTC como la piden Google Calendar (`YYYYMMDDTHHMMSSZ`). Al minuto, como el .ics.
 * @param {Date} d
 */
function googleDate(d) {
	const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
}

/**
 * El link «Agregar a Google Calendar» (formulario de evento nuevo prellenado), o `null` sin fecha.
 *
 * @param {MailEvent} event
 */
export function googleCalendarUrl(event) {
	const cal = calendarEvent(event);
	if (!cal) return null;
	const params = new URLSearchParams({
		action: 'TEMPLATE',
		text: event.title,
		dates: `${googleDate(cal.start)}/${googleDate(cal.end)}`,
		details: cal.note ? `${cal.note}\n\n${cal.page}` : cal.page
	});
	if (cal.location) params.set('location', cal.location);
	return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * Una fecha en hora argentina con su desplazamiento (`2026-11-14T22:00:00-03:00`).
 * @param {Date} d
 */
function argIso(d) {
	const s = new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 19);
	return `${s}-03:00`;
}

/**
 * El marcado schema.org `EventReservation` (JSON-LD) para Gmail, o `null` sin fecha. Solo el
 * nombre de quien compró (nada de mail, DNI ni tokens). El JSON va escapado: un `<` dentro de un
 * texto sale como `<`, así nada puede cerrar el `<script>`.
 *
 * Gmail lo muestra solo a remitentes registrados con Google (docs/mails.md).
 *
 * @param {{ orderId: string, buyerName: string, event: MailEvent }} input
 * @returns {string | null} el `<script type="application/ld+json">` entero
 */
export function eventReservationScript({ orderId, buyerName, event }) {
	const cal = calendarEvent(event);
	if (!cal) return null;
	/** @type {Record<string, unknown> | undefined} */
	let location;
	if (cal.online) {
		location = { '@type': 'VirtualLocation', url: cal.stream ?? cal.page };
	} else {
		const name = event.location_name || event.location;
		if (name) {
			location = {
				'@type': 'Place',
				name,
				...(event.location
					? {
							address: {
								'@type': 'PostalAddress',
								streetAddress: event.location,
								addressCountry: 'AR'
							}
						}
					: {})
			};
		}
	}
	const data = {
		'@context': 'http://schema.org',
		'@type': 'EventReservation',
		reservationNumber: orderId,
		reservationStatus: 'http://schema.org/Confirmed',
		underName: { '@type': 'Person', name: buyerName },
		reservationFor: {
			'@type': 'Event',
			name: event.title,
			startDate: argIso(cal.start),
			endDate: argIso(cal.end),
			url: cal.page,
			...(location ? { location } : {})
		}
	};
	const json = JSON.stringify(data).replaceAll('<', '\\u003c');
	return `<script type="application/ld+json">${json}</script>`;
}

/**
 * Un adjunto como lo pide la API de Resend (`attachments`: contenido en base64 y `content_type`
 * explícito; sin él, Resend lo deduce del nombre del archivo).
 *
 * @param {CalendarFile} file
 * @returns {{ filename: string, content: string, content_type: string }}
 */
export function resendAttachment(file) {
	const bytes = new TextEncoder().encode(file.content);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return { filename: file.filename, content: btoa(binary), content_type: file.contentType };
}
