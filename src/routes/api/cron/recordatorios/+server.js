/**
 * POST /api/cron/recordatorios: manda una tanda de los mails que tocan: recordatorios (ver
 * $lib/server/tickets/reminders.js) y lo que quede de cada "Enviar el link a todes" (ver
 * `runMailQueue` en $lib/server/tickets/index.js). También
 * la lista de espera de las entradas (interruptor `lista_espera`: primero avanza la lista de cada
 * evento con `runWaitlistCron` y sus mails van primero en la tanda; ver
 * $lib/server/tickets/waitlistEngine.js),
 * el reintento del mail con las entradas de las órdenes aprobadas cuyo envío falló (ver
 * $lib/server/tickets/unsentOrders.js),
 * los avisos de "Avisame si se repite" (ver $lib/server/series/notify.js), el resumen diario de
 * ventas para admins por Telegram (ver $lib/server/telegram/adminNotify.js) y el registro automático
 * de los comandos del bot de Telegram (ver $lib/server/telegram/commandsSync.js) y borra las filas
 * por persona de las estadísticas de uso del bot de más de 180 días (ver
 * $lib/server/telegram/uso.js) y avisa por IndexNow las páginas públicas que cambiaron (ver
 * $lib/server/seo/indexnow.js) y borra los avisos de puerta vencidos y avisa por mail a la casilla
 * de la organización los que vencen pronto (ver $lib/server/tickets/doorNotices.js). Lo llama cada
 * 15 minutos el cron
 * del Worker (src/lib/server/scheduled.js); cada corrida sigue donde quedó la anterior.
 *
 * Pausas de emergencia ($lib/server/emergencia.js, docs/interruptores.md): con `MAILS_PAUSED`
 * no sale ningún mail en tanda (la tanda, las series y «Lo que sigo» se saltean y quedan para
 * después; el reintento del mail de las entradas sigue, es de una compra) y la lista de espera no
 * avanza (no se guardan lugares que nadie se entera); con `TICKETS_PAUSED`, la lista tampoco
 * avanza (no se podría comprar). La respuesta suma `paused: { tickets, mails }`.
 *
 * Protegido con un secreto compartido: header `x-cron-secret` = CRON_SECRET (comparado en
 * tiempo constante, sobre los SHA-256 para no revelar el largo). Sin CRON_SECRET configurado
 * responde 503 (nunca queda abierto).
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';
import {
	deliverEmail,
	replyToAddress,
	runMailQueue,
	siteOrigin
} from '$lib/server/tickets/index.js';
import { runDoorNoticesCron } from '$lib/server/tickets/doorNotices.js';
import { MIN_CRON_SECRET_LENGTH, isValidCronSecret } from '$lib/server/cron.js';
import { runSeriesCron } from '$lib/server/series/web.js';
import { runSigoCron } from '$lib/server/sigo/cron.js';
import { listaEsperaEnabled } from '$lib/server/flags.js';
import { runWaitlistCron, waitlistMailBatch } from '$lib/server/tickets/waitlistEngine.js';
import { syncBotCommands } from '$lib/server/telegram/commandsSync.js';
import { runAdminNoticesCron } from '$lib/server/telegram/adminNotify.js';
import { pruneUso } from '$lib/server/telegram/uso.js';
import { resendUnsentOrderEmails } from '$lib/server/tickets/unsentOrders.js';
import { runIndexNow } from '$lib/server/seo/indexnow.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { logMailsPaused, mailsPaused, ticketsPausedMessage } from '$lib/server/emergencia.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { seriesTagIds } from '$lib/utils/series.js';
import { sitemapWikiPosts } from '../../../(content)/sitemap.xml/series.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform, url, fetch }) {
	const secret = env.CRON_SECRET;
	if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) {
		return json({ error: 'CRON_SECRET no está configurado' }, { status: 503 });
	}
	if (!(await isValidCronSecret(request.headers.get('x-cron-secret'), secret))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const db = getDB(platform);
	if (!db) return json({ error: 'sin base de datos' }, { status: 503 });
	// Las pausas de emergencia: se leen una vez por corrida.
	const mailsOff = mailsPaused();
	const ticketsOff = ticketsPausedMessage() !== null;
	try {
		// La lista de espera, antes de la tanda (así las ofertas nuevas salen en esta misma
		// corrida) y aparte: si falla, los demás mails salen igual. Con una pausa no avanza: un
		// lugar guardado sin mail (o que no se puede comprar) se vencería sin que nadie se entere.
		let waitlistOn = false;
		let waitlist = null;
		try {
			waitlistOn = await listaEsperaEnabled(platform);
			waitlist = await runWaitlistCron(db, { enabled: waitlistOn && !mailsOff && !ticketsOff });
		} catch (error) {
			logDBError('cron lista de espera', error);
		}
		const r = await runMailQueue({
			db,
			origin: siteOrigin(url),
			fetch,
			...(waitlistOn
				? { sendWaitlist: waitlistMailBatch({ db, origin: siteOrigin(url), fetch }) }
				: {})
		});
		// El mail con las entradas que no salió al aprobarse la orden: aparte de la tanda (tiene su
		// propio tope) y si falla, lo demás sale igual.
		let unsentOrders = null;
		try {
			const u = await resendUnsentOrderEmails({ db, origin: siteOrigin(url), fetch });
			unsentOrders = {
				sent: u.sent,
				failed: u.failed,
				...(u.stopped ? { stopped: u.stopped } : {})
			};
		} catch (error) {
			logDBError('cron mails de entradas sin enviar', error);
		}
		// Las series van aparte: si fallan, los recordatorios ya salieron y la corrida no se cae.
		// Con MAILS_PAUSED, ni las series ni «Lo que sigo» (sus avisos quedan para después).
		let series = null;
		let sigo = null;
		if (mailsOff) {
			logMailsPaused('los avisos de series ni los de «Lo que sigo»');
		} else {
			try {
				series = await runSeriesCron({ db, origin: siteOrigin(url), fetch });
			} catch (error) {
				logDBError('cron series', error);
			}
			// «Lo que sigo» también aparte (interruptor `lo_que_sigo`).
			try {
				sigo = await runSigoCron({ db, platform, origin: siteOrigin(url), fetch });
			} catch (error) {
				logDBError('cron lo que sigo', error);
			}
		}
		// Los avisos de admins por Telegram (decisión 0041): el resumen diario desde las 9 (hora
		// de Argentina), solo a quien lo prendió. Aparte: si falla, lo demás ya salió.
		let telegramAdmin = null;
		try {
			telegramAdmin = await runAdminNoticesCron({
				db,
				origin: siteOrigin(url),
				token: env.TELEGRAM_BOT_TOKEN,
				fetch
			});
		} catch (error) {
			logDBError('cron avisos de admins', error);
		}
		// Estadísticas de uso del bot: las filas por persona duran 180 días (también con el
		// interruptor apagado: lo ya guardado se borra igual). Aparte: si falla, lo demás ya salió.
		let telegramUsoBorradas = null;
		try {
			telegramUsoBorradas = await pruneUso(db, Date.now());
		} catch (error) {
			logDBError('cron estadísticas del bot', error);
		}
		// IndexNow (docs/seo.md): avisa a los buscadores qué páginas públicas cambiaron. Apagado sin
		// INDEXNOW_KEY y fuera de producción. Nunca tira.
		const indexNow = await runIndexNow({
			db,
			key: env.INDEXNOW_KEY,
			origin: siteOrigin(url),
			fetch,
			// Las mismas listas que el sitemap: el grupo «wiki» trae también las páginas de las
			// series con ediciones públicas (sitemap.xml/series.js).
			lists: async () => {
				const [posts, wikiPosts, tags] = await Promise.all([
					sitePosts(platform),
					sitemapWikiPosts(platform),
					siteTagManager(platform)
				]);
				return { posts, wikiPosts, seriesIds: seriesTagIds(tags) };
			}
		});
		// Avisos de puerta (decisión 0053): borra los vencidos y avisa 14 días antes, una vez, a la
		// casilla de la organización (la de los comprobantes). Sin datos de la persona. Nunca tira.
		const doorNotices = await runDoorNoticesCron({
			db,
			origin: siteOrigin(url),
			to: () => replyToAddress(db),
			send: ({ to, message, idempotencyKey }) =>
				deliverEmail({ db, fetch, to, message, idempotencyKey })
		});
		// El menú «/» del bot: solo si cambió la lista y hay token. Nunca tira.
		const telegramCommands = await syncBotCommands({
			db,
			token: env.TELEGRAM_BOT_TOKEN,
			fetch
		});
		return json(
			{
				...r,
				...(mailsOff || ticketsOff ? { paused: { tickets: ticketsOff, mails: mailsOff } } : {}),
				...(waitlist ? { waitlistAdvance: waitlist } : {}),
				...(unsentOrders ? { unsentOrders } : {}),
				...(series ? { series } : {}),
				...(sigo ? { sigo } : {}),
				...(telegramAdmin ? { telegramAdmin } : {}),
				...(telegramUsoBorradas ? { telegramUsoBorradas } : {}),
				...('skipped' in indexNow ? {} : { indexNow }),
				...(doorNotices && (doorNotices.expired || doorNotices.reminded) ? { doorNotices } : {}),
				telegramCommands
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		logDBError('cron recordatorios', error);
		return json({ error: 'error' }, { status: 500 });
	}
}
