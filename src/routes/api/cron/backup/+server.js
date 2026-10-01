/**
 * POST /api/cron/backup: hace un backup de la base AHORA (por ejemplo, antes de aplicar una
 * migración o de tocar datos a mano). Queda en R2 como `d1/manual/<fecha y hora>Z.sql.gz` y
 * nunca se borra solo. El backup de todas las noches lo hace el cron (src/lib/server/scheduled.js).
 *
 * Protegido igual que /api/cron/recordatorios: header `x-cron-secret` = CRON_SECRET. Solo anda
 * en el Worker de producción (necesita el binding BACKUPS; en Pages y en los Previews: 503).
 *
 *   curl -X POST https://kinkyvibe.ar/api/cron/backup -H "x-cron-secret: $CRON_SECRET"
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { backupDatabase } from '$lib/server/backup/index.js';
import { MIN_CRON_SECRET_LENGTH, isValidCronSecret } from '$lib/server/cron.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform }) {
	const secret = env.CRON_SECRET;
	if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) {
		return json({ error: 'CRON_SECRET no está configurado' }, { status: 503 });
	}
	if (!(await isValidCronSecret(request.headers.get('x-cron-secret'), secret))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const db = getDB(platform);
	const bucket = platform?.env?.BACKUPS;
	if (!db || !bucket) {
		return json({ error: 'sin base de datos o sin bucket de backups' }, { status: 503 });
	}
	try {
		const result = await backupDatabase({ db, bucket, manual: true });
		return json(result, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		console.error('backup manual', error);
		return json({ error: 'error' }, { status: 500 });
	}
}
