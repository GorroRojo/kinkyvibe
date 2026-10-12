/**
 * POST `{ initData }`: se abrió la Mini App del calendario (estadísticas de uso del bot, decisión
 * 0045, $lib/server/telegram/uso.js). Solo cuenta con el bot y `telegram_estadisticas` prendidos,
 * el token cargado y un `initData` válido. Siempre contesta 204, sin decir si contó: la página no
 * espera nada de acá.
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { recordMiniAppOpen } from '$lib/server/telegram/uso.js';

const noContent = () =>
	new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform }) {
	const db = getDB(platform);
	const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim();
	if (!db || !token) return noContent();
	if (!(await isFlagOn(db, 'telegram_bot')) || !(await isFlagOn(db, 'telegram_estadisticas'))) {
		return noContent();
	}
	if (Number(request.headers.get('content-length') ?? 0) > 8192) return noContent();
	/** @type {any} */
	let body = null;
	try {
		body = await request.json();
	} catch {
		return noContent();
	}
	const task = recordMiniAppOpen({ db, initData: body?.initData, token });
	const ctx = platform?.ctx;
	if (ctx?.waitUntil) ctx.waitUntil(task);
	else await task;
	return noContent();
}
