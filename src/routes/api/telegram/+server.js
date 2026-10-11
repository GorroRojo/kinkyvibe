/**
 * Webhook del bot de Telegram (decisiones 0029 y 0034, docs/telegram.md). La lógica está en
 * `$lib/server/telegram/`; esta ruta solo junta el secreto, los interruptores, los eventos, la
 * tarjeta de cada evento, el Fondo, el token (con él, el webhook llama a la API en `waitUntil`) y,
 * para la fase 2 (vincular cuentas) y el vínculo de les admins (la puerta por Telegram), la base.
 */
import { env } from '$env/dynamic/private';
import { isFlagOn } from '$lib/server/flags.js';
import { getDB } from '$lib/server/db';
import { handleWebhook } from '$lib/server/telegram/webhook.js';
import { eventCardInfo, listUpcomingEvents } from '$lib/server/telegram/events.js';
import { botAccounts } from '$lib/server/telegram/link.js';
import { botAdminLink } from '$lib/server/telegram/adminLink.js';
import { botDoor } from '$lib/server/telegram/puerta.js';
import { botUsername } from '$lib/server/telegram/web.js';
import { resolveFondoMonth } from '$lib/server/tickets/fondoMonth.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, url, platform, fetch }) {
	const db = getDB(platform);
	const ctx = platform?.ctx;
	const puerta = Boolean(db && (await isFlagOn(db, 'telegram_puerta')));
	return handleWebhook({
		request,
		secret: env.TELEGRAM_WEBHOOK_SECRET,
		enabled: await isFlagOn(db, 'telegram_bot'),
		origin: url.origin,
		listUpcoming: () => listUpcomingEvents(platform),
		card: (event) => eventCardInfo(platform, event.slug, url.origin),
		// Solo los cinco números de /api/porcentaje, con la memoria de fondoMonth.js (issue #265).
		fondo: () => resolveFondoMonth({ db, fetch }),
		botUsername: botUsername(),
		token: env.TELEGRAM_BOT_TOKEN,
		waitUntil: ctx?.waitUntil ? (task) => ctx.waitUntil(task) : undefined,
		// Fase 2: con «Lo que sigo» prendido (el bot ya está prendido si se llega acá).
		accounts: async () =>
			db && (await isFlagOn(db, 'lo_que_sigo')) ? botAccounts(db, platform) : null,
		// La puerta por Telegram (0037): `/start adm_<código>` del panel, con `telegram_puerta`
		// prendido (no depende de «Lo que sigo»). Apagado, el bot contesta que no se puede.
		adminLink: db && puerta ? botAdminLink(db) : null,
		// «🚪 Puerta» en el inicio para les admins vinculades (0037): una consulta por id de
		// Telegram, solo al mostrar el inicio por chat privado.
		door: db && puerta ? botDoor(db) : null
	});
}
