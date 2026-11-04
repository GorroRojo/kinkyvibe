/**
 * Los avisos «Fallas del sitio» por Telegram (gorrite, 3/11, tarjeta «conf-avisos-destino»: si algo
 * falla de noche, el aviso va por el bot de admins). Detalle en docs/workers-migracion.md,
 * «Avisos de fallas por Telegram». Mismo molde que el de «Cambios de Claude»
 * (../mcp/avisoCambios.js):
 *
 * - **A quién**: les admins vinculades, que siguen en `ADMINS` y prendieron «Fallas del sitio» en
 *   «🔔 Mis avisos» (apagado por defecto, como todos), con el bot y «Telegram para admins»
 *   prendidos y `TELEGRAM_BOT_TOKEN`. En el horario de silencio sale igual, sin sonido.
 * - **Errores** ({@link queueErrorAlert}): cada respuesta 5xx suma en `error_counts`
 *   (./errores.js) y, si en la última hora se llegó a un umbral, sale el aviso. Una vez por hora
 *   como mucho (bucket {@link ERROR_ALERT_BUCKET} de `rate_limits`, sin datos de nadie).
 * - **Tareas programadas** ({@link runCronWatch}): los crons que no terminaron bien en su plazo
 *   (./crons.js). Una vez cada {@link CRON_ALERT_WINDOW_MS} como mucho (bucket
 *   {@link CRON_ALERT_BUCKET}): una tarea parada no avisa cada hora toda la noche.
 * - Si no le llegó a nadie (Telegram falló), el aviso se suelta y el próximo error (o la próxima
 *   vuelta de la vigilancia) reintenta.
 * - **Nunca traba nada**: los errores se cuentan y avisan en segundo plano (`waitUntil`) y
 *   cualquier problema (sin la tabla, sin Telegram, la base caída) solo queda en el log.
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { adminBotEnabled, noticeRecipients } from '$lib/server/telegram/adminData.js';
import { adminSender, errorBurstText, staleCronsText } from '$lib/server/telegram/adminNotify.js';
import { isQuietHour } from '$lib/server/telegram/quiet.js';
import { botTextOverrides } from '$lib/server/telegram/texts.js';
import { alertKind, recentErrors, recordServerError, routeLabel } from './errores.js';
import { staleCrons } from './crons.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/telegram/adminNotify.js').AdminSend} AdminSend */
/** @typedef {import('$lib/server/telegram/adminNotify.js').AdminMessage} AdminMessage */
/** @typedef {import('$lib/utils/botTexts.js').BotTexts} BotTexts */

/** El tipo de aviso de «🔔 Mis avisos». */
export const NOTICE_KIND = 'fallas_sitio';

/** El bucket de `rate_limits` que marca que ya salió el aviso de errores (sin datos de nadie). */
export const ERROR_ALERT_BUCKET = 'aviso-fallas-errores';
/** Cada cuánto, como mucho, el aviso de errores. */
export const ERROR_ALERT_WINDOW_MS = 60 * 60 * 1000;
/** El bucket de `rate_limits` del aviso de tareas programadas. */
export const CRON_ALERT_BUCKET = 'aviso-fallas-crons';
/** Cada cuánto, como mucho, el aviso de tareas programadas. */
export const CRON_ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Toma el aviso de esta ventana: `true` si no salió ninguno en la ventana (y ahora queda
 * marcado). Una sola sentencia, así dos pedidos a la vez no mandan dos avisos.
 *
 * @param {D1Database} db
 * @param {string} bucket
 * @param {number} windowMs
 * @param {number} now
 */
export async function claimAlert(db, bucket, windowMs, now) {
	const seconds = Math.floor(now / 1000);
	const res = await db
		.prepare(
			`INSERT INTO rate_limits (bucket, window_start, hits)
			SELECT ?1, ?2, 1
			WHERE NOT EXISTS (
				SELECT 1 FROM rate_limits WHERE bucket = ?1 AND window_start > ?3
			)`
		)
		.bind(bucket, seconds, seconds - Math.floor(windowMs / 1000))
		.run();
	return res.meta.changes === 1;
}

/**
 * Suelta el aviso tomado (no le llegó a nadie: el próximo reintenta).
 *
 * @param {D1Database} db
 * @param {string} bucket
 * @param {number} now
 */
