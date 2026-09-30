/**
 * GET /api/preview-status: qué está configurado en un deploy de preview, para revisar el entorno
 * de prueba sin entrar a Cloudflare. Solo presente/ausente (nunca un valor) y si el token de
 * Mercado Pago es de prueba. En producción (y fuera de Pages) responde 404.
 */
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import { parseAllowlist } from '$lib/server/tickets/emailGuard.js';

/** @param {string | undefined} value */
const present = (value) => Boolean(value?.trim());

/** @type {import('./$types').RequestHandler} */
export async function GET({ platform }) {
	if (!isPreviewDeploy()) error(404, 'Not found');
	const token = env.MP_ACCESS_TOKEN?.trim() ?? '';
	const db = getDB(platform);
	let dbOk = false;
	if (db) {
		try {
			await db.prepare('SELECT 1 FROM orders LIMIT 1').all();
			dbOk = true;
		} catch {
			dbOk = false;
		}
	}
	return json(
		{
			branch: __DEPLOY_BRANCH__,
			database: db ? (dbOk ? 'ok' : 'sin tablas') : 'no vinculada',
			mercadopago: token
				? token.startsWith('TEST-')
					? 'prueba (TEST-)'
					: 'APP_USR: revisar que sea de una cuenta de prueba'
				: 'no',
			mp_webhook_secret: present(env.MP_WEBHOOK_SECRET),
			resend: present(env.RESEND_API_KEY),
			email_allowlist: parseAllowlist(env.EMAIL_ALLOWLIST).length,
			cron_secret: present(env.CRON_SECRET),
			site_url: present(env.SITE_URL),
			transfer_info: present(env.TICKETS_TRANSFER_INFO)
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
}
