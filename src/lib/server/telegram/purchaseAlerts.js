/**
 * «⚠️ Falló una compra» (plan `errores-alertas`, docs/telegram.md «Fallas en compras»): cuando
 * algo del camino de una compra falla (reservar, crear el pago en Mercado Pago, leer o aplicar un
 * pago del webhook, un pago que no coincide con la orden, emitir entradas gratis o el mail con
 * las entradas), le llega un aviso por Telegram a les admins que prendieron «Fallas en compras» en
 * «🔔 Mis avisos». Sin Worker aparte, sin tocar el panel de Cloudflare y sin migración.
 *
 * Reglas:
 *
 * - **Las de los demás avisos de admins** (adminNotify.js, decisión 0041): solo a quien lo prendió,
 *   vinculade y todavía en `ADMINS`; nada sin el bot y «Telegram para admins» prendidos ni sin
 *   `TELEGRAM_BOT_TOKEN`; en el horario de silencio, sin sonido.
 * - **Sin datos de compradores**: el aviso lleva solo qué falló, el código de la falla y la
 *   referencia de la orden (`KV-…`), con el link a la orden en el panel. Ni nombres, ni mails, ni
 *   montos, ni el mensaje del error (que puede traer cualquier cosa).
 * - **Uno por falla cada media hora** ({@link THROTTLE_SECONDS}): por cada código, una fila de
 *   `telegram_admin_sent` por ventana fija de media hora (`falla:<código>:<ventana>`), tomada con
 *   el mismo `INSERT … ON CONFLICT DO NOTHING` que los demás avisos: dos fallas a la vez no mandan
 *   dos avisos. El aviso dice cuántas van en esa ventana (un contador en `rate_limits`).
 * - **Tope por día** ({@link DAILY_CAP} por admin, día de Argentina): si algo se rompe del todo, no
 *   llena el chat. Lo que no se avisa queda en los registros.
 * - **Nunca tira**: un problema con Telegram o con la base no puede trabar una compra. Si lo que
 *   falla es la base, el aviso tampoco sale (no hay a quién leer); queda la línea en los registros.
 *
 * Además, cada falla deja una línea JSON en los registros (`area: 'compra'`), para buscarla en
 * Workers Logs con el código.
 */
import { env } from '$env/dynamic/private';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { orderReference } from '$lib/utils/tickets.js';
import { adminBotEnabled, noticeRecipients } from './adminData.js';
import { adminSender, argentinaDate, claimNotice, releaseNotice } from './adminNotify.js';
import { isQuietHour } from './quiet.js';
import { isHttps } from './screens.js';
import { botText, botTextOverrides } from './texts.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/botTexts.js').BotTexts} BotTexts */
/** @typedef {import('./adminNotify.js').AdminSend} AdminSend */

/**
 * Las fallas que se avisan, con lo que dice el aviso. El código es corto y estable: aparece en el
 * aviso y en la línea de los registros.
 */
export const PURCHASE_FAILURES = Object.freeze({
	reserva: 'no se pudo reservar la compra',
	mp_preferencia: 'no se pudo crear el pago en Mercado Pago',
	mp_pago: 'el webhook no pudo leer un pago de Mercado Pago',
	pago: 'no se pudo aplicar un pago a su orden',
	pago_no_coincide: 'un pago no coincide con su orden (monto o medio de pago)',
	gratis: 'no se pudieron emitir entradas gratis',
	mail_entradas: 'no salió el mail con las entradas de una compra aprobada'
});

/** @typedef {keyof typeof PURCHASE_FAILURES} PurchaseFailure */

/** Como mucho un aviso por código en cada ventana de este largo (fija, alineada a la hora). */
export const THROTTLE_SECONDS = 30 * 60;

/** Avisos de fallas por admin y por día de Argentina, como mucho. */
export const DAILY_CAP = 12;

/** Argentina no tiene horario de verano: siempre UTC−3. */
const AR_OFFSET = '-03:00';

/** @param {unknown} code @returns {code is PurchaseFailure} */
export const isPurchaseFailure = (code) =>
	typeof code === 'string' && Object.prototype.hasOwnProperty.call(PURCHASE_FAILURES, code);

/**
 * El comienzo de la ventana de {@link THROTTLE_SECONDS} de `now`, en milisegundos.
 *
 * @param {number} now
 */
export function throttleWindow(now) {
	const ms = THROTTLE_SECONDS * 1000;
	return now - (now % ms);
}

