/**
 * PROTOTIPO (no para mergear): la puerta desde una Mini App de Telegram. La página no muestra
 * nada sin Telegram; todo lo que importa pasa por `api/+server.js`, que valida el `initData` y
 * los permisos de admin en cada pedido ($lib/server/telegram/puerta.js).
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, url, setHeaders }) {
	if (!(await isFlagOn(getDB(platform), 'telegram_bot'))) error(404, 'Not found');
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex',
		// Telegram Web abre las Mini Apps en un iframe: solo ese sitio puede embeber esta página.
		'content-security-policy': 'frame-ancestors https://web.telegram.org'
	});
	const slug = url.searchParams.get('evento') ?? '';
	return { slug: /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(slug) ? slug : '' };
}
