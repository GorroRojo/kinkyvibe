/**
 * La puerta (control de ingreso) desde una Mini App de Telegram (decisión 0036, docs/telegram.md).
 * La página no muestra nada sin Telegram; todo lo que importa pasa por `api/+server.js`, que valida
 * el `initData` y los permisos de admin en cada pedido ($lib/server/telegram/puerta.js). Pide los
 * interruptores `telegram_bot` y `telegram_puerta`; si no, 404.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { doorEnabled } from '$lib/server/telegram/puerta.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, url, setHeaders }) {
	if (!(await doorEnabled(getDB(platform)))) error(404, 'Not found');
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex',
		// Telegram Web abre las Mini Apps en un iframe: solo ese sitio puede embeber esta página.
		'content-security-policy': 'frame-ancestors https://web.telegram.org'
	});
	const slug = url.searchParams.get('evento') ?? '';
	return { slug: /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(slug) ? slug : '' };
}
