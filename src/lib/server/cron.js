/**
 * Secreto compartido de los endpoints de cron (`/api/cron/*`): los llama el cron del propio
 * Worker (src/lib/server/scheduled.js) y, mientras el sitio siga en Pages, workers/cron/.
 */
import { sha256Hex, timingSafeEqual } from '$lib/server/hash.js';

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
