/**
 * El aviso de «muchos cambios» del conector de Claude (docs/conector-claude.md, «Cambios»). No hay
 * tope de cambios (gorrite, 3/11: «Sin tope: aviso por Telegram si hay muchos cambios en una
 * hora»): cuando en la última hora (ventana móvil) se aplicaron {@link BURST_THRESHOLD} cambios o
 * más, les admins que prendieron «Cambios de Claude» en «🔔 Mis avisos» reciben un mensaje por
 * Telegram.
 *
 * - **Qué cuenta**: las filas `conector.aplicar` de Actividad con `detail.aplicado` (los cambios
 *   que se guardaron; los rechazados no). De ahí salen también les admins que autorizaron (el
 *   login de quien es dueñe de la conexión) y los nombres de «confirmado por». Nada más: ni el
 *   pedido ni datos de compradores.
 * - **Una vez por hora como mucho**: antes de mandar se toma una fila de `rate_limits` (bucket
 *   {@link ALERT_BUCKET}, sin datos de nadie) solo si no hay otra de la última hora, en una sola
 *   sentencia. Si no le llegó a nadie (Telegram falló), se suelta y el próximo cambio reintenta.
 * - **A quién**: como los otros avisos de admins (adminNotify.js): les admins vinculades, que
 *   siguen en `ADMINS` y prendieron el aviso (apagado por defecto, como todos), con el bot y
 *   «Telegram para admins» prendidos y `TELEGRAM_BOT_TOKEN`.
 * - **Nunca traba un cambio**: corre en segundo plano después de guardar, y cualquier problema
 *   (sin Telegram, un error) solo queda en el log.
 */
import { env } from '$env/dynamic/private';
import { adminBotEnabled, noticeRecipients } from '$lib/server/telegram/adminData.js';
import { adminSender, connectorBurstText } from '$lib/server/telegram/adminNotify.js';
import { isQuietHour } from '$lib/server/telegram/quiet.js';
import { isHttps } from '$lib/server/telegram/screens.js';
import { botTextOverrides } from '$lib/server/telegram/texts.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/telegram/adminNotify.js').AdminSend} AdminSend */
/** @typedef {import('$lib/utils/botTexts.js').BotTexts} BotTexts */

/** Desde cuántos cambios aplicados en una hora sale el aviso. */
export const BURST_THRESHOLD = 20;

/** La ventana: la última hora (móvil). */
export const BURST_WINDOW_MS = 60 * 60 * 1000;

/** El bucket de `rate_limits` que marca que ya salió el aviso (sin datos de nadie). */
export const ALERT_BUCKET = 'mcp-aviso-cambios';

/**
 * Los cambios aplicados en la última hora: cuántos, quiénes autorizaron y quiénes confirmaron.
 *
 * @param {D1Database} db
 * @param {number} now
 * @returns {Promise<{ count: number, admins: string[], confirmedBy: string[] }>}
 */
export async function recentApplies(db, now) {
	const { results } = await db
		.prepare(
			`SELECT actor_login, json_extract(detail, '$.confirmado_por') AS confirmed_by
			FROM admin_audit
			WHERE action = 'conector.aplicar' AND at > ?1 AND at <= ?2
				AND json_valid(detail) AND json_extract(detail, '$.aplicado') = 1
			ORDER BY at`
		)
		.bind(now - BURST_WINDOW_MS, now)
		.all();
	const admins = new Set();
	const confirmedBy = new Set();
	for (const r of results) {
		if (r.actor_login) admins.add(String(r.actor_login));
		if (typeof r.confirmed_by === 'string' && r.confirmed_by.trim()) {
			confirmedBy.add(r.confirmed_by.trim());
		}
	}
	return { count: results.length, admins: [...admins], confirmedBy: [...confirmedBy] };
}

/**
 * Toma el aviso de esta hora: `true` si no salió ninguno en la última hora (y ahora queda
 * marcado). Una sola sentencia, así dos cambios a la vez no mandan dos avisos.
 *
 * @param {D1Database} db
 * @param {number} now
 */
