/**
 * Webhook del bot de Telegram (decisión 0029, docs/telegram.md). La lógica está en
 * `$lib/server/telegram/`; esta ruta solo junta el secreto, el interruptor y los eventos.
 */
import { env } from '$env/dynamic/private';
import { isFlagOn } from '$lib/server/flags.js';
import { getDB } from '$lib/server/db';
import { handleWebhook } from '$lib/server/telegram/webhook.js';
import { listUpcomingEvents } from '$lib/server/telegram/events.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, url, platform }) {
	return handleWebhook({
		request,
		secret: env.TELEGRAM_WEBHOOK_SECRET,
		enabled: await isFlagOn(getDB(platform), 'telegram_bot'),
		origin: url.origin,
		listUpcoming: () => listUpcomingEvents(platform)
	});
}
