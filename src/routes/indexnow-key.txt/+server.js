/**
 * GET /indexnow-key.txt: la clave de IndexNow (el secret `INDEXNOW_KEY`), que los motores leen para
 * confirmar que los avisos vienen del sitio ($lib/server/seo/indexnow.js, docs/seo.md). Es pública
 * por diseño de IndexNow. Sin clave válida, 404.
 */
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { isValidIndexNowKey } from '$lib/server/seo/indexnow.js';

export const prerender = false;

/** @type {import('./$types').RequestHandler} */
export function GET() {
	const key = env.INDEXNOW_KEY;
	if (!isValidIndexNowKey(key)) error(404, 'Not found');
	return new Response(key, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
}
