/**
 * Salud del webhook del bot (auditoría de confiabilidad, OX5): si Telegram no puede entregarle
 * los mensajes al sitio (el secreto se rotó sin volver a registrar el webhook, la URL cambió, el
 * sitio contesta error), el bot deja de contestar y nadie se entera. Una vez por hora el cron de
 * cada 15 minutos (`/api/cron/recordatorios`) le pide a Telegram `getWebhookInfo` y, si algo no
 * da, lo anota en `ticket_settings` (el almacén clave-valor de los ajustes, sin tabla nueva) y el
 * Inicio del panel lo muestra en «Para revisar». Ver docs/telegram.md, «Salud del webhook».
 *
 * - Hay problema si la URL registrada no es {@link WEBHOOK_URL}, si Telegram anotó un error de
 *   entrega en las últimas 2 horas y todavía hay mensajes esperando, o si hay más de 20 esperando.
 * - Sin token o con el bot apagado no hace nada. Nunca tira. Cuesta un pedido a Telegram por hora.
 * - No llama a `setWebhook`: no arreglaría un secreto rotado (la URL coincide) y pisaría un cambio
 *   de URL hecho a propósito. Volver a registrarlo es `npm run telegram:webhook`.
 * - Se guarda solo qué pasó, cuándo y el mensaje de error de Telegram (sin el token): nada de
 *   personas.
 */
import { rowsOf } from '$lib/server/db/batch.js';
import { callTelegramApi } from './send.js';
import { WEBHOOK_URL } from './updates.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {{ at: number, ok: true } | { at: number, ok: false,
 *   problem: 'url' | 'error' | 'pending', detail: string }} WebhookHealth
 */

/** La clave en `ticket_settings`. */
export const WEBHOOK_HEALTH_KEY = 'telegram_webhook_health';
/** Un error de entrega más viejo que esto ya no cuenta. */
export const RECENT_ERROR_MS = 2 * 60 * 60 * 1000;
/** Más mensajes esperando que esto es un problema. */
export const MAX_PENDING = 20;
/** Un chequeo más viejo que esto no se muestra (si el cron dejó de correr, no queda pegado). */
export const SHOW_MS = 3 * 60 * 60 * 1000;

/**
 * Qué está mal según `getWebhookInfo`, o `null` si nada. Pura.
 *
 * @param {any} info el `result` de `getWebhookInfo`
 * @param {number} now
 * @returns {{ problem: 'url' | 'error' | 'pending', detail: string } | null}
 */
export function webhookProblem(info, now) {
	const url = typeof info?.url === 'string' ? info.url : '';
	if (url !== WEBHOOK_URL) {
		return {
			problem: 'url',
			detail: url ? 'está registrado en otra dirección' : 'no está registrado'
		};
	}
	const pending = Number(info?.pending_update_count ?? 0);
	// Un error reciente cuenta solo si quedaron mensajes sin entregar: Telegram guarda el último
	// error aunque después haya entregado todo (un 502 suelto mientras se publica el sitio).
	const lastError = Number(info?.last_error_date) * 1000;
	if (Number.isFinite(lastError) && lastError > now - RECENT_ERROR_MS && pending > 0) {
		const message = typeof info?.last_error_message === 'string' ? info.last_error_message : '';
		return { problem: 'error', detail: message.slice(0, 200) };
	}
	if (pending > MAX_PENDING) {
		return { problem: 'pending', detail: `${pending} mensajes esperando` };
	}
	return null;
}

/**
 * Lo que hace el cron: una vez por hora (en la corrida de los minutos 0 a 14). Nunca tira.
 *
 * @param {{ db: D1Database | null | undefined, token: string | undefined,
 *   enabled: () => Promise<boolean>, fetch?: typeof fetch, now?: number }} input `enabled`: si el
 *   bot está prendido (se mira solo cuando toca)
 * @returns {Promise<'skipped' | 'ok' | 'problem' | 'failed'>}
 */
export async function checkWebhookHealth({ db, token, enabled, fetch: fetchFn, now = Date.now() }) {
	const clean = String(token ?? '').trim();
	if (!clean || !db || new Date(now).getUTCMinutes() >= 15) return 'skipped';
	try {
		if (!(await enabled())) return 'skipped';
		const r = await callTelegramApi({
			token: clean,
			method: 'getWebhookInfo',
			body: {},
			fetch: fetchFn
		});
		// Telegram no contestó: no se sabe nada del webhook, no se anota (el próximo chequeo dirá).
		if (!r.ok) return 'failed';
		const found = webhookProblem(r.result, now);
		/** @type {WebhookHealth} */
		const health = found ? { at: now, ok: false, ...found } : { at: now, ok: true };
		await db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, 'automático')
				ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = 'automático'`
			)
			.bind(WEBHOOK_HEALTH_KEY, JSON.stringify(health), now)
			.run();
		if (found) {
			console.error(`[telegram] webhook: ${found.problem} (${found.detail})`);
			return 'problem';
		}
		return 'ok';
	} catch (error) {
		console.error('[telegram] webhook: no se pudo revisar', /** @type {Error} */ (error)?.name);
		return 'failed';
	}
}

/**
 * El último chequeo con problema, si es de las últimas {@link SHOW_MS}, o `null` (para la tanda
 * del Inicio, ver $lib/server/db/batch.js).
 *
 * @param {number} now
 * @returns {import('$lib/server/db/batch.js').BatchQuery<WebhookHealth | null>}
 */
export function webhookHealthQuery(now) {
	return {
		what: 'inicio: salud del webhook del bot',
		fallback: null,
		statements: (db) => [
			db.prepare('SELECT value FROM ticket_settings WHERE key = ?1').bind(WEBHOOK_HEALTH_KEY)
		],
		read: (results) => readWebhookHealth(rowsOf(results)[0]?.value, now)
	};
}

/**
 * @param {unknown} value el JSON guardado
 * @param {number} now
 * @returns {WebhookHealth | null} solo si tiene problema y es reciente
 */
export function readWebhookHealth(value, now) {
	if (typeof value !== 'string') return null;
	try {
		const v = JSON.parse(value);
		if (!Number.isFinite(v?.at) || v.at < now - SHOW_MS || v.ok !== false) return null;
		const problem = ['url', 'error', 'pending'].includes(v.problem) ? v.problem : 'error';
		return { at: v.at, ok: false, problem, detail: String(v.detail ?? '').slice(0, 200) };
	} catch {
		return null;
	}
}

/** Dónde se ve el estado del bot en el panel. */
export const WEBHOOK_HEALTH_HREF = '/admin/ajustes/automatizaciones';

/**
 * La fila de «Para revisar», o `null`.
 *
 * @param {WebhookHealth | null | undefined} health
 * @returns {import('$lib/server/admin/inicio.js').ReviewItem | null}
 */
export function webhookHealthItem(health) {
	if (!health || health.ok) return null;
	const why =
		health.problem === 'url'
			? `El webhook ${health.detail}.`
			: health.problem === 'pending'
				? `Telegram tiene ${health.detail}.`
				: `Telegram no le puede entregar los mensajes al sitio${health.detail ? ` («${health.detail}»)` : ''}.`;
	return {
		id: 'telegram-webhook',
		tone: 'bad',
		icon: 'alert',
		title: 'El bot de Telegram no está recibiendo mensajes',
		text: `${why} Quien tiene los secretos del bot tiene que volver a registrar el webhook (npm run telegram:webhook).`,
		action: 'Ver',
		href: WEBHOOK_HEALTH_HREF
	};
}
