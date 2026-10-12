/**
 * Mensajes › Lo que sigo: el estado de «Lo que sigo» (docs/lo-que-sigo.md) para mirar. Los
 * interruptores, cuánta gente sigue qué (en números), los avisos que salieron, cómo va el paso de
 * «Avisame si se repite», Telegram y «Lo más seguido». Solo admins; no cambia nada.
 *
 * Nunca llega al navegador quién sigue qué: `followStats` solo devuelve totales y, por cada cosa
 * seguida, cuántas cuentas la siguen. Lo de cada persona está en su ficha (decisión 0043). Del bot,
 * solo si el secreto y el token están cargados (sí/no), nunca su valor.
 *
 * Se ve también con el interruptor apagado: así se mira el estado antes de prenderlo.
 */
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { MIN_WEBHOOK_SECRET_LENGTH } from '$lib/server/telegram/webhook.js';
import { followStats } from '$lib/server/sigo/stats.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const now = Date.now();
	const [sigoOn, botOn, tags] = await Promise.all([
		isFlagOn(db, 'lo_que_sigo'),
		isFlagOn(db, 'telegram_bot'),
		siteTagManager(platform)
	]);
	return {
		dbAvailable: Boolean(db),
		now,
		flags: { lo_que_sigo: sigoOn, telegram_bot: botOn },
		// Como Automatizaciones: si están cargados, nunca el valor.
		telegramConfig: {
			secretOk: String(env.TELEGRAM_WEBHOOK_SECRET ?? '').length >= MIN_WEBHOOK_SECRET_LENGTH,
			tokenOk: Boolean(String(env.TELEGRAM_BOT_TOKEN ?? '').trim())
		},
		stats: await followStats(db, { tags, now })
	};
}
