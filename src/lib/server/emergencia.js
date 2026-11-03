/**
 * Pausas de emergencia (docs/interruptores.md, «Pausas de emergencia»). No son interruptores de
 * la base: son dos variables del Worker que se cargan en el panel de Cloudflare (Workers →
 * kinkyvibe → Settings → Variables and Secrets), así se cortan aunque la base o el panel anden
 * mal. Vacías, ausentes o `0`: apagadas.
 *
 * - `TICKETS_PAUSED`: el texto que ven les compradores («Volvemos en un rato»). Prendida, la página
 *   del evento y la de compra muestran ese texto en lugar de los botones, y `?/buy` no crea
 *   ninguna orden (Mercado Pago, transferencia ni gratis). La puerta, la carga a mano, los webhooks
 *   de Mercado Pago (una orden ya creada se aprueba cuando llega su pago), los reembolsos y salir
 *   de la lista de espera siguen como siempre. Con `1`, un texto por defecto.
 * - `MAILS_PAUSED`: frena los mails en tanda (recordatorios, «Enviar el link a todes», «Avisar a
 *   les compradores», «Mail a compradores», series, «Lo que sigo» y la lista de espera). No se
 *   pierden: quedan pendientes y salen solos cuando se saca la variable (salvo lo que vence antes,
 *   ver la guía). Los mails de cada compra (entradas, transferencia, reembolso, códigos para
 *   ingresar, confirmaciones) salen siempre. El texto, si lo hay, es solo una nota para el panel.
 *
 * Se leen en cada pedido (`$env/dynamic/private`): cambiar la variable publica una versión nueva
 * del Worker y vale enseguida (la página pública guardada en la caché de 1 minuto, hasta 1 minuto
 * después).
 */
import { env } from '$env/dynamic/private';

/** Lo que ven les compradores si `TICKETS_PAUSED` es `1` (sin texto propio). */
export const DEFAULT_TICKETS_PAUSED_MESSAGE =
	'La venta de entradas está en pausa por un rato. Probá de nuevo más tarde.';

/** Largo máximo del texto de una pausa (lo que pase de acá no se muestra). */
export const MAX_PAUSE_TEXT = 300;

/**
 * El texto de una variable de pausa, o `null` si está apagada (vacía, ausente o `0`).
 *
 * @param {string | undefined | null} raw
 * @returns {string | null}
 */
export function pauseText(raw) {
	const text = String(raw ?? '')
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f\u007f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!text || text === '0') return null;
	return text.slice(0, MAX_PAUSE_TEXT);
}

/**
 * ¿Está pausada la venta online? El texto para les compradores, o `null`.
 *
 * @param {Record<string, string | undefined>} [source] las variables (por defecto, las del Worker)
 * @returns {string | null}
 */
export function ticketsPausedMessage(source = env) {
	const text = pauseText(source.TICKETS_PAUSED);
	if (text === null) return null;
	return text === '1' ? DEFAULT_TICKETS_PAUSED_MESSAGE : text;
}

/**
 * ¿Están pausados los mails en tanda? La nota de la variable (o `1`), o `null`.
 *
 * @param {Record<string, string | undefined>} [source]
 * @returns {string | null}
 */
export function mailsPausedNote(source = env) {
	return pauseText(source.MAILS_PAUSED);
}

/**
 * ¿Están pausados los mails en tanda?
 *
 * @param {Record<string, string | undefined>} [source]
 */
export function mailsPaused(source = env) {
	return mailsPausedNote(source) !== null;
}

/**
 * Las dos pausas, para el panel.
 *
 * @param {Record<string, string | undefined>} [source]
 * @returns {{ tickets: string | null, mails: string | null }}
 */
export function emergencyPauses(source = env) {
	return { tickets: ticketsPausedMessage(source), mails: mailsPausedNote(source) };
}

/** Lo que ve le admin cuando un envío en tanda no sale por `MAILS_PAUSED`. */
export const MAILS_PAUSED_ADMIN_MESSAGE =
	'Los mails en tanda están en pausa (MAILS_PAUSED, en el panel de Cloudflare): no se mandó nada.';

/**
 * Una línea en el log cuando algo no sale por `MAILS_PAUSED` (nunca mails ni datos de nadie).
 *
 * @param {string} what qué no salió
 */
export function logMailsPaused(what) {
	console.log(`[pausa] MAILS_PAUSED: no se mandó ${what}; queda para cuando se saque la pausa.`);
}
