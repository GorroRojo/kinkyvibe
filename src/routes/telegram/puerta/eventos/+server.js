/**
 * POST `{ initData }` → los eventos para elegir en la puerta (los de hoy y los de los próximos
 * días; decisión 0037). Los mismos permisos que marcar un ingreso, mirados en cada pedido
 * ($lib/server/telegram/puerta.js). Sin token, sin base o con `telegram_bot` o `telegram_puerta`
 * apagado: 404.
 */
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { doorEnabled, doorEvents } from '$lib/server/telegram/puerta.js';

const HEADERS = { 'cache-control': 'no-store' };

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform }) {
	const db = getDB(platform);
	const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim();
	if (!db || !token || !(await doorEnabled(db))) error(404, 'Not found');
	if (Number(request.headers.get('content-length') ?? 0) > 8192) error(413, 'too large');
	/** @type {any} */
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'bad_request' }, { status: 400, headers: HEADERS });
	}
	const r = await doorEvents({ db, initData: body?.initData, token });
	return json(r.body, { status: r.status, headers: HEADERS });
}
