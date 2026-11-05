/**
 * Normalizar la clave de caché de las rutas públicas cacheables (docs/workers-migracion.md,
 * «Clave de caché de las rutas públicas»).
 *
 * El Worker que arma `@sveltejs/adapter-cloudflare` guarda en `caches.default` lo que responde con
 * `cache-control` público y lo busca por la URL completa del pedido (query incluida), salvo que el
 * pedido traiga `cache-control: no-cache`. Estas rutas no leen el query ni esos headers: dos pedidos
 * que solo difieren en eso reciben la misma respuesta. worker/index.js le pasa al adapter el pedido
 * normalizado (sin query y sin `cache-control`/`pragma`), así que caen en la misma entrada de caché.
 *
 * Solo una lista explícita de rutas que no dependen de la sesión ni del query; lo demás (páginas,
 * `/ics/mio`, el panel, las APIs con datos de la persona) pasa intacto. Las cookies y el resto de
 * los headers (`Range`, `If-None-Match`) se conservan.
 *
 * Solo imports relativos: lo importa worker/index.js, que no pasa por Vite.
 */

/** Rutas exactas. */
export const NORMALIZED_PATHS = Object.freeze([
	'/calendario.ics',
	'/api/posts',
	'/api/search-index.json'
]);

/** Prefijos (todo lo que va debajo). */
export const NORMALIZED_PREFIXES = Object.freeze(['/media/', '/og/', '/ics/etiqueta/']);

/** Headers del pedido que hacen que el adapter no use su caché. */
const BYPASS_HEADERS = ['cache-control', 'pragma'];

/** @param {string} pathname */
export function isNormalizedPath(pathname) {
	return (
		NORMALIZED_PATHS.includes(pathname) || NORMALIZED_PREFIXES.some((p) => pathname.startsWith(p))
	);
}

/**
 * El pedido que le llega al Worker de SvelteKit: el mismo, salvo un GET o HEAD a una de las rutas
 * de arriba, que va sin query y sin los headers que saltean la caché.
 *
 * @param {Request} request
 * @returns {Request}
 */
export function normalizeCacheableRequest(request) {
	if (request.method !== 'GET' && request.method !== 'HEAD') return request;
	const url = new URL(request.url);
	if (!isNormalizedPath(url.pathname)) return request;
	const headers = request.headers;
	if (!url.search && !BYPASS_HEADERS.some((h) => headers.has(h))) return request;
	const clean = new Headers(headers);
	for (const h of BYPASS_HEADERS) clean.delete(h);
	url.search = '';
	// Primero a la URL nueva (conserva método, `cf` y lo demás) y después con los headers limpios.
	return new Request(new Request(url.href, request), { headers: clean });
}