async function releaseAlert(db, bucket, now) {
	await db
		.prepare('DELETE FROM rate_limits WHERE bucket = ?1 AND window_start = ?2')
		.bind(bucket, Math.floor(now / 1000))
		.run();
}

/**
 * Manda `text` a quienes prendieron «Fallas del sitio», si no salió otro en la ventana. `null`: no
 * había a quién o ya había salido.
 *
 * @param {{ db: D1Database, send: AdminSend, now: number, bucket: string, windowMs: number,
 *   text: () => string }} input
 * @returns {Promise<{ sent: number, failed: number } | null>}
 */
async function deliver({ db, send, now, bucket, windowMs, text }) {
	const recipients = await noticeRecipients(db, NOTICE_KIND);
	if (recipients.length === 0) return null;
	if (!(await claimAlert(db, bucket, windowMs, now))) return null;
	/** @type {AdminMessage} */
	const message = { text: text(), panelUrl: null, silent: isQuietHour(now) };
	const out = { sent: 0, failed: 0 };
	for (const r of recipients) {
		const result = await send(r.telegramUserId, message);
		if (result === 'sent') out.sent += 1;
		else out.failed += 1;
	}
	if (out.sent === 0) await releaseAlert(db, bucket, now);
	return out;
}

/**
 * Mira los errores de la última hora y, si llegaron a un umbral (./errores.js) y no salió otro
 * aviso en la última hora, se lo manda a quienes lo prendieron.
 *
 * @param {{ db: D1Database, send: AdminSend, now?: number, overrides?: BotTexts | null }} input
 * @returns {Promise<{ sent: number, failed: number } | null>} `null`: no correspondía mandar
 */
export async function notifyErrors({ db, send, now = Date.now(), overrides = null }) {
	const recent = await recentErrors(db, now);
	const kind = alertKind(recent);
	if (!kind) return null;
	return deliver({
		db,
		send,
		now,
		bucket: ERROR_ALERT_BUCKET,
		windowMs: ERROR_ALERT_WINDOW_MS,
		text: () => errorBurstText({ kind, ...recent }, overrides)
	});
}

/**
 * Mira las tareas programadas y, si alguna no terminó bien en su plazo y no salió otro aviso en la
 * ventana, se lo manda a quienes lo prendieron.
 *
 * @param {{ db: D1Database, send: AdminSend, now?: number, overrides?: BotTexts | null }} input
 * @returns {Promise<{ stale: string[], sent: number, failed: number } | null>} `null`: todas andan
 */
export async function notifyStaleCrons({ db, send, now = Date.now(), overrides = null }) {
	const stale = await staleCrons(db, now);
	if (stale.length === 0) return null;
	const r = await deliver({
		db,
		send,
		now,
		bucket: CRON_ALERT_BUCKET,
		windowMs: CRON_ALERT_WINDOW_MS,
		text: () => staleCronsText(stale, overrides)
	});
	return { stale: stale.map((s) => s.cron), sent: r?.sent ?? 0, failed: r?.failed ?? 0 };
}

/**
 * El que manda por Telegram, o `null` si no hay token o el bot de admins está apagado.
 *
 * @param {D1Database} db
 * @param {{ token?: string, send?: AdminSend, fetch?: typeof fetch }} opts
 * @returns {Promise<{ send: AdminSend, overrides: BotTexts | null } | null>}
 */
async function sender(db, opts) {
	const token = opts.token ?? env.TELEGRAM_BOT_TOKEN;
	if (!token && !opts.send) return null;
	if (!(await adminBotEnabled(db))) return null;
	const overrides = await botTextOverrides(db);
	return {
		send: opts.send ?? adminSender(String(token), opts.fetch ?? fetch, overrides),
		overrides
	};
}

/**
 * Lo que corre la vigilancia de los crons (`/api/cron/vigilancia`, cada hora, y
 * `/api/cron/recordatorios`, cada 15 minutos): mira las tareas programadas y avisa. Nunca tira:
 * sin la tabla o con la base caída, lo deja en el log y devuelve `null`. Sin Telegram, igual
 * revisa (y lo deja en el log).
 *
 * @param {{ db: D1Database, now?: number, token?: string, send?: AdminSend,
 *   fetch?: typeof fetch }} input
 * @returns {Promise<{ stale: string[], sent: number, failed: number } | null>}
 */
