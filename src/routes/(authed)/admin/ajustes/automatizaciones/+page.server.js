/**
 * Ajustes → Automatizaciones: todo lo que corre solo (crons, mails programados, bot de Telegram y,
 * más adelante, reglas), solo para mirar. La lógica está en $lib/server/admin/automatizaciones.js.
 * Solo admins. Nunca muestra secretos (del bot, solo si están cargados) ni a quién se le mandó algo.
 */
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { getSalesSettings } from '$lib/server/tickets/settings.js';
import { loadAutomations } from '$lib/server/admin/automatizaciones.js';

/** Los interruptores que cambian qué corre. */
const FLAG_KEYS = /** @type {const} */ (['lo_que_sigo', 'cuentas', 'telegram_bot']);

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
	return { dbAvailable: Boolean(db), now, ...automations };
}
