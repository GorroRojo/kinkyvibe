/**
 * Secreto compartido de los endpoints que llama el Worker de cron (workers/cron/).
 */
import { sha256Hex } from '$lib/server/hash.js';
import { timingSafeEqual } from '$lib/server/tickets/mercadopago.js';

/** Largo mínimo de CRON_SECRET (más corto se considera no configurado). */
export const MIN_CRON_SECRET_LENGTH = 16;

/**
 * ¿El header coincide con CRON_SECRET? En tiempo constante, sobre los SHA-256 (así tampoco se
 * filtra el largo). Sin secreto configurado (o muy corto), siempre `false`.
 *
 * @param {string | null | undefined} given
 * @param {string | undefined} expected
 */
export async function isValidCronSecret(given, expected) {
	if (!expected || expected.length < MIN_CRON_SECRET_LENGTH || !given) return false;
	return timingSafeEqual(await sha256Hex(given), await sha256Hex(expected));
}
