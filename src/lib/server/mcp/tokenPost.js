/**
 * Conector de Claude (docs/conector-claude.md): Claude cambia el código por tokens con un POST de
 * formulario (`application/x-www-form-urlencoded`, como pide OAuth) desde sus servidores, sin
 * `Origin` (o con el suyo). SvelteKit rechaza con 403 un POST de formulario que no trae el `Origin`
 * del sitio (CSRF). Como la baja en un clic (src/lib/server/email/oneClick.js), el Worker
 * (worker/index.js) le pone el `Origin` del sitio antes de pasárselo a SvelteKit, **solo** a un POST
 * a `/mcp/token` exacto. Es seguro porque esa ruta no mira cookies ni la sesión: lo que autoriza es
 * el código con su verificador PKCE, o el token de renovación, que un sitio ajeno no tiene.
 *
 * Sin `$lib`: lo importa el Worker, que wrangler empaqueta sin los alias de SvelteKit.
 */

/** La única ruta a la que se le pone el `Origin`. */
export const TOKEN_PATH = '/mcp/token';

/**
 * El pedido que tiene que ver SvelteKit: el mismo, salvo un POST a `/mcp/token`, que va con el
 * `Origin` del sitio.
 *
 * @param {Request} request
 * @returns {Request}
 */
export function allowTokenPost(request) {
	if (request.method !== 'POST') return request;
	const url = new URL(request.url);
	if (url.pathname !== TOKEN_PATH || url.search) return request;
	if (request.headers.get('origin') === url.origin) return request;
	const headers = new Headers(request.headers);
	headers.set('origin', url.origin);
	return new Request(request, { headers });
}
