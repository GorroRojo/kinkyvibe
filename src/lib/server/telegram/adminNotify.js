/**
 * Los avisos para admins por Telegram, PR 2 (decisión 0041, docs/telegram.md «Estado y avisos
 * para admins»): el **resumen diario** de ventas y los avisos **de cada venta** y **de cada
 * transferencia**, y el de un **contracargo** de Mercado Pago (le llega a quien prendió «Cada
 * venta»). PR 3: el **día del evento** (un resumen ese día) y los **recordatorios** (el evento de
 * mañana; falta el lugar o el link de la transmisión), en {@link runAdminEventDayCron}.
 *
 * Reglas (las de 0029 y 0041):
 *
 * - **A quién**: solo a les admins que prendieron ese aviso en «🔔 Mis avisos», con el Telegram
 *   vinculado y que **siguen** en `ADMINS` (`noticeRecipients`, mirado en cada envío). Solo por
 *   el chat privado con esa persona (el id del chat es el de su usuario de Telegram).
 * - **Interruptores**: nada sale sin el bot (`telegram_bot`) y «Telegram para admins»
 *   (`telegram_admin`) prendidos ({@link adminBotEnabled}), ni sin `TELEGRAM_BOT_TOKEN`.
 * - **Sin datos de compradores**: los textos se arman solo con cantidades, el título del evento y
 *   los nombres del tipo y el tramo. Las funciones que arman los textos ni reciben la orden: les
 *   llega un objeto con esos campos ({@link orderSummary}), así un campo nuevo de la orden nunca
 *   termina en Telegram por accidente.
 * - **Nada dos veces**: cada envío toma antes una fila de `telegram_admin_sent` (migración 0055)
 *   y la suelta si Telegram falla.
 * - **Horario de silencio** (23 a 9, hora de Argentina, quiet.js): el resumen sale desde las
 *   {@link ADMIN_DAILY_HOUR}; los avisos en el momento salen igual pero **sin sonido**
 *   (`disable_notification`).
 */
import { env } from '$env/dynamic/private';
import { getEventTickets, listTicketedEvents } from '$lib/server/tickets/events.js';
import { adminBotEnabled, adminEventChoices, eventStatus, noticeRecipients } from './adminData.js';
import { isHttps, tgTime } from './screens.js';
import { callTelegramApi } from './send.js';
import { botText, botTextOverrides } from './texts.js';
import { formatARS } from '$lib/utils/money.js';
import { orderReference } from '$lib/utils/tickets.js';
import { argentinaHour, isQuietHour } from './quiet.js';
import { getStreamLink } from '$lib/server/tickets/stream.js';
import { placeLine } from '$lib/utils/eventPlace.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/tickets/orders.js').Order} Order */
/** @typedef {import('$lib/server/tickets/config.js').TicketType} TicketType */
/** @typedef {import('./adminData.js').EventStatus} EventStatus */
/** @typedef {import('$lib/utils/botTexts.js').BotTexts} BotTexts */
/** @typedef {'sent' | 'failed' | 'blocked'} SendResult */
/**
 * @typedef {(chatId: string, message: AdminMessage) => Promise<SendResult>} AdminSend
 */
/**
 * Un aviso para mandar: HTML de Telegram y, si hay, el botón «Ver en el panel ↗».
 *
 * @typedef {{ text: string, panelUrl: string | null, silent?: boolean }} AdminMessage
 */

/**
 * A qué hora sale el resumen diario (hora de Argentina): en la primera corrida del cron (cada 15
 * minutos) desde esta hora. Cuenta lo vendido entre esta hora de ayer y esta hora de hoy.
 */
export const ADMIN_DAILY_HOUR = 9;

/** Argentina no tiene horario de verano: siempre UTC−3. */
const AR_OFFSET = '-03:00';

/** El resumen cuenta como «por vencer» las reservas que vencen dentro de esta ventana. */
export const DAILY_EXPIRING_MS = 24 * 60 * 60 * 1000;

/** Mensajes del resumen diario por corrida, como mucho (el resto sale en las siguientes). */
export const ADMIN_NOTICE_BATCH = 50;

/**
 * Intentos por aviso y admin en un día: después de tantos fallos seguidos la fila queda tomada y
 * no se reintenta más (como el reintento del mail de las entradas, tickets/unsentOrders.js). Las
 * claves de los avisos ya llevan el día o la hora, así que el de mañana sale igual.
 */
export const ADMIN_NOTICE_ATTEMPTS = 3;
const RETRY_RULE = Object.freeze({ limit: ADMIN_NOTICE_ATTEMPTS - 1, windowSeconds: 24 * 60 * 60 });

