/**
 * El archivo `<slug>.ics` que va adjunto al mail con las entradas («Agregalo a tu calendario»).
 * El evento sale con `buildEventIcs` de $lib/utils/icsFeed.js (el mismo UID que los calendarios
 * del sitio, así no se duplica si la persona además está suscripta).
 *
 * Qué lleva: título, inicio y fin, el link a la página del evento y el estado. En un evento
 * presencial, el lugar tal como lo dice el mail (quien compró recibe la dirección completa). En un
 * evento online, «Online» y NUNCA el link de la transmisión: es personal, puede cambiar después
 * (se manda de nuevo con «Enviar el link a todes») y los calendarios se comparten o sincronizan
 * con otras cuentas. El link sigue llegando por mail y está en la página de cada entrada.
 */
import { buildEventIcs } from '$lib/utils/icsFeed.js';
import { salePlaceText } from '$lib/utils/eventPlace.js';

/** Lo que dice el .ics de un evento online en lugar del link de la transmisión. */
export const ONLINE_ICS_NOTE =
	'Es un evento online: el link de la transmisión te llega por mail y está en la página de tu entrada.';

/**
 * @typedef {{ filename: string, content: string, contentType: string }} CalendarFile
 */

/**
 * El .ics del evento de una compra, o `null` si el evento no tiene fecha válida.
 *
 * @param {{
 *   slug: string,
 *   title: string,
 *   start?: string,
 *   end?: string | null,
 *   status?: string,
 *   online?: boolean,
 *   location?: string,
 *   location_name?: string,
 *   origin: string
 * }} event
 * @returns {CalendarFile | null}
 */
export function ticketCalendarFile(event) {
	const online = Boolean(event.online);
	const content = buildEventIcs({
		slug: event.slug,
		title: event.title,
		start: event.start,
		end: event.end,
		status: event.status,
		origin: event.origin,
		location: salePlaceText(online, event) || undefined,
		description: online ? ONLINE_ICS_NOTE : undefined
	});
	if (!content) return null;
	return {
		// El slug ya es seguro para un nombre de archivo (isValidEventSlug: letras, números, - y _).
		filename: `${event.slug}.ics`,
		content,
		contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
	};
}

/**
 * Un adjunto como lo pide la API de Resend (`attachments`: contenido en base64).
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
