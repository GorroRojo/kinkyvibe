import { securityTxt } from '$lib/utils/securityTxt.js';

/**
 * GET /.well-known/security.txt. Va antes que /.well-known/[param] (que manda todo lo demás a
 * Bridgy Fed): SvelteKit prefiere la ruta fija.
 * @type {import('./$types').RequestHandler}
 */
export function GET() {
	return new Response(securityTxt(), {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=86400'
		}
	});
}
