/**
 * Webhook del bot de Telegram (decisiones 0029 y 0034, docs/telegram.md). La lógica está en
 * `$lib/server/telegram/`; esta ruta solo junta el secreto, los interruptores, los eventos, la
 * tarjeta de cada evento, el modo inline, el Fondo, el token (con él, el webhook llama a la API en
 * `waitUntil`) y, para la fase 2 (vincular cuentas), el vínculo de les admins (la puerta por
 * Telegram), el estado y los avisos para admins (0041) y los textos cambiados en el panel
 * («Textos del bot») y las estadísticas de uso (`telegram_estadisticas`, uso.js), la base.
 */
import { env } from '$env/dynamic/private';
import { isFlagOn } from '$lib/server/flags.js';
import { getDB } from '$lib/server/db';
import { handleWebhook } from '$lib/server/telegram/webhook.js';
import { eventCardInfo, inlineEventInfo, listUpcomingEvents } from '$lib/server/telegram/events.js';
import { inlineSource } from '$lib/server/telegram/inlineSource.js';
import { botAccounts } from '$lib/server/telegram/link.js';
import { botAdminLink } from '$lib/server/telegram/adminLink.js';
import { botDoor } from '$lib/server/telegram/puerta.js';
import { botAdmin } from '$lib/server/telegram/adminData.js';
import { botUsername } from '$lib/server/telegram/web.js';
import { resolveFondoMonth } from '$lib/server/tickets/fondoMonth.js';
import { botTextOverrides } from '$lib/server/telegram/texts.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { usoWriter } from '$lib/server/telegram/uso.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, url, platform, fetch }) {
	const db = getDB(platform);
	const ctx = platform?.ctx;
	const puerta = Boolean(db && (await isFlagOn(db, 'telegram_puerta')));
	const admin = Boolean(db && (await isFlagOn(db, 'telegram_admin')));
	const stats = Boolean(db && (await isFlagOn(db, 'telegram_estadisticas')));
	return handleWebhook({
		request,
		secret: env.TELEGRAM_WEBHOOK_SECRET,
		enabled: await isFlagOn(db, 'telegram_bot'),
		origin: url.origin,
		listUpcoming: () => listUpcomingEvents(platform),
		card: (event) => eventCardInfo(platform, event.slug, url.origin),
		// Solo los cinco números de /api/porcentaje, con la memoria de fondoMonth.js (issue #265).
		fondo: () => resolveFondoMonth({ db, fetch }),
		// El modo inline: solo lo del índice público de la búsqueda (el mismo de
		// /api/search-index.json), con el lugar y la venta de los eventos como la tarjeta.
		inline: {
			source: () => inlineSource(platform),
			events: (metas) => inlineEventInfo(platform, metas),
			// El árbol de etiquetas (el mismo del sitio): para sugerir parecidas y «Seguir» cuando
			// una búsqueda no encuentra nada.
			tags: () => siteTagManager(platform)
		},
		botUsername: botUsername(),
		token: env.TELEGRAM_BOT_TOKEN,
		waitUntil: ctx?.waitUntil ? (task) => ctx.waitUntil(task) : undefined,
		// «Textos del bot» (Ajustes → Comunicación): lo cambiado en el panel, una vez por pedido.
		texts: () => botTextOverrides(db),
		// Fase 2: con «Lo que sigo» prendido (el bot ya está prendido si se llega acá).
		accounts: async () =>
			db && (await isFlagOn(db, 'lo_que_sigo')) ? botAccounts(db, platform) : null,
		// Vincular el Telegram de une admin (0037): `/start adm_<código>` del panel, con
		// `telegram_puerta` o `telegram_admin` prendido (no depende de «Lo que sigo»). Con los dos
		// apagados, el bot contesta que no se puede.
		adminLink: db && (puerta || admin) ? botAdminLink(db) : null,
		// «🚪 Puerta» en el inicio para les admins vinculades (0037): una consulta por id de
		// Telegram, solo al mostrar el inicio por chat privado.
		door: db && puerta ? botDoor(db) : null,
		// «📊 Estado» y «🔔 Mis avisos» para admins vinculades (0041): quién es admin se mira en
		// cada mensaje y cada botón de admins (y al mostrar el inicio por privado).
		admin: db && admin ? botAdmin(db) : null,
		// Estadísticas de uso (decisión 0045): quién y cuánto por un lado, qué se usa sumado por
		// semana por el otro; una tanda por update, en `waitUntil`. Apagado, no se cuenta nada.
		uso: db && stats ? usoWriter(db) : null
	});
}
