/**
 * "De a cuántos": cuántos mails manda como mucho cada corrida del cron (recordatorios y lo que
 * quede de "Enviar el link a todes") y cada toque de ese botón. Cada mail es un pedido a Resend y
 * un Worker tiene límites por pedido: en tandas, un evento grande no corta el envío a la mitad.
 * Se edita en Ajustes → Mails (`ticket_settings`, clave `mail_batch_size`; vacío = el de por
 * defecto).
 */

export const DEFAULT_MAIL_BATCH_SIZE = 40;
export const MIN_MAIL_BATCH_SIZE = 5;
export const MAX_MAIL_BATCH_SIZE = 200;

/**
 * Valor del formulario → número válido, `''` (vacío: el de por defecto) o `null` (inválido).
 *
 * @param {string} raw
 * @returns {number | '' | null}
 */
export function parseMailBatchSize(raw) {
	const s = raw.trim();
	if (!s) return '';
	if (!/^\d{1,4}$/.test(s)) return null;
	const n = Number(s);
	return n >= MIN_MAIL_BATCH_SIZE && n <= MAX_MAIL_BATCH_SIZE ? n : null;
}

/**
 * El guardado en los ajustes → el que se usa (vacío o roto = el de por defecto).
 *
 * @param {string | null | undefined} stored
 */
export function mailBatchSize(stored) {
	const n = parseMailBatchSize(String(stored ?? ''));
	return typeof n === 'number' ? n : DEFAULT_MAIL_BATCH_SIZE;
}