/** Cuánto se guardan las filas de `telegram_admin_sent` (lo enviado). */
export const SENT_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------------------------

/**
 * El día en Argentina, `AAAA-MM-DD`.
 *
 * @param {number} now
 */
export function argentinaDate(now) {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Argentina/Buenos_Aires',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(now));
}

/**
 * La ventana del resumen de hoy: de {@link ADMIN_DAILY_HOUR} de ayer a la misma hora de hoy (hora
 * de Argentina). Así cada venta entra en un solo resumen.
 *
 * @param {number} now
 * @returns {{ date: string, from: number, to: number }}
 */
export function dailyWindow(now) {
	const date = argentinaDate(now);
	const hour = String(ADMIN_DAILY_HOUR).padStart(2, '0');
	const to = Date.parse(`${date}T${hour}:00:00${AR_OFFSET}`);
	return { date, from: to - DAY_MS, to };
}

/**
 * ¿Ya es hora del resumen? Desde {@link ADMIN_DAILY_HOUR} y fuera del horario de silencio.
 *
 * @param {number} now
 */
export const isDailyTime = (now) => argentinaHour(now) >= ADMIN_DAILY_HOUR && !isQuietHour(now);

// ---------------------------------------------------------------------------------------------
// Los textos (puros, sin datos de compradores)
// ---------------------------------------------------------------------------------------------

/**
 * Lo único de una orden que puede llegar a un aviso: cuántas entradas, el tipo y el tramo (sus
 * nombres en la configuración del evento). Nada de quien compra.
 *
 * @typedef {{ quantity: number, typeName: string, tierName: string | null }} OrderSummary
 */

/**
 * @param {Pick<Order, 'quantity' | 'ticket_type' | 'ticket_tier'>} order
 * @param {TicketType | undefined} type
 * @returns {OrderSummary}
 */
export function orderSummary(order, type) {
	const tier = order.ticket_tier
		? (type?.tiers?.find((t) => t.id === order.ticket_tier)?.name ?? null)
		: null;
	return {
		quantity: Math.max(1, Math.floor(Number(order.quantity) || 1)),
		typeName: String(type?.name ?? order.ticket_type),
		tierName: tier
	};
}

/** «2 General (Preventa 1)». @param {OrderSummary} s */
const ticketsPhrase = (s) => `${s.quantity} ${s.typeName}${s.tierName ? ` (${s.tierName})` : ''}`;

/** «23/50» con cupo, «23» sin cupo. @param {number} sold @param {number | null} capacity */
const soldOf = (sold, capacity) => (capacity === null ? String(sold) : `${sold}/${capacity}`);

/**
 * «🎟 Se vendió 1 General (Preventa 1) de Fiesta X · 23/50».
 *
 * @param {{ summary: OrderSummary, eventTitle: string, sold: number, capacity: number | null }} input
 * @param {BotTexts | null} [overrides]
 */
export function saleNoticeText({ summary, eventTitle, sold, capacity }, overrides) {
	return botText(
		summary.quantity === 1 ? 'admin.venta' : 'admin.ventas',
		{ entradas: ticketsPhrase(summary), evento: eventTitle, vendidas: soldOf(sold, capacity) },
		overrides
	);
}

/**
 * «💸 Transferencia para confirmar: 2 General de Fiesta X · 3 por confirmar».
 *
 * @param {{ summary: OrderSummary, eventTitle: string, pending: number }} input
 * @param {BotTexts | null} [overrides]
 */
export function transferNoticeText({ summary, eventTitle, pending }, overrides) {
	return botText(
		'admin.transferencia',
		{ entradas: ticketsPhrase(summary), evento: eventTitle, pendientes: pending },
		overrides
	);
}

/**
 * «⚠️ Contracargo en Mercado Pago: orden KV-1A2B3C4D de Fiesta X ($ 10.000). …». Solo la
 * referencia de la orden, el evento y el total: nunca quién compró.
 *
 * @param {{ reference: string, eventTitle: string, amount: string }} input
 * @param {BotTexts | null} [overrides]
 */
export function chargebackNoticeText({ reference, eventTitle, amount }, overrides) {
	return botText(
		'admin.contracargo',
		{ orden: reference, evento: eventTitle, monto: amount },
		overrides
	);
}

/**
 * «📭 Resend frenó los mails por el cupo. Compras aprobadas que esperan el mail …: 4». Solo la
 * cantidad.
 *
 * @param {{ pending: number }} input
 * @param {BotTexts | null} [overrides]
 */
export function mailQuotaNoticeText({ pending }, overrides) {
	return botText('admin.mails_cupo', { pendientes: pending }, overrides);
}

