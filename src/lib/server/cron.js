/**
 * Secreto compartido de los endpoints que llama el Worker de cron (workers/cron/).
 */
import { timingSafeEqual } from '$lib/server/tickets/mercadopago.js';

/** @param {string} s */
async function sha256(s) {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

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
	return timingSafeEqual(await sha256(given), await sha256(expected));
}
