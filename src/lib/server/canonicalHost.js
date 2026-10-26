/**
 * Un solo host para el sitio (docs/seo.md): lo que llega a `www.kinkyvibe.ar` se redirige a
 * `https://kinkyvibe.ar` con el mismo camino y la misma query. La capa que importa es la regla de
 * Cloudflare (Rules → Redirect Rules, «Redirect from WWW to Root»); esto es la red por si falta.
 *
 * Solo el host www exacto: el apex, los Previews (`*.workers.dev`) y localhost no se tocan, así
 * que no puede haber un bucle (el destino nunca es www).
 *
 * Solo imports relativos.
 */
import { SITE_URL } from '../utils/site.js';

const APEX = new URL(SITE_URL);
const WWW_HOST = `www.${APEX.hostname}`;

/**
 * La dirección a la que hay que redirigir, o `null` si el pedido ya está en el host correcto.
 * @param {URL} url
 * @returns {string | null}
 */
export function wwwRedirect(url) {
	if (url.hostname.toLowerCase() !== WWW_HOST) return null;
	return `${APEX.origin}${url.pathname}${url.search}`;
}

/**
 * La respuesta de la redirección, o `null`. 301 para GET y HEAD; 308 para lo demás, que conserva
 * el método y el cuerpo (un POST a www no se convierte en GET).
 * @param {Request} request
 * @param {URL} url
 * @returns {Response | null}
 */
export function wwwRedirectResponse(request, url) {
	const location = wwwRedirect(url);
	if (!location) return null;
	const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
	return new Response(null, { status, headers: { location } });
}
