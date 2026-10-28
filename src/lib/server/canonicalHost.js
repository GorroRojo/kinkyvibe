/**
 * Un solo host para el sitio (docs/seo.md): lo que llega a `www.kinkyvibe.ar` se redirige a
 * `https://kinkyvibe.ar` con el mismo camino y la misma query. La capa que importa es la regla de
 * Cloudflare (Rules → Redirect Rules, «Redirect from WWW to Root»); esto es la red por si falta.
 *
 * Solo el host www exacto: el apex, los Previews (`*.workers.dev`) y localhost no se tocan, así
 * que no puede haber un bucle (el destino nunca es www).
 *
 * Además, en los builds de producción (rama `main`), cualquier otro host que no sea el del sitio
 * (por ejemplo, una dirección `*.workers.dev` de una versión de producción) se redirige igual con
 * 308 ({@link offSiteRedirectResponse}): producción tiene una sola puerta, la de la zona
 * kinkyvibe.ar, con sus reglas. En los Previews y en local la rama no es `main` y no cambia nada.
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

/** Rama de los builds de producción (Workers Builds; ver ./deploy.js). */
const PRODUCTION_BRANCH = 'main';

/**
 * En un build de producción, la redirección a {@link SITE_URL} de un pedido que llegó por otro
 * host (ni el sitio ni www, que tiene la suya), o `null`. 308: conserva método y cuerpo. El cron
 * (`/api/cron/…`) no se redirige: lo arma el propio Worker con `SITE_URL` del entorno.
 *
 * @param {URL} url
 * @param {string} branch la rama del build (`__DEPLOY_BRANCH__`: '' en local y en los tests)
 * @returns {Response | null}
 */
export function offSiteRedirectResponse(url, branch) {
	if (branch !== PRODUCTION_BRANCH) return null;
	const host = url.hostname.toLowerCase();
	if (host === APEX.hostname || host === WWW_HOST) return null;
	if (url.pathname.startsWith('/api/cron/')) return null;
	return new Response(null, {
		status: 308,
		headers: { location: `${APEX.origin}${url.pathname}${url.search}` }
	});
}
