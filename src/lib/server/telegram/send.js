/**
 * Mandar un mensaje por el bot de Telegram desde el cron (decisión 0029, fase 2). Es lo único
 * que llama a la API de Telegram: el webhook contesta en el mismo pedido y no la necesita.
 *
 * Usa el secret `TELEGRAM_BOT_TOKEN` (Cloudflare, nunca en el repo). Sin él, `telegramSender`
 * devuelve `null` y los avisos por Telegram se saltean con una línea en el log.
 */

/** @typedef {(chatId: string, text: string) => Promise<'sent' | 'failed' | 'blocked'>} TelegramSend */

const API = 'https://api.telegram.org';

/**
 * Un `sendMessage` (HTML de Telegram, sin vista previa de links).
 *
 * - `sent`: salió.
 * - `blocked`: Telegram dice que el chat ya no recibe (403: bloqueó al bot o borró el chat).
 * - `failed`: cualquier otra cosa (se reintenta en la próxima corrida).
 *
 * El token va en la URL (así lo pide Telegram): nunca se loguea la URL ni la respuesta entera.
 *
 * @param {{ token: string, chatId: string, text: string, fetch?: typeof fetch }} input
 * @returns {Promise<'sent' | 'failed' | 'blocked'>}
 */
export async function sendTelegramMessage({ token, chatId, text, fetch: fetchFn = fetch }) {
	try {
		const res = await fetchFn(`${API}/bot${token}/sendMessage`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				chat_id: chatId,
				text,
				parse_mode: 'HTML',
				link_preview_options: { is_disabled: true }
			})
		});
		if (res.ok) return 'sent';
		if (res.status === 403) return 'blocked';
		console.error(`[telegram] sendMessage respondió ${res.status}`);
		return 'failed';
	} catch (error) {
		console.error(
			'[telegram] no se pudo llamar a sendMessage:',
			/** @type {Error} */ (error)?.name
		);
		return 'failed';
	}
}

/**
 * El que manda, o `null` (con una línea en el log) si falta el token.
 *
 * @param {string | undefined} token
 * @param {typeof fetch} [fetchFn]
 * @returns {TelegramSend | null}
 */
export function telegramSender(token, fetchFn = fetch) {
	if (!token) {
		console.log('[telegram] falta TELEGRAM_BOT_TOKEN: no se mandan avisos por Telegram');
		return null;
	}
	return (chatId, text) => sendTelegramMessage({ token, chatId, text, fetch: fetchFn });
}
