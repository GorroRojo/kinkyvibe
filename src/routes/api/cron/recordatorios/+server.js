/**
 * POST /api/cron/recordatorios: manda una tanda de los mails que tocan: recordatorios (ver
 * $lib/server/tickets/reminders.js) y lo que quede de cada "Enviar el link a todes" (ver
 * `runMailQueue` en $lib/server/tickets/index.js). Con el interruptor `series` prendido, también
 * los avisos de "Avisame si se repite" (ver $lib/server/series/notify.js). Lo llama cada 15 minutos el Worker de
 * workers/cron/; cada corrida sigue donde quedó la anterior.
 *
 * Protegido con un secreto compartido: header `x-cron-secret` = CRON_SECRET (comparado en
 * tiempo constante, sobre los SHA-256 para no revelar el largo). Sin CRON_SECRET configurado
 * responde 503 (nunca queda abierto).
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';
import { runMailQueue, siteOrigin } from '$lib/server/tickets/index.js';
import { MIN_CRON_SECRET_LENGTH, isValidCronSecret } from '$lib/server/cron.js';
import { runSeriesCron } from '$lib/server/series/web.js';
import { runSigoCron } from '$lib/server/sigo/cron.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform, url, fetch }) {
	const secret = env.CRON_SECRET;
	if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) {
		return json({ error: 'CRON_SECRET no está configurado' }, { status: 503 });
	}
	if (!(await isValidCronSecret(request.headers.get('x-cron-secret'), secret))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const db = getDB(platform);
	if (!db) return json({ error: 'sin base de datos' }, { status: 503 });
	try {
		const r = await runMailQueue({ db, origin: siteOrigin(url), fetch });
		// Las series van aparte: si fallan, los recordatorios ya salieron y la corrida no se cae.
		let series = null;
		try {
			series = await runSeriesCron({ db, origin: siteOrigin(url), fetch });
		} catch (error) {
			logDBError('cron series', error);
		}
		// «Lo que sigo» también aparte (interruptores `lo_que_sigo` y `cuentas`).
		let sigo = null;
		try {
			sigo = await runSigoCron({ db, platform, origin: siteOrigin(url), fetch });
		} catch (error) {
			logDBError('cron lo que sigo', error);
		}
		return json(
			{ ...r, ...(series ? { series } : {}), ...(sigo ? { sigo } : {}) },
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		logDBError('cron recordatorios', error);
		return json({ error: 'error' }, { status: 500 });
	}
}
