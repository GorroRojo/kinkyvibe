/**
 * Webhook del bot de Telegram (decisión 0029, docs/telegram.md). La lógica está en
 * `$lib/server/telegram/`; esta ruta solo junta el secreto, los interruptores, los eventos y, para
 * la fase 2 (vincular cuentas), la base.
 */
import { env } from '$env/dynamic/private';
import { isFlagOn } from '$lib/server/flags.js';
import { getDB } from '$lib/server/db';
import { handleWebhook } from '$lib/server/telegram/webhook.js';
import { listUpcomingEvents } from '$lib/server/telegram/events.js';
import { botAccounts } from '$lib/server/telegram/link.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, url, platform }) {
	const db = getDB(platform);
	return handleWebhook({
		request,
		secret: env.TELEGRAM_WEBHOOK_SECRET,
		enabled: await isFlagOn(db, 'telegram_bot'),
		origin: url.origin,
		listUpcoming: () => listUpcomingEvents(platform),
		// Fase 2: con «Lo que sigo» prendido (el bot ya está prendido si se llega acá).
		accounts: async () => (db && (await isFlagOn(db, 'lo_que_sigo')) ? botAccounts(db) : null)
	});
}