/** «14:30», hora de Argentina. @param {number} ms */
const argentinaClock = (ms) =>
	new Intl.DateTimeFormat('es-AR', {
		timeZone: 'America/Argentina/Buenos_Aires',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(new Date(ms));

/**
 * El texto del aviso. Solo el código, qué falló, la referencia de la orden y cuántas van: nada
 * de quien compra.
 *
 * @param {{ code: PurchaseFailure, reference: string | null, count: number, since: number }} input
 * @param {BotTexts | null} [overrides]
 */
export function purchaseFailureText({ code, reference, count, since }, overrides) {
	return botText(
		'admin.falla_compra',
		{
			falla: PURCHASE_FAILURES[code],
			codigo: code,
			orden: reference ?? botText('admin.falla_sin_orden', {}, overrides),
			veces: Math.max(1, count),
			desde: argentinaClock(since)
		},
		overrides
	);
}

/**
 * El link del aviso: la orden en el panel (`#orden-<id>` la marca y cambia el filtro si hace
 * falta) o, sin orden, las ventas. Solo con un origen https (Telegram no acepta otros botones).
 *
 * @param {string} origin
 * @param {{ id: string, event_slug: string } | null | undefined} order
 */
export function failurePanelUrl(origin, order) {
	if (!isHttps(origin)) return null;
	return order
		? `${origin}/admin/eventos/${encodeURIComponent(order.event_slug)}/ordenes#orden-${encodeURIComponent(order.id)}`
		: `${origin}/admin/ventas`;
}

/**
 * ¿Le admin ya llegó al tope de hoy? Cuenta sus filas `falla:` desde las 0 de Argentina.
 *
 * @param {D1Database} db
 * @param {number} githubId
 * @param {number} now
 */
async function overDailyCap(db, githubId, now) {
	const dayStart = Date.parse(`${argentinaDate(now)}T00:00:00${AR_OFFSET}`);
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM telegram_admin_sent
			WHERE github_id = ?1 AND notice_key LIKE 'falla:%' AND sent_at >= ?2`
		)
		.bind(githubId, dayStart)
		.first();
	return Number(row?.n ?? 0) >= DAILY_CAP;
}

/**
 * Cuenta la falla (`rate_limits`, por código y ventana) y avisa a quienes lo prendieron, una vez
 * por código y ventana, sin pasar el tope del día.
 *
 * @param {{ db: D1Database, code: PurchaseFailure,
 *   order?: { id: string, event_slug: string } | null, origin: string, send: AdminSend,
 *   now?: number, overrides?: BotTexts | null }} input
 * @returns {Promise<{ count: number, sent: number, failed: number, skipped: number }>}
 */
export async function notifyPurchaseFailure({
	db,
	code,
	order = null,
	origin,
	send,
	now = Date.now(),
	overrides = null
}) {
	const { hits } = await hitRateLimit(
		db,
		`falla-compra:${code}`,
		{ limit: Number.MAX_SAFE_INTEGER, windowSeconds: THROTTLE_SECONDS },
		now
	);
	const out = { count: hits, sent: 0, failed: 0, skipped: 0 };
	const recipients = await noticeRecipients(db, 'fallas_compra');
	if (recipients.length === 0) return out;
	const since = throttleWindow(now);
	const key = `falla:${code}:${since}`;
	const message = {
		text: purchaseFailureText(
			{ code, reference: order ? orderReference(order.id) : null, count: hits, since },
			overrides
		),
		panelUrl: failurePanelUrl(origin, order),
		silent: isQuietHour(now)
	};
	for (const r of recipients) {
		if (await overDailyCap(db, r.githubId, now)) {
			out.skipped += 1;
			continue;
		}
		if (!(await claimNotice(db, r.githubId, key, now))) {
			out.skipped += 1;
			continue;
		}
		const result = await send(r.telegramUserId, message);
		if (result === 'failed') {
			out.failed += 1;
			await releaseNotice(db, r.githubId, key);
		} else if (result === 'blocked') {
			out.failed += 1;
		} else {
			out.sent += 1;
		}
	}
	return out;
}

/**
 * Para los flujos de compra: deja la línea en los registros y manda el aviso **en segundo plano**
 * (con `waitUntil` si la plataforma lo tiene). **Nunca tira.** Sin los interruptores o sin token,
 * solo la línea en los registros (y el contador).
 *
 * @param {{ db: D1Database | null | undefined, platform?: App.Platform, code: PurchaseFailure,
 *   order?: { id: string, event_slug: string } | null, origin: string, fetch?: typeof fetch,
 *   now?: number }} input
 */
export async function reportPurchaseFailure({
	db,
	platform,
	code,
	order = null,
	origin,
	fetch: fetchFn,
	now = Date.now()
}) {
	const reference = order?.id ? orderReference(order.id) : null;
	console.error(JSON.stringify({ area: 'compra', falla: code, orden: reference ?? undefined }));
	const task = (async () => {
		try {
			if (!db || !isPurchaseFailure(code)) return;
			const token = env.TELEGRAM_BOT_TOKEN;
			const on = Boolean(token) && (await adminBotEnabled(db));
			if (!on) {
				// Igual se cuenta, para que el aviso diga cuántas van si alguien lo prende.
				await hitRateLimit(
					db,
					`falla-compra:${code}`,
					{ limit: Number.MAX_SAFE_INTEGER, windowSeconds: THROTTLE_SECONDS },
					now
				);
				return;
			}
			const overrides = await botTextOverrides(db);
			await notifyPurchaseFailure({
				db,
				code,
				order,
				origin,
				now,
				overrides,
				send: adminSender(/** @type {string} */ (token), fetchFn ?? fetch, overrides)
			});
		} catch (error) {
			console.error(
				`[telegram] aviso de falla en una compra (${code}) no salió:`,
				/** @type {Error} */ (error)?.name
			);
		}
	})();
	const ctx = platform?.ctx;
	if (ctx?.waitUntil) ctx.waitUntil(task);
	else await task;
}
