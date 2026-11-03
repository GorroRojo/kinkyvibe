/**
 * POST `{ initData, slug }` → `{ id }`: prepara la tarjeta de un evento para que la Mini App del
 * calendario la mande a un chat (`savePreparedInlineMessage` + `shareMessage`). Ver
 * $lib/server/telegram/share.js y docs/telegram.md («Mensajes enriquecidos y compartir»). Sin
 * token, sin base o con `telegram_bot` o `telegram_enriquecido` apagado: 404.
 */
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { readJsonCapped } from '$lib/server/http/body.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { inlineEventInfo } from '$lib/server/telegram/events.js';
import { inlineSource } from '$lib/server/telegram/inlineSource.js';
import { telegramCaller } from '$lib/server/telegram/run.js';
import { SHARE_RATE_LIMIT, prepareShare, shareEnabled } from '$lib/server/telegram/share.js';
import { botUsername } from '$lib/server/telegram/web.js';

const HEADERS = { 'cache-control': 'no-store' };

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform, url }) {
	const db = getDB(platform);
	const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim();
	if (!db || !token || !(await shareEnabled(db))) error(404, 'Not found');
	// Tope de 8 KB también sin content-length (se corta al leer).
	const read = await readJsonCapped(request, 8192);
	if (!read.ok && read.reason === 'too-large') error(413, 'too large');
	if (!read.ok) return json({ error: 'bad_request' }, { status: 400, headers: HEADERS });
	/** @type {any} */
	const body = read.value;
	const r = await prepareShare({
		initData: body?.initData,
		slug: body?.slug,
		token,
		origin: url.origin,
		source: () => inlineSource(platform),
		events: (metas) => inlineEventInfo(platform, metas),
		botUsername: botUsername(),
		rich: true,
		allow: async (id) => (await hitRateLimit(db, `tg:compartir:${id}`, SHARE_RATE_LIMIT)).allowed,
		call: telegramCaller(token)
	});
	return json(r.body, { status: r.status, headers: HEADERS });
}
