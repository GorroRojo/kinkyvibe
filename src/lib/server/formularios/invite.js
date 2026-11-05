/**
 * El link personal de un formulario para quienes tenían entrada (docs/formularios.md): la
 * dirección del formulario (o de la encuesta del evento) más una clave en el fragmento
 * (`…/encuesta#<orden>.<firma>`). El fragmento no viaja en el pedido de la página (no queda en
 * los registros del servidor ni en el Referer); la página lo lee en el navegador y lo manda con la
 * respuesta.
 *
 * La firma es HMAC con una clave al azar en D1 (signedLinks.js), así no se guarda ningún token.
 * Que sirva una vez lo marca `form_sends.used` (store.js, `saveResponse`).
 */
import { signLink, verifyLink } from '$lib/server/signedLinks.js';
import { isValidOrderId } from '$lib/server/tickets/orders.js';
import { formPath } from '$lib/utils/formularios.js';

export { formPath };

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Clave de `ticket_settings` que firma los links de los formularios (se crea sola). */
const FORM_LINK_KEY = 'form_link_key';

/**
 * @param {number} formId
 * @param {string} orderId
 */
const message = (formId, orderId) => `formulario:${formId}:${orderId}`;

/**
 * La clave del link de esta orden para este formulario: `<orden>.<firma>`.
 *
 * @param {D1Database} db
 * @param {number} formId
 * @param {string} orderId
 */
export async function inviteToken(db, formId, orderId) {
	return `${orderId}.${await signLink(db, FORM_LINK_KEY, message(formId, orderId))}`;
}

/**
 * La orden de la clave, o `null` si no es de este formulario.
 *
 * @param {D1Database} db
 * @param {number} formId
 * @param {unknown} token
 */
export async function checkInviteToken(db, formId, token) {
	if (typeof token !== 'string' || token.length > 200) return null;
	const dot = token.lastIndexOf('.');
	if (dot < 1) return null;
	const orderId = token.slice(0, dot);
	if (!isValidOrderId(orderId)) return null;
	return (await verifyLink(db, FORM_LINK_KEY, message(formId, orderId), token.slice(dot + 1)))
		? orderId
		: null;
}

/**
 * El link del mail: la dirección del formulario con la clave en el fragmento.
 *
 * @param {string} origin
 * @param {{ kind: string, slug: string, eventSlug: string | null }} form
 * @param {string} token
 */
export function inviteUrl(origin, form, token) {
	return `${origin}${formPath(form)}#${token}`;
}
