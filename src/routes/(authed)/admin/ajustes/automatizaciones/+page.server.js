/**
 * Ajustes → Automatizaciones: todo lo que corre solo (crons, mails programados, bot de Telegram y,
 * más adelante, reglas), para mirar. La lógica está en $lib/server/admin/automatizaciones.js.
 * Solo admins. Nunca muestra secretos (del bot, solo si están cargados) ni a quién se le mandó algo.
 *
 * Una sola acción: `?/comandos`, «Actualizar comandos del bot» (registra en Telegram la lista de
 * $lib/server/telegram/commands.js para el autocompletado; queda en el registro).
 */
import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { registerBotCommands } from '$lib/server/telegram/commands.js';
import { getDB, logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { getSalesSettings } from '$lib/server/tickets/settings.js';
import { loadAutomations } from '$lib/server/admin/automatizaciones.js';

/** Los interruptores que cambian qué corre. */
const FLAG_KEYS = /** @type {const} */ (['lo_que_sigo', 'telegram_bot']);

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	/** @type {Record<string, boolean>} */
	const flags = {};
	for (const key of FLAG_KEYS) flags[key] = await isFlagOn(db, key);
	let salesSettings = null;
	try {
		salesSettings = await getSalesSettings(db);
	} catch (error) {
		logDBError('automatizaciones: ajustes', error);
	}
	const now = Date.now();
	const automations = await loadAutomations({
		db,
		backups: platform?.env?.BACKUPS ?? null,
		env: {
			TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
			TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN
		},
		flags,
		salesSettings,
		now
	});
	return {
		dbAvailable: Boolean(db),
		now,
		// Para el botón «Actualizar comandos del bot»: solo si está cargado, nunca el valor.
		telegramTokenOk: Boolean(String(env.TELEGRAM_BOT_TOKEN ?? '').trim()),
		...automations
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	comandos: async ({ locals, url, platform }) => {
		requireAdmin(locals, url);
		const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim();
		if (!token) {
			return fail(400, {
				commandsError:
					'Falta el token del bot (secret TELEGRAM_BOT_TOKEN en Cloudflare): no se registró nada.'
			});
		}
		const db = getDB(platform);
		// Los de la cuenta solo con «Lo que sigo» (apagado, contestan «todavía no se puede»).
		const accounts = await isFlagOn(db, 'lo_que_sigo');
		const r = await registerBotCommands({ token, accounts });
		const results = 'results' in r ? r.results : [];
		await logAdminAction(db, locals, {
			action: 'telegram.commands',
			targetType: 'settings',
			targetId: 'telegram:commands',
			summary: r.ok
				? 'Actualizó los comandos del bot de Telegram'
				: 'Intentó actualizar los comandos del bot de Telegram (falló)',
			detail: {
				ok: r.ok,
				scopes: results.map((x) => ({ scope: x.scope, commands: x.commands, ok: x.ok }))
			}
		});
		if (!r.ok) {
			return fail(502, {
				commandsError: 'Telegram no aceptó los comandos. No cambió nada de lo que falló.',
				commandsResults: results
			});
		}
		return { commandsOk: true, commandsResults: results };
	}
};
