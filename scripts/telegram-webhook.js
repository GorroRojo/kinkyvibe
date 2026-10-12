#!/usr/bin/env node
/**
 * Registra el webhook del bot de Telegram (docs/telegram.md, «Puesta en marcha» y «Modo inline»):
 * `setWebhook` con la dirección, el secreto y los `allowed_updates` del código
 * (src/lib/server/telegram/updates.js, que incluye `inline_query`).
 *
 * Lo corre gorrite desde su compu, con el token y el secreto en variables de entorno (nunca en el
 * repo ni en la línea de comandos):
 *
 *   TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npm run telegram:webhook
 *   (opcional: -- --url https://otra-direccion/api/telegram)
 *
 * No muestra el token: si Telegram lo repite en un error, se tapa.
 */
import { WEBHOOK_URL, setWebhookParams } from '../src/lib/server/telegram/updates.js';

const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
const urlFlag = process.argv.indexOf('--url');
const url = urlFlag >= 0 ? process.argv[urlFlag + 1] : WEBHOOK_URL;

if (!token || !secret) {
	console.error('Faltan TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET (variables de entorno).');
	process.exit(1);
}
if (secret.length < 16) {
	console.error('El secreto tiene que tener 16 caracteres o más (como el de Cloudflare).');
	process.exit(1);
}
if (!url || !url.startsWith('https://')) {
	console.error('La dirección del webhook tiene que ser https.');
	process.exit(1);
}

/** @param {string} text */
const scrub = (text) => text.split(token).join('…');

/**
 * @param {string} method
 * @param {unknown} body
 */
async function call(method, body) {
	const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	/** @type {any} */
	const data = await res.json().catch(() => null);
	if (!res.ok || !data?.ok) {
		throw new Error(scrub(`${method}: ${res.status} ${data?.description ?? ''}`.trim()));
	}
	return data.result;
}

try {
	const params = setWebhookParams({ url, secret });
	await call('setWebhook', params);
	const info = await call('getWebhookInfo', {});
	console.log(`Webhook registrado en ${info.url}`);
	console.log(`allowed_updates: ${(info.allowed_updates ?? params.allowed_updates).join(', ')}`);
	if (info.pending_update_count) console.log(`Pendientes: ${info.pending_update_count}`);
} catch (error) {
	console.error(scrub(String(/** @type {Error} */ (error)?.message ?? error)));
	process.exit(1);
}
