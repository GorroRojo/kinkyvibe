/**
 * Baja en un clic (RFC 8058; docs/mails.md, «Baja en un clic»). Los mails de «Lo que sigo» y de
 * los avisos de series llevan `List-Unsubscribe` con el link firmado de su página de baja y
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Gmail, Apple Mail y los demás muestran
 * «Anular suscripción» y, al tocarlo, su servidor manda un POST a ese link, sin cookies y sin
 * `Origin`.
 *
 * SvelteKit rechaza con 403 un POST de formulario sin `Origin` del propio sitio (CSRF). Este archivo
 * lo usa el Worker (worker/index.js) antes de pasarle el pedido a SvelteKit: **solo** un POST sin
 * `Origin` a una de las páginas de baja, con su token en la ruta, se reescribe con el `Origin` del
 * sitio. Es seguro porque esas acciones no miran la sesión ni las cookies (lo que autoriza es la
 * firma HMAC del token), son idempotentes y contestan 200 sin redirigir. Un navegador siempre manda
 * `Origin` en un POST de otro sitio, así que eso sigue rechazándose como siempre.
 *
 * Sin `$lib`: lo importa el Worker, que wrangler empaqueta sin los alias de SvelteKit.
 */

/**
 * Las páginas de baja que aceptan el POST de un clic: `/avisos/sigo/<token>` («Lo que sigo»),
 * `/avisos/baja/<token>` (series) y `/lista-de-espera/salir/<token>`. El token, un solo segmento.
 */
export const ONE_CLICK_PATH_RE =
	/^\/(?:avisos\/sigo|avisos\/baja|lista-de-espera\/salir)\/[A-Za-z0-9._~-]{1,200}$/;

/** El cuerpo que manda un cliente de correo (RFC 8058, sección 3.1). */
export const ONE_CLICK_BODY = 'List-Unsubscribe=One-Click';

/**
 * El pedido que tiene que ver SvelteKit: el mismo, salvo un POST de un clic (ver arriba), que va
 * con el `Origin` del sitio.
 *
 * @param {Request} request
 * @returns {Request}
 */
export function allowOneClickPost(request) {
	if (request.method !== 'POST' || request.headers.has('origin')) return request;
	const url = new URL(request.url);
	if (!ONE_CLICK_PATH_RE.test(url.pathname) || url.search) return request;
	const headers = new Headers(request.headers);
	headers.set('origin', url.origin);
	return new Request(request, { headers });
}

/**
 * Las cabeceras de baja en un clic para un link de baja, o `{}` si no es `https://` (en dev, sin
 * cabeceras). Nunca `mailto:`.
 *
 * @param {string | null | undefined} url
 * @returns {Record<string, string>}
 */
export function oneClickHeaders(url) {
	if (typeof url !== 'string' || /[<>,\s]/.test(url)) return {};
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return {};
	}
	if (parsed.protocol !== 'https:' || !ONE_CLICK_PATH_RE.test(parsed.pathname) || parsed.search)
		return {};
	return { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': ONE_CLICK_BODY };
}