/**
 * El resumen diario de un evento: lo vendido desde ayer contra el cupo, las transferencias nuevas
 * y lo pendiente (reservas sin pagar y las que vencen en 24 horas, transferencias por confirmar,
 * órdenes para revisar, la lista de espera). Solo cantidades.
 *
 * @param {{ title: string, start: string, soldSince: number, newTransfers: number,
 *   status: EventStatus }} input
 * @param {number} now
 * @param {BotTexts | null} [overrides]
 */
export function dailySummaryText(
	{ title, start, soldSince, newTransfers, status },
	now,
	overrides
) {
	const when = tgTime(start, now);
	const head = [
		botText('admin.resumen_titulo', { evento: title }, overrides),
		...(when ? [`📅 ${when}`] : [])
	];
	const sales = [
		botText(
			'admin.resumen_vendidas',
			{
				hora: `${ADMIN_DAILY_HOUR}:00`,
				cantidad: soldSince,
				vendidas: soldOf(status.sold, status.capacity)
			},
			overrides
		),
		...(newTransfers > 0
			? [botText('admin.resumen_transferencias', { cantidad: newTransfers }, overrides)]
			: [])
	];
	/** @type {string[]} */
	const pending = [];
	if (status.held > 0) {
		pending.push(
			botText(
				'admin.resumen_reservas',
				{ cantidad: status.held, por_vencer: status.expiring },
				overrides
			)
		);
	}
	if (status.transfers > 0) {
		pending.push(botText('admin.transferencias', { cantidad: status.transfers }, overrides));
	}
	if (status.review > 0) {
		pending.push(botText('admin.revisar', { cantidad: status.review }, overrides));
	}
	if (pending.length === 0) pending.push(botText('admin.nada_pendiente', {}, overrides));
	if (status.waitlist) {
		pending.push(botText('admin.espera', { cantidad: status.waitlist }, overrides));
	}
	return [
		head.join('\n'),
		sales.join('\n'),
		pending.join('\n'),
		botText('admin.pie', {}, overrides)
	]
		.filter(Boolean)
		.join('\n\n');
}

/**
 * El link al evento en el panel (solo con un origen https: Telegram no acepta otros botones).
 *
 * @param {string} origin
 * @param {string} slug
 */
export const panelUrl = (origin, slug) =>
	isHttps(origin) ? `${origin}/admin/eventos/${encodeURIComponent(slug)}` : null;

// ---------------------------------------------------------------------------------------------
// Mandar y no repetir
// ---------------------------------------------------------------------------------------------

/**
 * Un `sendMessage` al chat privado de le admin: HTML, sin vista previa, con «Ver en el panel ↗»
 * y, en el horario de silencio, sin sonido.
 *
 * @param {string} token
 * @param {typeof fetch} [fetchFn]
 * @param {BotTexts | null} [overrides]
 * @returns {AdminSend}
 */
export function adminSender(token, fetchFn = fetch, overrides = null) {
	return async (chatId, message) => {
		const r = await callTelegramApi({
			token,
			method: 'sendMessage',
			fetch: fetchFn,
			body: {
				chat_id: chatId,
				text: message.text,
				parse_mode: 'HTML',
				link_preview_options: { is_disabled: true },
				...(message.silent ? { disable_notification: true } : {}),
				...(message.panelUrl
					? {
							reply_markup: {
								inline_keyboard: [
									[{ text: botText('admin.boton_panel', {}, overrides), url: message.panelUrl }]
								]
							}
						}
					: {})
			}
		});
		if (r.ok) return 'sent';
		return r.status === 403 ? 'blocked' : 'failed';
	};
}

/**
 * Toma la fila de un envío. `true` si es de este pedido (nadie la había tomado).
 *
 * @param {D1Database} db
 * @param {number} githubId
 * @param {string} key
 * @param {number} now
 */
export async function claimNotice(db, githubId, key, now) {
	const res = await db
		.prepare(
			`INSERT INTO telegram_admin_sent (github_id, notice_key, sent_at) VALUES (?1, ?2, ?3)
			ON CONFLICT (github_id, notice_key) DO NOTHING`
		)
		.bind(githubId, key, now)
		.run();
	return res.meta.changes === 1;
}

/**
 * Suelta la fila (Telegram falló: puede volver a intentarse).
 *
 * @param {D1Database} db
 * @param {number} githubId
 * @param {string} key
 */
export async function releaseNotice(db, githubId, key) {
	await db
		.prepare('DELETE FROM telegram_admin_sent WHERE github_id = ?1 AND notice_key = ?2')
		.bind(githubId, key)
		.run();
}

