/**
 * El menú «/» del bot se registra solo (pedido de gorrite, 11/10): el cron de cada 15 minutos
 * (`/api/cron/recordatorios`) arma las listas que habría que registrar (`commandPayloads`, con el
 * interruptor `lo_que_sigo`), les saca un hash y lo compara con el último registrado, guardado en
 * `ticket_settings` (el mismo almacén clave-valor que ya usan el Fondo y los ajustes de venta; sin
 * tabla nueva). Si cambió y hay token, manda los `setMyCommands`, guarda el hash y lo anota en el
 * registro de actividad (`telegram.commands`, «automático»). Idempotente: si no cambió nada, no
 * llama a Telegram.
 *
 * - Sin token: no hace nada.
 * - Si Telegram falla: lo loguea (sin el token, ver `callTelegramApi`), **no** guarda el hash (así
 *   se reintenta en la próxima corrida) y nunca tira.
 * - El botón «Actualizar comandos del bot» sigue: registra ya y también guarda el hash («manual»).
 */
import { logAdminAction } from '$lib/server/admin/audit.js';
import { sha256Hex } from '$lib/server/hash.js';
import { isFlagOn } from '$lib/server/flags.js';
import { commandPayloads, registerBotCommands } from './commands.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ hash: string, at: number, by: 'automático' | 'manual' }} CommandsSync */

/** La clave en `ticket_settings`. */
export const COMMANDS_SYNC_KEY = 'telegram_commands_sync';

/** Quién figura en el registro cuando lo hace el cron. */
export const AUTO_ACTOR = 'automático';

/**
 * El hash de lo que se registraría (los tres alcances, en orden).
 *
 * @param {{ accounts: boolean }} opts
 */
export function commandsHash({ accounts }) {
	return sha256Hex(JSON.stringify(commandPayloads({ accounts })));
}

/**
 * El último registro guardado, o `null`.
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<CommandsSync | null>}
 */
export async function getCommandsSync(db) {
	if (!db) return null;
	try {
		const row = await db
			.prepare('SELECT value FROM ticket_settings WHERE key = ?1')
			.bind(COMMANDS_SYNC_KEY)
			.first();
		if (!row) return null;
		const v = JSON.parse(String(row.value));
		if (typeof v?.hash !== 'string' || !Number.isFinite(v?.at)) return null;
		return { hash: v.hash, at: Number(v.at), by: v.by === 'manual' ? 'manual' : AUTO_ACTOR };
	} catch {
		return null;
	}
}

/**
 * Guarda el registro (después de que Telegram aceptó los tres alcances).
 *
 * @param {D1Database} db
 * @param {CommandsSync} sync
 * @param {string} updatedBy quién (login de le admin o «automático»)
 */
export async function storeCommandsSync(db, sync, updatedBy) {
	await db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4`
		)
		.bind(COMMANDS_SYNC_KEY, JSON.stringify(sync), sync.at, updatedBy)
		.run();
}

/**
 * Lo que hace el cron. Nunca tira.
 *
 * @param {{ db: D1Database | null | undefined, token: string | undefined, now?: number,
 *   fetch?: typeof fetch }} input
 * @returns {Promise<'no_token' | 'no_db' | 'unchanged' | 'synced' | 'failed'>}
 */
export async function syncBotCommands({ db, token, now = Date.now(), fetch: fetchFn }) {
	const clean = String(token ?? '').trim();
	if (!clean) return 'no_token';
	if (!db) return 'no_db';
	try {
		const accounts = await isFlagOn(db, 'lo_que_sigo');
		const hash = await commandsHash({ accounts });
		const stored = await getCommandsSync(db);
		if (stored?.hash === hash) return 'unchanged';
		const r = await registerBotCommands({ token: clean, accounts, fetch: fetchFn });
		const results = 'results' in r ? r.results : [];
		if (!r.ok) {
			// Los errores ya vienen sin el token (callTelegramApi). Sin guardar: se reintenta.
			const errors = results.filter((x) => !x.ok).map((x) => `${x.scope}: ${x.error ?? ''}`);
			console.error(`[telegram] comandos automáticos: falló (${errors.join('; ')})`);
			return 'failed';
		}
		await storeCommandsSync(db, { hash, at: now, by: AUTO_ACTOR }, AUTO_ACTOR);
		await logAdminAction(
			db,
			{ user: { login: AUTO_ACTOR } },
			{
				action: 'telegram.commands',
				targetType: 'settings',
				targetId: 'telegram:commands',
				summary: 'Actualizó los comandos del bot de Telegram (automático)',
				detail: {
					ok: true,
					auto: true,
					scopes: results.map((x) => ({ scope: x.scope, commands: x.commands, ok: x.ok }))
				}
			},
			{ now }
		);
		console.log('[telegram] comandos automáticos: registrados');
		return 'synced';
	} catch (error) {
		console.error('[telegram] comandos automáticos: error', /** @type {Error} */ (error)?.name);
		return 'failed';
	}
}
