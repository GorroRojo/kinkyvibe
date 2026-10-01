/**
 * Tope global de mails de cuentas por hora: códigos (de ingreso y para confirmar) y avisos de
 * invitación, sumados entre todas las conexiones y todos los mails. Los límites por conexión y
 * por mail no alcanzan solos (alguien con muchas conexiones podría mandar mails a muchas
 * direcciones), y estos mails salen por el mismo camino y la misma cuenta de Resend que los de
 * las entradas: así nunca se comen ese cupo.
 *
 * Va en un archivo aparte porque lo usan index.js (códigos) y perfiles.js (avisos), y index.js
 * ya importa perfiles.js.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

export const ACCOUNT_MAIL_CAP = Object.freeze({ limit: 300, windowSeconds: 60 * 60 });

/** La clave fija del tope (no lleva datos de nadie). */
const BUCKET = 'cuentas:mail:global';

/**
 * Cuenta un mail de cuentas que está por salir y dice si entra en el tope. Llamarla solo cuando
 * el mail ya pasó todos los otros límites (así los pedidos rechazados no gastan el tope).
 *
 * @param {D1Database} db
 * @param {number} [now]
 */
export async function accountMailAllowed(db, now = Date.now()) {
	return (await hitRateLimit(db, BUCKET, ACCOUNT_MAIL_CAP, now)).allowed;
}
