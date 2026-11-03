/**
 * Tope diario de subidas a la biblioteca para las cuentas del público (docs/imagenes.md, «Quién
 * puede»): cuántas imágenes y cuántos megabytes por cuenta en las últimas 24 horas (tabla
 * `rate_limits`, ventana móvil). Les admins no tienen tope.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

const DAY = 24 * 60 * 60;

export const UPLOAD_CAPS = Object.freeze({
	/** Subidas por cuenta por día (cuenta cada pedido, aunque después falle). */
	count: { limit: 30, windowSeconds: DAY },
	/** Megabytes por cuenta por día (la imagen y sus copias chicas, redondeado para arriba). */
	megabytes: { limit: 200, windowSeconds: DAY }
});

export const UPLOAD_CAP_MESSAGE =
	'Subiste muchas imágenes en las últimas horas. Probá de nuevo más tarde.';

const MB = 1024 * 1024;

/**
 * La clave del tope: el id de la cuenta hasheado (nunca datos identificables en `rate_limits`).
 * @param {string} accountId
 */
const accountKey = async (accountId) =>
	(await sha256Hex(`imagenes:subidas:${accountId}`)).slice(0, 32);

/**
 * Suma una subida al tope de la cuenta (antes de leer el cuerpo).
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} [now]
 */
export async function uploadCountAllowed(db, accountId, now = Date.now()) {
	const key = await accountKey(accountId);
	return (await hitRateLimit(db, `img:n:${key}`, UPLOAD_CAPS.count, now)).allowed;
}

/**
 * Suma los bytes de una subida al tope de la cuenta (después de leerlos, antes de guardarlos).
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} bytes
 * @param {number} [now]
 */
export async function uploadBytesAllowed(db, accountId, bytes, now = Date.now()) {
	const key = await accountKey(accountId);
	const cost = Math.max(1, Math.ceil(bytes / MB));
	return (await hitRateLimit(db, `img:mb:${key}`, UPLOAD_CAPS.megabytes, now, cost)).allowed;
}