export async function runCronWatch({ db, now = Date.now(), ...opts }) {
	try {
		const out = await sender(db, opts);
		if (!out) {
			const stale = await staleCrons(db, now);
			if (stale.length === 0) return null;
			console.error(
				`[vigilancia] tareas programadas sin terminar bien: ${stale.map((s) => s.cron).join(', ')} (sin aviso por Telegram)`
			);
			return { stale: stale.map((s) => s.cron), sent: 0, failed: 0 };
		}
		const r = await notifyStaleCrons({ db, now, send: out.send, overrides: out.overrides });
		if (r) {
			console.error(`[vigilancia] tareas programadas sin terminar bien: ${r.stale.join(', ')}`);
		}
		return r;
	} catch (error) {
		console.warn(
			'[vigilancia] no se pudieron revisar las tareas programadas:',
			/** @type {Error} */ (error)?.message ?? error
		);
		return null;
	}
}

/**
 * Cuenta un error 5xx y, si corresponde, avisa: **en segundo plano** (con `waitUntil` si la
 * plataforma lo tiene) y **sin tirar nunca**.
 *
 * @param {{ db: D1Database | null | undefined, now: number, status: number, route: string,
 *   errorId?: string | null, platform?: App.Platform }} ctx
 * @param {{ send?: AdminSend, token?: string, fetch?: typeof fetch }} [opts] para los tests
 */
export async function queueErrorAlert(ctx, opts = {}) {
	const db = ctx.db;
	if (!db) return;
	const task = (async () => {
		try {
			await recordServerError(db, {
				now: ctx.now,
				route: ctx.route,
				status: ctx.status,
				errorId: ctx.errorId
			});
			const out = await sender(db, opts);
			if (!out) return;
			const r = await notifyErrors({ db, now: ctx.now, send: out.send, overrides: out.overrides });
			if (r && r.sent === 0) {
				console.error('[vigilancia] el aviso de errores no le llegó a nadie por Telegram');
			}
		} catch (error) {
			console.warn(
				'[vigilancia] no se pudo contar o avisar un error:',
				/** @type {Error} */ (error)?.message ?? error
			);
		}
	})();
	const waitUntil = ctx.platform?.ctx?.waitUntil;
	if (waitUntil) waitUntil.call(ctx.platform?.ctx, task);
	else await task;
}

/**
 * El estado de un error tirado: el suyo si es un `error(5xx)` de SvelteKit; un `error(4xx)` o un
 * `redirect` no cuentan (`null`); cualquier otra cosa, 500.
 *
 * @param {unknown} error
 */
function thrownStatus(error) {
	const status = /** @type {any} */ (error)?.status;
	if (typeof status === 'number') return status >= 500 ? status : null;
	return 500;
}

/**
 * Envuelve el `handle` del sitio (src/hooks.server.js) para contar cada respuesta 5xx (también
 * las tiradas: el error sigue su camino) y avisar si hay muchas. Una acción de formulario que
 * marcó su estado con `markFailure` (errorLog.js) cuenta ese estado: con JavaScript, un
 * `fail(502)` llega como 200.
 *
 * @param {import('@sveltejs/kit').Handle} handle
 * @param {{ queue?: typeof queueErrorAlert, now?: () => number }} [opts] para los tests
 * @returns {import('@sveltejs/kit').Handle}
 */
export function countServerErrors(handle, { queue = queueErrorAlert, now = Date.now } = {}) {
	return async (input) => {
		const { event } = input;
		/** @param {number | null} status */
		const report = async (status) => {
			const marked = event.locals?.failureStatus;
			const final = typeof marked === 'number' ? marked : status;
			if (final === null || final < 500 || final > 599) return;
			try {
				await queue({
					db: getDB(event.platform),
					now: now(),
					status: final,
					route: routeLabel(event.route?.id),
					errorId: event.locals?.errorId ?? null,
					platform: event.platform
				});
			} catch {
				// Nunca: queueErrorAlert no tira. Por las dudas, la respuesta sale igual.
			}
		};
		let response;
		try {
			response = await handle(input);
		} catch (error) {
			await report(thrownStatus(error));
			throw error;
		}
		await report(response.status);
		return response;
	};
}
