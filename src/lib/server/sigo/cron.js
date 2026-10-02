/**
 * La parte de «Lo que sigo» del cron de mails (POST /api/cron/recordatorios): con `lo_que_sigo`
 * o `cuentas` apagado no hace nada (`null`). Ver notify.js.
 *
 * Los eventos salen de la capa compartida de contenido (`sitePosts`, interruptor `contenido_db`):
 * de la base o de los `.md`, solo lo listado y visible para cualquiera (nada oculto ni no
 * listado). notify.js se queda con los que todavía no empezaron.
 *
 * Los avisos por Telegram (fase 2 del bot) salen además con el interruptor `telegram_bot`
 * prendido y el secret TELEGRAM_BOT_TOKEN cargado; sin el token se saltean con una línea en el
 * log (`telegramSender`).
 */
import { env } from '$env/dynamic/private';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { isFlagOn } from '$lib/server/flags.js';
import { siteTags } from '$lib/server/series/index.js';
import { seriesSender } from '$lib/server/series/web.js';
import { telegramSender } from '$lib/server/telegram/send.js';
import { avisameViaSigo } from './avisame.js';
import { runFollowNotifications } from './notify.js';

/**
 * @param {{ db: import('@cloudflare/workers-types').D1Database,
 *   platform: App.Platform | undefined, origin: string, fetch: typeof fetch, now?: number,
 *   send?: import('./notify.js').FollowSend,
 *   telegramSend?: import('$lib/server/telegram/send.js').TelegramSend }} input `send` y
 *   `telegramSend`: para las pruebas (si no, Resend y la API de Telegram)
 */
export async function runSigoCron({
	db,
	platform,
	origin,
	fetch: fetchFn,
	now = Date.now(),
	send,
	telegramSend
}) {
	if (!(await avisameViaSigo(db))) return null;
	return runFollowNotifications({
		db,
		posts: await sitePosts(platform),
		tags: siteTags(),
		origin,
		send: send ?? seriesSender(db, fetchFn),
		telegram: await telegramChannel(db, fetchFn, telegramSend),
		now
	});
}

/**
 * El canal de Telegram para esta corrida, o `null` (bot apagado o sin token).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {typeof fetch} fetchFn
 * @param {import('$lib/server/telegram/send.js').TelegramSend | undefined} injected
 */
async function telegramChannel(db, fetchFn, injected) {
	if (!(await isFlagOn(db, 'telegram_bot'))) return null;
	const sendFn = injected ?? telegramSender(env.TELEGRAM_BOT_TOKEN, fetchFn);
	return sendFn ? { send: sendFn } : null;
}
