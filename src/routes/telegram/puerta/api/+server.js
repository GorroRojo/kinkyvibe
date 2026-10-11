/**
 * POST `{ initData, evento, codigo }` → marca el ingreso (decisión 0036). Valida el `initData`
 * (HMAC con el token del bot, `auth_date` reciente) y que sea une admin con el Telegram vinculado
 * desde el panel, **en cada pedido** ($lib/server/telegram/puerta.js). Sin token, sin base o con
 * `telegram_bot` o `telegram_puerta` apagado: 404.
 */
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { doorCheckIn, doorEnabled } from '$lib/server/telegram/puerta.js';

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
	const slug = typeof body?.evento === 'string' ? body.evento : '';
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(slug)) {
		return json({ error: 'bad_event' }, { status: 400, headers: HEADERS });
	}
	const r = await doorCheckIn({
		db,
		initData: body?.initData,
		token,
		eventSlug: slug,
		code: body?.codigo
	});
	return json(r.body, { status: r.status, headers: HEADERS });
}