/**
 * Borra lo enviado hace más de {@link SENT_KEEP_MS}.
 *
 * @param {D1Database} db
 * @param {number} now
 */
export async function pruneSentNotices(db, now) {
	const res = await db
		.prepare('DELETE FROM telegram_admin_sent WHERE sent_at < ?1')
		.bind(now - SENT_KEEP_MS)
		.run();
	return res.meta.changes ?? 0;
}

/**
 * Manda un aviso a cada destinatarie, una sola vez por clave. Si Telegram falla, la fila se suelta
 * para la corrida siguiente, como mucho {@link ADMIN_NOTICE_ATTEMPTS} intentos por día.
 *
 * @param {{ db: D1Database, send: AdminSend, key: string, message: AdminMessage, now: number,
 *   recipients: { telegramUserId: string, githubId: number }[] }} input
 * @returns {Promise<{ sent: number, failed: number, skipped: number }>}
 */
async function deliverOnce({ db, send, key, message, now, recipients }) {
	const out = { sent: 0, failed: 0, skipped: 0 };
	for (const r of recipients) {
		if (!(await claimNotice(db, r.githubId, key, now))) {
			out.skipped += 1;
			continue;
		}
		const result = await send(r.telegramUserId, message);
		if (result === 'failed') {
			out.failed += 1;
			// Se suelta para reintentar, salvo que ya haya fallado ADMIN_NOTICE_ATTEMPTS veces hoy.
			const retry = await hitRateLimit(
				db,
				`telegram:aviso-admin:${await sha256Hex(`${r.githubId}:${key}`)}`,
				RETRY_RULE,
				now
			);
			if (retry.allowed) await releaseNotice(db, r.githubId, key);
		} else if (result === 'blocked') {
			// Bloqueó al bot o borró el chat: no se reintenta (el vínculo sigue, lo usa la puerta).
			out.failed += 1;
		} else {
			out.sent += 1;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------------------------
// Cada venta y cada transferencia
// ---------------------------------------------------------------------------------------------

/** @typedef {'cada_venta' | 'transferencia' | 'contracargo'} OrderNoticeKind */

/**
 * El aviso de una orden a les admins que lo prendieron: «cada venta» cuando se aprueba, «cada
 * transferencia» cuando llega una para confirmar, y un contracargo de Mercado Pago (el banco de
 * quien compró revirtió el pago) a quienes prendieron «cada venta»: no tiene interruptor propio.
 * Solo de las ventas por el sitio (canal `online`): las de la puerta y las cargadas a mano las
 * hace une admin.
 *
 * @param {{ db: D1Database, kind: OrderNoticeKind,
 *   order: Pick<Order, 'id' | 'event_slug' | 'ticket_type' | 'ticket_tier' | 'quantity' | 'channel'>
 *     & Partial<Pick<Order, 'total'>>,
 *   origin: string, send: AdminSend, now?: number, overrides?: BotTexts | null,
 *   config?: typeof getEventTickets }} input
 * @returns {Promise<{ sent: number, failed: number, skipped: number } | null>} `null`: no había
 *   a quién mandarle o no corresponde
 */
export async function notifyOrder({
	db,
	kind,
	order,
	origin,
	send,
	now = Date.now(),
	overrides = null,
	config = getEventTickets
}) {
	if ((order.channel ?? 'online') !== 'online') return null;
	const recipients = await noticeRecipients(db, kind === 'contracargo' ? 'cada_venta' : kind);
	if (recipients.length === 0) return null;
	const tickets = await config(order.event_slug);
	if (!tickets) return null;
	const type = tickets.types.find((t) => t.id === order.ticket_type);
	const summary = orderSummary(order, type);
	const eventTitle = String(tickets.title || order.event_slug);
	/** @type {string} */
	let text;
	if (kind === 'cada_venta') {
		const row = await db
			.prepare(
				`SELECT COALESCE(SUM(quantity), 0) AS n FROM orders
				WHERE event_slug = ?1 AND ticket_type = ?2 AND status = 'approved'`
			)
			.bind(order.event_slug, order.ticket_type)
			.first();
		text = saleNoticeText(
			{ summary, eventTitle, sold: Number(row?.n ?? 0), capacity: type?.capacity ?? null },
			overrides
		);
	} else if (kind === 'contracargo') {
		text = chargebackNoticeText(
			{
				reference: orderReference(order.id),
				eventTitle,
				amount: formatARS(Number(order.total) || 0)
			},
			overrides
		);
	} else {
		const row = await db
			.prepare(
				`SELECT COUNT(*) AS n FROM orders WHERE event_slug = ?1 AND status = 'awaiting_transfer'`
			)
			.bind(order.event_slug)
			.first();
		text = transferNoticeText({ summary, eventTitle, pending: Number(row?.n ?? 0) }, overrides);
	}
	return deliverOnce({
		db,
		send,
		key: `${kind === 'cada_venta' ? 'venta' : kind}:${order.id}`,
		message: { text, panelUrl: panelUrl(origin, order.event_slug), silent: isQuietHour(now) },
		now,
		recipients
	});
}

/**
 * Para los flujos de compra: manda el aviso de una orden **en segundo plano** (con `waitUntil`
 * si la plataforma lo tiene) y **nunca tira**: un problema con Telegram no puede trabar una
 * compra ni una confirmación. Sin los interruptores o sin token, no hace nada.
 *
 * @param {{ db: D1Database | null | undefined, platform?: App.Platform, kind: OrderNoticeKind,
 *   order: Order | null | undefined, origin: string, fetch?: typeof fetch,
 *   config?: typeof getEventTickets }} input `config`: de dónde sale el evento (para los tests)
 */
export async function queueOrderNotice({
	db,
	platform,
	kind,
	order,
	origin,
	fetch: fetchFn,
	config = getEventTickets
}) {
	const task = (async () => {
		try {
			const token = env.TELEGRAM_BOT_TOKEN;
			if (!db || !order || !token || !(await adminBotEnabled(db))) return;
			const overrides = await botTextOverrides(db);
			await notifyOrder({
				db,
				kind,
				order,
				origin,
				overrides,
				config,
				send: adminSender(token, fetchFn ?? fetch, overrides)
			});
		} catch (error) {
			console.error(
				`[telegram] aviso de admins (${kind}) no salió:`,
				/** @type {Error} */ (error)?.name
			);
		}
	})();
	const ctx = platform?.ctx;
	if (ctx?.waitUntil) ctx.waitUntil(task);
	else await task;
}

// ---------------------------------------------------------------------------------------------
// Resumen diario
// ---------------------------------------------------------------------------------------------

/**
 * Lo que cambió en un evento en la ventana: entradas aprobadas (por `updated_at`, que es cuando
 * se aprobó la orden: la tabla no tiene una fecha de aprobación aparte) y transferencias que
 * llegaron (órdenes por transferencia creadas en la ventana, estén como estén ahora).
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {{ from: number, to: number }} window
 */
export async function dailyActivity(db, slug, { from, to }) {
	const row = await db
		.prepare(
			`SELECT
				COALESCE(SUM(CASE WHEN status = 'approved' AND updated_at >= ?2 AND updated_at < ?3
					THEN quantity ELSE 0 END), 0) AS sold,
				COUNT(CASE WHEN payment_method = 'transferencia' AND created_at >= ?2 AND created_at < ?3
					THEN 1 END) AS transfers
			FROM orders WHERE event_slug = ?1`
		)
		.bind(slug, from, to)
		.first();
	return { soldSince: Number(row?.sold ?? 0), newTransfers: Number(row?.transfers ?? 0) };
}

/**
 * Lo del cron (cada 15 minutos): desde las {@link ADMIN_DAILY_HOUR} (hora de Argentina), un
 * resumen por evento de hoy o próximo **que tuvo movimiento** (ventas o transferencias nuevas
 * desde ayer a esa hora) a cada admin que prendió «Resumen diario». Sin movimiento, nada. Una
 * vez por día, evento y admin (`resumen:<día>:<evento>`); si Telegram falla, se reintenta en la
 * corrida siguiente. También borra lo enviado hace más de 30 días.
 *
 * @param {{ db: D1Database, origin: string, token: string | undefined, fetch?: typeof fetch,
 *   now?: number, list?: typeof listTicketedEvents, send?: AdminSend }} input
 *   `list` y `send`, para los tests
 * @returns {Promise<{ skipped: 'off' | 'token' | 'hour' | 'nobody' } | { sent: number,
 *   failed: number, events: number }>}
 */
export async function runAdminNoticesCron({
	db,
	origin,
	token,
	fetch: fetchFn = fetch,
	now = Date.now(),
	list = listTicketedEvents,
	send
}) {
	if (!(await adminBotEnabled(db))) return { skipped: 'off' };
	if (!token && !send) {
		console.log('[telegram] falta TELEGRAM_BOT_TOKEN: no se mandan avisos a admins');
		return { skipped: 'token' };
	}
	await pruneSentNotices(db, now);
	if (!isDailyTime(now)) return { skipped: 'hour' };
	const recipients = await noticeRecipients(db, 'resumen_diario');
	if (recipients.length === 0) return { skipped: 'nobody' };

	const overrides = await botTextOverrides(db);
	const sender = send ?? adminSender(/** @type {string} */ (token), fetchFn, overrides);
	const window = dailyWindow(now);
	const all = await list();
	const configs = new Map(all.map((e) => [e.slug, e.config]));
	const out = { sent: 0, failed: 0, events: 0 };
	let budget = ADMIN_NOTICE_BATCH;
	for (const choice of adminEventChoices(all, now)) {
		if (budget <= 0) break;
		const key = `resumen:${window.date}:${choice.slug}`;
		// Si ya les llegó a todes, no hace falta consultar nada más.
		const pendingFor = [];
		for (const r of recipients) {
			const done = await db
				.prepare('SELECT 1 AS ok FROM telegram_admin_sent WHERE github_id = ?1 AND notice_key = ?2')
				.bind(r.githubId, key)
				.first();
			if (!done) pendingFor.push(r);
		}
		if (pendingFor.length === 0) continue;
		const activity = await dailyActivity(db, choice.slug, window);
		if (activity.soldSince === 0 && activity.newTransfers === 0) continue;
		const config = configs.get(choice.slug);
		if (!config) continue;
		const status = await eventStatus(db, choice.slug, config, now, {
			expiringMs: DAILY_EXPIRING_MS
		});
		out.events += 1;
		const text = dailySummaryText(
			{ title: choice.title, start: choice.start, ...activity, status },
			now,
			overrides
		);
		const r = await deliverOnce({
			db,
			send: sender,
			key,
			message: { text, panelUrl: panelUrl(origin, choice.slug) },
			now,
			recipients: pendingFor.slice(0, budget)
		});
		budget -= r.sent + r.failed;
		out.sent += r.sent;
		out.failed += r.failed;
	}
	return out;
}

// ---------------------------------------------------------------------------------------------
// Cupo de mails
// ---------------------------------------------------------------------------------------------

/** Las órdenes sin mail que cuenta el aviso del cupo: las mismas que reintenta el cron (48 h). */
const MAIL_QUOTA_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Cuando el reintento del mail de las entradas encuentra el cupo de Resend terminado (un 429 de
 * cupo: `stopped: 'quota'` en unsentOrders.js), avisa a les admins que prendieron «Cada venta»,
 * **como mucho una vez por hora** (la clave lleva la hora), con cuántas órdenes aprobadas de las
 * últimas 48 h esperan el mail. Sin datos de compradores. Un 429 de tasa (demasiados por segundo)
 * no avisa: se resuelve solo en la corrida siguiente.
 *
 * @param {{ db: D1Database, origin: string, token?: string, fetch?: typeof fetch, now?: number,
 *   send?: AdminSend }} input `send`, para los tests
 * @returns {Promise<{ skipped: 'off' | 'token' | 'nobody' } | { sent: number, failed: number,
 *   skipped: number }>}
 */
export async function notifyMailQuota({
	db,
	origin,
	token,
	fetch: fetchFn = fetch,
	now = Date.now(),
	send
}) {
	if (!(await adminBotEnabled(db))) return { skipped: 'off' };
	if (!token && !send) return { skipped: 'token' };
	const recipients = await noticeRecipients(db, 'cada_venta');
	if (recipients.length === 0) return { skipped: 'nobody' };
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM orders
			WHERE status = 'approved' AND email_sent_at IS NULL
				AND buyer_email IS NOT NULL AND TRIM(buyer_email) != '' AND updated_at >= ?1`
		)
		.bind(now - MAIL_QUOTA_WINDOW_MS)
		.first();
	const overrides = await botTextOverrides(db);
	const sender = send ?? adminSender(/** @type {string} */ (token), fetchFn, overrides);
	return deliverOnce({
		db,
		send: sender,
		key: `mails-cupo:${Math.floor(now / (60 * 60 * 1000))}`,
		message: {
			text: mailQuotaNoticeText({ pending: Number(row?.n ?? 0) }, overrides),
			panelUrl: isHttps(origin) ? `${origin}/admin` : null,
			silent: isQuietHour(now)
		},
		now,
		recipients
	});
}

// ---------------------------------------------------------------------------------------------
// Día del evento y recordatorios (PR 3)
// ---------------------------------------------------------------------------------------------

/**
 * Lo que le falta a un evento para que llegue bien a quienes compraron: el lugar (presencial, sin
 * lugar vinculado ni «Dónde» en texto) o el link de la transmisión (online, sin link cargado).
 *
 * @typedef {{ place: boolean, stream: boolean }} Missing
 */

/**
 * @param {{ online: boolean, location?: unknown, location_name?: unknown }} config
 * @param {{ hasVenue: boolean, hasStream: boolean }} found
 * @returns {Missing}
 */
export function missingOf(config, { hasVenue, hasStream }) {
	if (config.online) return { place: false, stream: !hasStream };
	return { place: !hasVenue && !placeLine(config.location_name, config.location), stream: false };
}

/** @param {Missing} missing @param {BotTexts | null} [overrides] */
const missingLines = (missing, overrides) => [
	...(missing.place ? [botText('admin.falta_lugar', {}, overrides)] : []),
	...(missing.stream ? [botText('admin.falta_link', {}, overrides)] : [])
];

/** El total del evento contra el cupo («Total: 15 de 60 vendidas»). @param {EventStatus} status @param {BotTexts | null} [overrides] */
const totalLine = (status, overrides) =>
	status.capacity === null
		? botText('admin.total_sin_cupo', { vendidas: status.sold }, overrides)
		: botText('admin.total', { vendidas: status.sold, cupo: status.capacity }, overrides);

/**
 * El resumen del día del evento: la hora, el total vendido contra el cupo, lo pendiente (reservas
 * sin pagar y las que vencen en la próxima hora, transferencias por confirmar, órdenes para
 * revisar, la lista de espera) y lo que falta (el lugar o el link). Solo cantidades.
 *
 * @param {{ title: string, start: string, status: EventStatus, missing: Missing }} input
 * @param {number} now
 * @param {BotTexts | null} [overrides]
 */
export function eventDayText({ title, start, status, missing }, now, overrides) {
	const when = tgTime(start, now);
	/** @type {string[]} */
	const pending = [];
	if (status.held > 0) {
		pending.push(
			botText('admin.reservas', { cantidad: status.held, por_vencer: status.expiring }, overrides)
		);
	}
	if (status.transfers > 0) {
		pending.push(botText('admin.transferencias', { cantidad: status.transfers }, overrides));
	}
	if (status.review > 0) {
		pending.push(botText('admin.revisar', { cantidad: status.review }, overrides));
	}
	if (pending.length === 0) pending.push(botText('admin.nada_pendiente', {}, overrides));
	if (status.waitlist) {
		pending.push(botText('admin.espera', { cantidad: status.waitlist }, overrides));
	}
	return [
		[
			botText('admin.dia_titulo', { evento: title }, overrides),
			...(when ? [`📅 ${when}`] : [])
		].join('\n'),
		totalLine(status, overrides),
		pending.join('\n'),
		missingLines(missing, overrides).join('\n'),
		botText('admin.pie', {}, overrides)
	]
		.filter(Boolean)
		.join('\n\n');
}

/**
 * Un recordatorio: el del evento de mañana («⏰ Mañana: …», con el total vendido y lo que falta)
 * o, el mismo día, el de lo que todavía falta («⚠️ Hoy: …»).
 *
 * @param {{ kind: 'manana' | 'falta', title: string, start: string, status: EventStatus,
 *   missing: Missing }} input
 * @param {number} now
 * @param {BotTexts | null} [overrides]
 */
export function reminderText({ kind, title, start, status, missing }, now, overrides) {
	const when = tgTime(start, now);
	const head =
		kind === 'manana'
			? botText('admin.manana_titulo', { evento: title }, overrides)
			: botText('admin.falta_titulo', { evento: title }, overrides);
	return [
		[head, ...(when ? [`📅 ${when}`] : [])].join('\n'),
		totalLine(status, overrides),
		missingLines(missing, overrides).join('\n'),
		botText('admin.pie', {}, overrides)
	]
		.filter(Boolean)
		.join('\n\n');
}

/**
 * Lo del cron (cada 15 minutos), desde las {@link ADMIN_DAILY_HOUR} (hora de Argentina, fuera del
 * horario de silencio), para los eventos con entradas que no están cancelados:
 *
 * - **Día del evento** (a quien prendió «Día del evento»): el día del evento, su resumen
 *   ({@link eventDayText}), con o sin ventas. Clave `dia:<día>:<evento>`.
 * - **Recordatorios** (a quien prendió «Recordatorios»): el día antes, «mañana es el evento» con lo
 *   que falta (clave `manana:<día>:<evento>`); y el mismo día, solo si todavía falta el lugar o el
 *   link y a quien no prendió «Día del evento» (su resumen ya lo dice; clave `falta:<día>:<evento>`).
 *
 * Una vez por día, evento y admin; si Telegram falla, se reintenta en la corrida siguiente. Aparte
 * del resumen diario ({@link runAdminNoticesCron}): no cambia lo que ese devuelve.
 *
 * @param {{ db: D1Database, origin: string, token: string | undefined, fetch?: typeof fetch,
 *   now?: number, list?: typeof listTicketedEvents, send?: AdminSend,
 *   venues?: (db: D1Database, slugs: string[]) => Promise<Set<string>> }} input
 *   `list`, `send` y `venues`, para los tests
 * @returns {Promise<{ skipped: 'off' | 'token' | 'hour' | 'nobody' } | { sent: number,
 *   failed: number, events: number }>}
 */
export async function runAdminEventDayCron({
	db,
	origin,
	token,
	fetch: fetchFn = fetch,
	now = Date.now(),
	list = listTicketedEvents,
	send,
	venues = async (d, slugs) =>
		(await import('$lib/server/amigues/venues.js')).eventsWithVenueAmong(d, slugs)
}) {
	if (!(await adminBotEnabled(db))) return { skipped: 'off' };
	if (!token && !send) return { skipped: 'token' };
	if (!isDailyTime(now)) return { skipped: 'hour' };
	const dayRecipients = await noticeRecipients(db, 'dia_evento');
	const reminderRecipients = await noticeRecipients(db, 'recordatorios');
	if (dayRecipients.length === 0 && reminderRecipients.length === 0) return { skipped: 'nobody' };

	const today = argentinaDate(now);
	const tomorrow = argentinaDate(now + DAY_MS);
	const all = await list();
	const configs = new Map(all.map((e) => [e.slug, e.config]));
	const choices = adminEventChoices(all, now).filter((c) => {
		if (c.cancelled) return false;
		const day = argentinaDate(Date.parse(c.start));
		return day === today || day === tomorrow;
	});
	const out = { sent: 0, failed: 0, events: 0 };
	if (choices.length === 0) return out;

	const overrides = await botTextOverrides(db);
	const sender = send ?? adminSender(/** @type {string} */ (token), fetchFn, overrides);
	const withVenue = await venues(
		db,
		choices.map((c) => c.slug)
	);
	const dayIds = new Set(dayRecipients.map((r) => r.githubId));
	let budget = ADMIN_NOTICE_BATCH;
	for (const choice of choices) {
		if (budget <= 0) break;
		const config = configs.get(choice.slug);
		if (!config) continue;
		const isToday = argentinaDate(Date.parse(choice.start)) === today;
		const missing = missingOf(config, {
			hasVenue: withVenue.has(choice.slug),
			hasStream: config.online ? Boolean(await getStreamLink(db, choice.slug)) : false
		});
		const somethingMissing = missing.place || missing.stream;
		/** @type {{ key: string, recipients: typeof dayRecipients, build: (s: EventStatus) => string }[]} */
		const notices = [];
		if (isToday) {
			notices.push({
				key: `dia:${today}:${choice.slug}`,
				recipients: dayRecipients,
				build: (status) =>
					eventDayText(
						{ title: choice.title, start: choice.start, status, missing },
						now,
						overrides
					)
			});
			if (somethingMissing) {
				notices.push({
					key: `falta:${today}:${choice.slug}`,
					recipients: reminderRecipients.filter((r) => !dayIds.has(r.githubId)),
					build: (status) =>
						reminderText(
							{ kind: 'falta', title: choice.title, start: choice.start, status, missing },
							now,
							overrides
						)
				});
			}
		} else {
			notices.push({
				key: `manana:${today}:${choice.slug}`,
				recipients: reminderRecipients,
				build: (status) =>
					reminderText(
						{ kind: 'manana', title: choice.title, start: choice.start, status, missing },
						now,
						overrides
					)
			});
		}
		/** @type {EventStatus | null} */
		let status = null;
		let counted = false;
		for (const notice of notices) {
			if (budget <= 0) break;
			const pendingFor = [];
			for (const r of notice.recipients) {
				const done = await db
					.prepare(
						'SELECT 1 AS ok FROM telegram_admin_sent WHERE github_id = ?1 AND notice_key = ?2'
					)
					.bind(r.githubId, notice.key)
					.first();
				if (!done) pendingFor.push(r);
			}
			if (pendingFor.length === 0) continue;
			status ??= await eventStatus(db, choice.slug, config, now);
			if (!counted) {
				out.events += 1;
				counted = true;
			}
			const r = await deliverOnce({
				db,
				send: sender,
				key: notice.key,
				message: { text: notice.build(status), panelUrl: panelUrl(origin, choice.slug) },
				now,
				recipients: pendingFor.slice(0, budget)
			});
			budget -= r.sent + r.failed;
			out.sent += r.sent;
			out.failed += r.failed;
		}
	}
	return out;
}
