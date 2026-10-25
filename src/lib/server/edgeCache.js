/**
 * Caché de 1 minuto de las páginas públicas para quien no tiene sesión (decisión 0048,
 * docs/workers-migracion.md «Caché de 1 minuto para quien no tiene sesión»).
 *
 * La usa worker/index.js alrededor del Worker de SvelteKit. No va en los hooks a propósito: el
 * adapter busca en su caché por URL antes de llegar a los hooks, así que una página anónima
 * guardada así le llegaría también a quien tiene sesión.
 *
 * Todo es por lista de lo permitido: lo que no está en una lista no se guarda (BYPASS).
 * - Pedido: GET, que pide HTML, al dominio de producción, sin `Authorization`, sin cookies (o solo
 *   las de Cloudflare, que el sitio nunca lee), a una ruta pública que no está excluida y con un
 *   query string hecho solo de parámetros conocidos.
 * - Respuesta: 200, HTML, sin `Set-Cookie`, sin `cache-control` privado y sin `Vary` raro.
 *
 * Solo imports relativos: worker/index.js lo importa sin pasar por Vite.
 */

/** Cuánto vive una página guardada, en segundos (lo aprobó gorrite: hasta 1 minuto de atraso). */
export const EDGE_CACHE_TTL = 60;

/** Header para verificar desde afuera (`curl`): HIT, MISS o BYPASS. */
export const CACHE_STATUS_HEADER = 'x-kv-cache';

/** Dónde se guarda el `cache-control` original de la página, para devolverlo igual en un HIT. */
const ORIGINAL_CC_HEADER = 'x-kv-cache-original-cc';

/**
 * Solo producción. Los Previews (`<rama>-kinkyvibe.….workers.dev`) y local quedan afuera, y en
 * workers.dev la Cache API tampoco guarda nada.
 */
export const CACHE_HOSTS = ['kinkyvibe.ar', 'www.kinkyvibe.ar'];

/**
 * Cookies que no impiden guardar: las pone Cloudflare (bots y límites) y el sitio nunca las lee.
 * Cualquier otra cookie (`userToken`, `kvRincon`, `kvDemo`, `kv_orders`, `oauthState`, …, o una
 * que se sume mañana) hace que el pedido no use la caché.
 */
export const HARMLESS_COOKIES = ['__cf_bm', 'cf_clearance', '_cfuvid'];

/**
 * Parámetros del query string que no impiden guardar (la página guardada es por URL completa, así
 * que cada combinación es una entrada aparte). Un parámetro que no está acá (p. ej. `lista`, el
 * lugar guardado de la lista de espera, o cualquier token) hace que el pedido no use la caché.
 */
export const HARMLESS_PARAMS = [
	'q',
	'tags',
	'tipo',
	'etiqueta',
	'viewdate',
	'salida',
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
	'fbclid',
	'gclid'
];

/**
 * Rutas que nunca se guardan (y todo lo que va debajo): el panel y el editor (`(authed)`), las
 * APIs, las entradas, las cuentas, el login, los links de mails y avisos, la lista de espera, las
 * propinas, el bot, y archivos que no son páginas.
 */
export const NEVER_CACHE_PREFIXES = [
	'/admin',
	'/edit',
	'/api',
	'/entradas',
	'/mi-rincon',
	'/ingresar',
	'/login',
	'/logout',
	'/callback',
	'/mails',
	'/avisos',
	'/lista-de-espera',
	'/propinas',
	'/telegram',
	'/auch',
	'/errores',
	'/imagenes',
	'/media',
	'/og'
];

/** Un segmento con este nombre en cualquier lugar de la ruta (p. ej. `/calendario/<evento>/entradas`). */
const NEVER_CACHE_SEGMENTS = ['entradas', '__data.json'];

/** @param {string} pathname */
export function isNeverCachePath(pathname) {
	const p = pathname.toLowerCase();
	if (NEVER_CACHE_PREFIXES.some((x) => p === x || p.startsWith(x + '/'))) return true;
	return p.split('/').some((s) => NEVER_CACHE_SEGMENTS.includes(s));
}

/**
 * Los nombres de las cookies de un header `Cookie`.
 * @param {string} header
 */
export function cookieNames(header) {
	return header
		.split(';')
		.map((part) => part.split('=')[0].trim())
		.filter(Boolean);
}

/**
 * ¿Este pedido puede usar la caché? Devuelve la clave (una URL propia, con la versión del build
 * para que cada deploy empiece de cero) o `null` si no.
 *
 * @param {Request} request
 * @param {{ version: string, enabled?: boolean }} opts
 * @returns {string | null}
 */
