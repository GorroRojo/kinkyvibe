/**
 * POST /api/cron/vigilancia: lo llama cada hora el cron del Worker (src/lib/server/scheduled.js,
 * `WATCH_CRON`). Mira que las tareas programadas anden y, si alguna no terminó bien en su plazo,
 * avisa por Telegram a les admins que prendieron «Fallas del sitio»
 * (src/lib/server/vigilancia/avisos.js, `runCronWatch`). También borra los conteos de errores de
 * más de 7 días (src/lib/server/vigilancia/errores.js). Una vez por día (la corrida de las 10, hora
 * de Argentina), si PayPal está prendido pero sin una cotización reciente (y por eso no se
 * ofrece), avisa con «Fallas en compras» (`paypal_cotizacion`, docs/paypal.md). Nunca tira: un
 * problema queda en el log.
 *
 * Protegido igual que /api/cron/recordatorios: header `x-cron-secret` = CRON_SECRET.
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';
import { MIN_CRON_SECRET_LENGTH, isValidCronSecret } from '$lib/server/cron.js';
import { runCronWatch } from '$lib/server/vigilancia/avisos.js';
import { pruneErrorCounts } from '$lib/server/vigilancia/errores.js';
import { paypalRateMissing } from '$lib/server/paypal/payments.js';
import { reportPurchaseFailure } from '$lib/server/telegram/purchaseAlerts.js';
import { siteOrigin } from '$lib/server/tickets/index.js';

/** La hora (UTC) de la corrida que revisa la cotización de PayPal: las 10 de Argentina. */
const PAYPAL_RATE_CHECK_UTC_HOUR = 13;

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform, fetch, url }) {
	const secret = env.CRON_SECRET;
	if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) {
		return json({ error: 'CRON_SECRET no está configurado' }, { status: 503 });
	}
	if (!(await isValidCronSecret(request.headers.get('x-cron-secret'), secret))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const db = getDB(platform);
	if (!db) return json({ error: 'sin base de datos' }, { status: 503 });
	const now = Date.now();
	const crons = await runCronWatch({ db, now, token: env.TELEGRAM_BOT_TOKEN, fetch });
	let errorRowsDeleted = null;
	try {
		errorRowsDeleted = await pruneErrorCounts(db, now);
	} catch (error) {
		logDBError('vigilancia: borrar conteos de errores viejos', error);
	}
	let paypalRateStale = false;
	if (new Date(now).getUTCHours() === PAYPAL_RATE_CHECK_UTC_HOUR) {
		paypalRateStale = await paypalRateMissing(db, now);
		if (paypalRateStale) {
			await reportPurchaseFailure({
				db,
				platform,
				code: 'paypal_cotizacion',
				origin: siteOrigin(url),
				fetch,
				now
			});
		}
	}
	return json(
		{ crons: crons ?? { stale: [] }, errorRowsDeleted, paypalRateStale },
		{ headers: { 'cache-control': 'no-store' } }
	);
}
