/**
 * GET /api/preview-status: qué está configurado en un deploy de preview, para revisar el entorno
 * de prueba sin entrar a Cloudflare. Solo presente/ausente (nunca un valor) y si el token de
 * Mercado Pago es de prueba. En producción (y fuera de Pages) responde 404.
 * `demo`: filas de la base de prueba y los últimos cambios guardados en modo demo (docs/demo.md).
 */
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import { parseAllowlist } from '$lib/server/tickets/emailGuard.js';
import { overlaySummary } from '$lib/server/demo/overlay.js';

/** Tablas cuyas filas se cuentan (para ver si se cargó el seed de datos de prueba). */
const COUNTED_TABLES = [
	'orders',
	'tickets',
	'discount_codes',
	'reminder_sends',
	'stream_link_sends'
];

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
	/** @type {Record<string, number | null>} */
	const rows = {};
	if (db && dbOk) {
		for (const table of COUNTED_TABLES) {
			try {
				const r = /** @type {any} */ (
					await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()
				);
				rows[table] = Number(r?.n ?? 0);
			} catch {
				rows[table] = null;
			}
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
			transfer_info: present(env.TICKETS_TRANSFER_INFO),
			demo: db ? { rows, ...(await overlaySummary(db)) } : null
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
}
