/**
 * Qué updates le pide el bot a Telegram (`allowed_updates` de `setWebhook`, docs/telegram.md). Sin
 * dependencias (solo la dirección del sitio, relativa): lo importa también `scripts/telegram-webhook.js`, que registra el webhook desde la
 * compu de gorrite.
 *
 * - `message`: comandos, la respuesta a «Buscar», `/start <código>`;
 * - `callback_query`: los botones de las pantallas;
 * - `inline_query`: el modo inline (`@<bot> <texto>` en cualquier chat, inline.js);
 * - `chosen_inline_result`: qué resultado inline se mandó, solo para las estadísticas de uso
 *   (uso.js). Telegram lo manda solo con «inline feedback» prendido en @BotFather
 *   (`/setinlinefeedback`); el bot no contesta nada.
 *
 * Telegram recuerda la lista del último `setWebhook`: si se agrega un tipo acá, hay que volver a
 * registrar el webhook (`npm run telegram:webhook`).
 */
import { SITE_URL } from '../../utils/site.js';

export const WEBHOOK_ALLOWED_UPDATES = Object.freeze([
	'message',
	'callback_query',
	'inline_query',
	'chosen_inline_result'
]);

/** La dirección del webhook en producción. */
export const WEBHOOK_URL = `${SITE_URL}/api/telegram`;

/**
 * El cuerpo de `setWebhook`.
 *
 * @param {{ url?: string, secret: string }} input
 */
export function setWebhookParams({ url = WEBHOOK_URL, secret }) {
	return { url, secret_token: secret, allowed_updates: [...WEBHOOK_ALLOWED_UPDATES] };
}
