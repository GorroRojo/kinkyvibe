/**
 * Qué updates le pide el bot a Telegram (`allowed_updates` de `setWebhook`, docs/telegram.md). Sin
 * dependencias: lo importa también `scripts/telegram-webhook.js`, que registra el webhook desde la
 * compu de gorrite.
 *
 * - `message`: comandos, la respuesta a «Buscar», `/start <código>`;
 * - `callback_query`: los botones de las pantallas;
 * - `inline_query`: el modo inline (`@<bot> <texto>` en cualquier chat, inline.js).
 *
 * Telegram recuerda la lista del último `setWebhook`: si se agrega un tipo acá, hay que volver a
 * registrar el webhook (`npm run telegram:webhook`).
 */
export const WEBHOOK_ALLOWED_UPDATES = Object.freeze(['message', 'callback_query', 'inline_query']);

/** La dirección del webhook en producción. */
export const WEBHOOK_URL = 'https://kinkyvibe.ar/api/telegram';

/**
 * El cuerpo de `setWebhook`.
 *
 * @param {{ url?: string, secret: string }} input
 */
export function setWebhookParams({ url = WEBHOOK_URL, secret }) {
	return { url, secret_token: secret, allowed_updates: [...WEBHOOK_ALLOWED_UPDATES] };
}
