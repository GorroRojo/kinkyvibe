/**
 * Estadísticas → Bot de Telegram: las estadísticas de uso del bot (decisión 0045,
 * $lib/server/telegram/usoPanel.js, docs/telegram.md «Estadísticas de uso»). Solo admins. Quién lo
 * usó en el período (`?periodo=`, 7, 30 o 90 días; por defecto 30) y, aparte, para qué se usa,
 * sumado por semana (`?semana=AAAA-Wss`, por defecto la actual). Lo buscado y las cosas, solo
 * desde 5 veces por semana (el umbral está en la consulta). Nunca lee las órdenes.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, isMissingTableError, logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { loadBotUsage, titlesFromSource } from '$lib/server/telegram/usoPanel.js';
import { inlineSource } from '$lib/server/telegram/inlineSource.js';
import { VISITS_DEFAULT_PERIOD, VISITS_PERIODS, periodFromUrl } from '$lib/admin/statsPeriod.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const period = periodFromUrl(url, VISITS_PERIODS, VISITS_DEFAULT_PERIOD);
	const db = getDB(platform);
	const enabled = Boolean(db && (await isFlagOn(db, 'telegram_estadisticas')));
	/** @type {import('$lib/server/telegram/usoPanel.js').BotUsage} */
	let usage = { available: false };
	if (db) {
		try {
			usage = await loadBotUsage(db, {
				days: period.days ?? 30,
				week: url.searchParams.get('semana'),
				// Los títulos de las cosas, del índice público (una cosa que ya no es pública queda
				// con su clave).
				titles: async (keys) => titlesFromSource(await inlineSource(platform))(keys)
			});
		} catch (error) {
			if (!isMissingTableError(error)) logDBError('panel: estadísticas del bot', error);
			usage = { available: false };
		}
	}
	return { period: period.id, enabled, usage };
}