export function edgeCacheKey(request, { version, enabled = true }) {
	if (!enabled || !version) return null;
	if (request.method !== 'GET') return null;
	const url = new URL(request.url);
	if (url.protocol !== 'https:' || !CACHE_HOSTS.includes(url.hostname)) return null;
	const h = request.headers;
	if (h.has('authorization')) return null;
	if (!(h.get('accept') ?? '').includes('text/html')) return null;
	const cookie = h.get('cookie');
	if (cookie && cookieNames(cookie).some((name) => !HARMLESS_COOKIES.includes(name))) return null;
	// Pedidos internos de SvelteKit (datos de la página, acciones): nunca HTML para compartir.
	if ([...h.keys()].some((k) => k.startsWith('x-sveltekit-'))) return null;
	if (isNeverCachePath(url.pathname)) return null;
	for (const name of url.searchParams.keys()) {
		if (!HARMLESS_PARAMS.includes(name)) return null;
	}
	const key = new URL(`/__kv-edge-cache/${encodeURIComponent(version)}${url.pathname}`, url.origin);
	key.search = url.search;
	return key.href;
}

/**
 * ¿Esta respuesta se puede guardar y mostrar a otras personas sin sesión?
 * @param {Response} response
 */
export function isCacheableResponse(response) {
	if (response.status !== 200) return false;
	const h = response.headers;
	if (!(h.get('content-type') ?? '').toLowerCase().startsWith('text/html')) return false;
	if (h.has('set-cookie')) return false;
	const cc = (h.get('cache-control') ?? '').toLowerCase();
	if (/\b(private|no-store|no-cache)\b/.test(cc)) return false;
	const vary = (h.get('vary') ?? '').toLowerCase();
	if (
		vary &&
		vary
			.split(',')
			.map((v) => v.trim())
			.some((v) => v && v !== 'accept-encoding')
	)
		return false;
	return true;
}

/**
 * Pone el header de verificación sin romper nada si los headers no se pueden cambiar.
 * @param {Response} response
 * @param {'HIT' | 'MISS' | 'BYPASS'} status
 */
function mark(response, status) {
	try {
		response.headers.set(CACHE_STATUS_HEADER, status);
		return response;
	} catch {
		try {
			const copy = new Response(response.body, response);
			copy.headers.set(CACHE_STATUS_HEADER, status);
			return copy;
		} catch {
			return response;
		}
	}
}

/**
 * Atiende el pedido con la caché de 1 minuto si se puede.
 *
 * @param {Request} request
 * @param {{ waitUntil(p: Promise<unknown>): void }} ctx
 * @param {() => Promise<Response>} render el Worker de SvelteKit
 * @param {{ cache: Pick<Cache, 'match' | 'put'> | undefined, version: string, enabled?: boolean }} opts
 * @returns {Promise<Response>}
 */
export async function withEdgeCache(request, ctx, render, { cache, version, enabled = true }) {
	const key = cache ? edgeCacheKey(request, { version, enabled }) : null;
	if (!cache || !key) return mark(await render(), 'BYPASS');

	/** @type {Response | undefined} */
	let hit;
	try {
		hit = await cache.match(key);
	} catch {
		hit = undefined;
	}
	if (hit) {
		const out = new Response(hit.body, hit);
		const original = out.headers.get(ORIGINAL_CC_HEADER);
		out.headers.delete(ORIGINAL_CC_HEADER);
		// El navegador recibe el mismo cache-control que sin caché (no guarda la página él).
		if (original) out.headers.set('cache-control', original);
		else out.headers.delete('cache-control');
		out.headers.delete('age');
		out.headers.set(CACHE_STATUS_HEADER, 'HIT');
		return out;
	}

	const response = await render();
	if (!isCacheableResponse(response) || !response.body) return mark(response, 'BYPASS');

	try {
		const stored = new Response(response.clone().body, response);
		const original = response.headers.get('cache-control');
		if (original) stored.headers.set(ORIGINAL_CC_HEADER, original);
		stored.headers.set('cache-control', `public, max-age=${EDGE_CACHE_TTL}`);
		stored.headers.delete(CACHE_STATUS_HEADER);
		ctx.waitUntil(cache.put(key, stored).catch(() => {}));
	} catch {
		return mark(response, 'BYPASS');
	}
	return mark(response, 'MISS');
}
