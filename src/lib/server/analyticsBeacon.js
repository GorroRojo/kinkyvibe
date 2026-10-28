/**
 * El beacon de Cloudflare Web Analytics (en `src/app.html`) no se carga en la puerta con link
 * (`/puerta`, `/puerta/<slug>`): el link lleva el token en el fragmento (`/puerta#<token>`) y un
 * script de terceros que lee la dirección de la página no tiene por qué verlo. `hooks.server.js`
 * pasa cada página por `withoutBeacon`, que en esas rutas saca el bloque del HTML
 * (`transformPageChunk`).
 */

/** El bloque del beacon en `src/app.html` (entre sus dos comentarios) o el `<script>` solo. */
const BEACON_BLOCK =
	/<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->|<script\b[^>]*static\.cloudflareinsights\.com[^>]*>\s*<\/script>/g;

/**
 * ¿Esta ruta va sin el beacon?
 *
 * @param {string} pathname
 */
export function skipsBeacon(pathname) {
	return pathname === '/puerta' || pathname.startsWith('/puerta/');
}

/**
 * El HTML sin el beacon. Se repite hasta que no queda nada que sacar: sacar un bloque podría juntar
 * los pedazos de otro (`<scr` + bloque + `ipt …>`), y así lo que queda nunca tiene el beacon.
 *
 * @param {string} html
 */
export function stripAnalyticsBeacon(html) {
	let out = html;
	let previous;
	do {
		previous = out;
		out = out.replace(BEACON_BLOCK, '');
	} while (out !== previous);
	return out;
}

/** @typedef {Parameters<import('@sveltejs/kit').Handle>[0]['resolve']} Resolve */

/**
 * `resolve` que, en las rutas de `skipsBeacon`, saca el beacon de la página (respeta un
 * `transformPageChunk` que ya venga).
 *
 * @param {Resolve} resolve
 * @returns {Resolve}
 */
export function withoutBeacon(resolve) {
	return (event, opts) => {
		if (!skipsBeacon(event.url.pathname)) return resolve(event, opts);
		const inner = opts?.transformPageChunk;
		return resolve(event, {
			...opts,
			transformPageChunk: async (input) => {
				const html = inner ? await inner(input) : input.html;
				return html === undefined ? undefined : stripAnalyticsBeacon(html);
			}
		});
	};
}