export async function claimAlert(db, now) {
	const seconds = Math.floor(now / 1000);
	const res = await db
		.prepare(
			`INSERT INTO rate_limits (bucket, window_start, hits)
			SELECT ?1, ?2, 1
			WHERE NOT EXISTS (
				SELECT 1 FROM rate_limits WHERE bucket = ?1 AND window_start > ?3
			)`
		)
		.bind(ALERT_BUCKET, seconds, seconds - BURST_WINDOW_MS / 1000)
		.run();
	return res.meta.changes === 1;
}

/**
 * Suelta el aviso tomado (no le llegó a nadie: el próximo cambio reintenta).
 *
 * @param {D1Database} db
 * @param {number} now
 */
async function releaseAlert(db, now) {
	await db
		.prepare('DELETE FROM rate_limits WHERE bucket = ?1 AND window_start = ?2')
		.bind(ALERT_BUCKET, Math.floor(now / 1000))
		.run();
}

/**
 * Mira los cambios de la última hora y, si llegaron a {@link BURST_THRESHOLD} y no salió otro
 * aviso en la última hora, se lo manda a quienes lo prendieron.
 *
 * @param {{ db: D1Database, send: AdminSend, origin: string, now?: number,
 *   overrides?: BotTexts | null, threshold?: number }} input
 * @returns {Promise<{ sent: number, failed: number } | null>} `null`: no correspondía mandar
 */
export async function notifyBurst({
	db,
	send,
	origin,
	now = Date.now(),
	overrides = null,
	threshold = BURST_THRESHOLD
}) {
	const recent = await recentApplies(db, now);
	if (recent.count < threshold) return null;
	const recipients = await noticeRecipients(db, 'conector_claude');
	if (recipients.length === 0) return null;
	if (!(await claimAlert(db, now))) return null;
	const message = {
		text: connectorBurstText(recent, overrides),
		panelUrl: isHttps(origin) ? `${origin}/admin/ajustes/actividad` : null,
		silent: isQuietHour(now)
	};
	const out = { sent: 0, failed: 0 };
	for (const r of recipients) {
		const result = await send(r.telegramUserId, message);
		if (result === 'sent') out.sent += 1;
		else out.failed += 1;
	}
	if (out.sent === 0) await releaseAlert(db, now);
	return out;
}

/**
 * Lo que llama ./rpc.js después de cada cambio aplicado: el aviso **en segundo plano** (con
 * `waitUntil` si la plataforma lo tiene) y **sin tirar nunca**. Sin los interruptores del bot o
 * sin token, no hace nada.
 *
 * @param {{ db: D1Database, origin: string, now: number, platform?: App.Platform,
 *   fetch?: typeof fetch }} ctx
 * @param {{ send?: AdminSend, token?: string }} [opts] para los tests
 */
export async function queueBurstAlert(ctx, opts = {}) {
	const task = (async () => {
		try {
			const token = opts.token ?? env.TELEGRAM_BOT_TOKEN;
			if (!token && !opts.send) return;
			if (!(await adminBotEnabled(ctx.db))) return;
			const overrides = await botTextOverrides(ctx.db);
			const r = await notifyBurst({
				db: ctx.db,
				origin: ctx.origin,
				now: ctx.now,
				overrides,
				send: opts.send ?? adminSender(String(token), ctx.fetch ?? fetch, overrides)
			});
			if (r && r.sent === 0) {
				console.error('[conector] el aviso de muchos cambios no le llegó a nadie por Telegram');
			}
		} catch (error) {
			console.error(
				'[conector] el aviso de muchos cambios no salió:',
				/** @type {Error} */ (error)?.name
			);
		}
	})();
	const waitUntil = ctx.platform?.ctx?.waitUntil;
	if (waitUntil) waitUntil.call(ctx.platform?.ctx, task);
	else await task;
}
