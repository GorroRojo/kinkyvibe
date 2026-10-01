/**
 * POST /api/cron/recordatorios: manda una tanda de los mails que tocan: recordatorios (ver
 * $lib/server/tickets/reminders.js) y lo que quede de cada "Enviar el link a todes" (ver
 * `runMailQueue` en $lib/server/tickets/index.js). Lo llama cada 15 minutos el Worker de
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
		return json(r, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		logDBError('cron recordatorios', error);
		return json({ error: 'error' }, { status: 500 });
	}
}
