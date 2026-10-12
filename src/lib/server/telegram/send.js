/**
 * Llamar a la API de Telegram (decisión 0029). Es lo único que la llama. La usan el cron de la fase 2
 * (`sendMessage`, para los avisos), el registro de comandos (`setMyCommands`, en commands.js) y,
 * con el token cargado, el webhook (run.js: editar pantallas, fotos, contestar botones; decisión
 * 0034).
 *
 * Usa el secret `TELEGRAM_BOT_TOKEN` (Cloudflare, nunca en el repo). Sin él, `telegramSender`
 * devuelve `null` y los avisos por Telegram se saltean con una línea en el log.
 */

/** @typedef {(chatId: string, text: string) => Promise<'sent' | 'failed' | 'blocked'>} TelegramSend */

const API = 'https://api.telegram.org';

/**
 * Saca el token de un texto (por si Telegram o un error de red lo repiten).
 *
 * @param {string} text
 * @param {string} token
 */
const scrub = (text, token) => (token ? text.split(token).join('…') : text);

/**
 * Un archivo para subir (una foto armada en el servidor, como el QR de una entrada de «Mis
 * entradas»). Va como valor de un campo del método (`photo`, o el nombre de `attach://<nombre>`).
 *
 * @typedef {{ upload: Uint8Array, filename: string, type: string }} BotUpload
 */

/** @param {unknown} v @returns {v is BotUpload} */
export const isUpload = (v) =>
	typeof v === 'object' && v !== null && /** @type {any} */ (v).upload instanceof Uint8Array;

/**
 * El cuerpo del pedido: JSON o, si algún campo es un archivo ({@link BotUpload}),
 * `multipart/form-data` (los objetos van como JSON, como pide Telegram).
 *
 * @param {unknown} body
 * @returns {{ headers?: Record<string, string>, body: string | FormData }}
 */
function requestBody(body) {
	const entries = body && typeof body === 'object' ? Object.entries(body) : [];
	if (!entries.some(([, v]) => isUpload(v))) {
		return { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
	}
	const form = new FormData();
	for (const [key, value] of entries) {
		if (value === undefined) continue;
		if (isUpload(value)) {
			form.append(key, new Blob([value.upload], { type: value.type }), value.filename);
		} else {
			form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
		}
	}
	// Sin content-type: fetch pone el de multipart con su separador.
	return { body: form };
}

/**
 * Un método cualquiera de la API (POST con JSON, o multipart si sube un archivo). Devuelve si
 * anduvo y, si no, un error corto para mostrar: el código HTTP y la `description` de Telegram,
 * **sin el token**. El token va en la URL (así lo pide Telegram): nunca se loguea ni se devuelve
 * la URL.
 *
 * @param {{ token: string, method: string, body: unknown, fetch?: typeof fetch }} input
 * @returns {Promise<{ ok: true, status: number } | { ok: false, status: number | null, error: string, description?: string }>}
 */
export async function callTelegramApi({ token, method, body, fetch: fetchFn = fetch }) {
	let res;
	try {
		res = await fetchFn(`${API}/bot${token}/${method}`, {
			method: 'POST',
			...requestBody(body)
		});
	} catch (error) {
		const name = scrub(String(/** @type {Error} */ (error)?.name ?? 'Error'), token).slice(0, 60);
		console.error(`[telegram] no se pudo llamar a ${method}:`, name);
		return { ok: false, status: null, error: `No se pudo conectar con Telegram (${name}).` };
	}
	/** @type {any} */
	let data = null;
	try {
		data = await res.json();
	} catch {
		// Sin JSON: queda el código HTTP.
	}
	if (res.ok && data?.ok !== false) return { ok: true, status: res.status };
	const description =
		typeof data?.description === 'string' ? scrub(data.description, token).slice(0, 200) : '';
	console.error(`[telegram] ${method} respondió ${res.status}`);
	return {
		ok: false,
		status: res.status,
		error: `Telegram respondió ${res.status}${description ? `: ${description}` : ''}.`,
		description
	};
}

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
