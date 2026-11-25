/**
 * El link personal de un formulario para quienes tenían entrada (docs/formularios.md): la
 * dirección del formulario (o de la encuesta del evento) más una clave en el fragmento
 * (`…/encuesta#<orden>.<firma>`). El fragmento no viaja en el pedido de la página (no queda en
 * los registros del servidor ni en el Referer); la página lo lee en el navegador y lo manda con la
 * respuesta.
 *
 * Un link por entrada: la entrada 1 usa la clave de siempre (`<orden>.<firma>`, mensaje
 * `formulario:<form>:<orden>`), así los links que ya salieron siguen andando y cuentan como la
 * entrada 1; la entrada n ≥ 2 usa `<orden>.<n>.<firma>` (mensaje `formulario:<form>:<orden>:<n>`).
 *
 * La firma es HMAC con una clave al azar en D1 (signedLinks.js), así no se guarda ningún token.
 * Que sirva una vez lo marca `form_sends.used` (entrada 1) o una fila de `form_ticket_uses`
 * (entrada n ≥ 2) (store.js, `saveResponse`).
 */
import { linkSigner, verifyLink } from '$lib/server/signedLinks.js';
import { isValidOrderId } from '$lib/server/tickets/orders.js';
import { formPath } from '$lib/utils/formularios.js';

export { formPath };

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Clave de `ticket_settings` que firma los links de los formularios (se crea sola). */
const FORM_LINK_KEY = 'form_link_key';

/** El número de entrada de una clave de 3 partes: entero ≥ 2, sin ceros adelante. */
const TICKET_NUMBER_RE = /^[1-9]\d{0,4}$/;

/**
 * @param {number} formId
 * @param {string} orderId
 * @param {number} ticket
 */
const message = (formId, orderId, ticket) =>
	ticket === 1 ? `formulario:${formId}:${orderId}` : `formulario:${formId}:${orderId}:${ticket}`;

/**
 * Un firmador de claves que lee la clave de D1 una sola vez (para el mail de una orden con varias
 * entradas o la lista del panel): `(formId, orderId, ticket = 1) => clave`.
 *
 * @param {D1Database} db
 * @returns {Promise<(formId: number, orderId: string, ticket?: number) => Promise<string>>}
 */
export async function inviteSigner(db) {
	const sign = await linkSigner(db, FORM_LINK_KEY);
	return async (formId, orderId, ticket = 1) => {
		if (!Number.isSafeInteger(ticket) || ticket < 1) throw new Error('entrada inválida');
		const sig = await sign(message(formId, orderId, ticket));
		return ticket === 1 ? `${orderId}.${sig}` : `${orderId}.${ticket}.${sig}`;
	};
}

/**
 * La clave del link de esta entrada de esta orden para este formulario: `<orden>.<firma>` (entrada
 * 1) o `<orden>.<n>.<firma>`.
 *
 * @param {D1Database} db
 * @param {number} formId
 * @param {string} orderId
 * @param {number} [ticket]
 */
export async function inviteToken(db, formId, orderId, ticket = 1) {
	return (await inviteSigner(db))(formId, orderId, ticket);
}

/**
 * La orden y el número de entrada de la clave, o `null` si no es de este formulario.
 *
 * @param {D1Database} db
 * @param {number} formId
 * @param {unknown} token
 * @returns {Promise<{ orderId: string, ticket: number } | null>}
 */
export async function checkInviteToken(db, formId, token) {
	if (typeof token !== 'string' || token.length > 200) return null;
	const parts = token.split('.');
	let ticket = 1;
	if (parts.length === 3) {
		if (!TICKET_NUMBER_RE.test(parts[1])) return null;
		ticket = Number(parts[1]);
		if (ticket < 2) return null;
	} else if (parts.length !== 2) return null;
	const orderId = parts[0];
	if (!isValidOrderId(orderId)) return null;
	return (await verifyLink(db, FORM_LINK_KEY, message(formId, orderId, ticket), parts.at(-1)))
		? { orderId, ticket }
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
