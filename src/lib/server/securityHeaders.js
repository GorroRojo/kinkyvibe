/**
 * Encabezados de seguridad que agrega `hooks.server.js` a cada respuesta.
 *
 * - En todo el sitio: `X-Content-Type-Options: nosniff`, `Referrer-Policy` y `Permissions-Policy`
 *   (cámara solo para el propio sitio, que la usa el escáner de la puerta; sin micrófono ni
 *   ubicación). La CSP de scripts (solo reporte) la pone SvelteKit (`kit.csp`, svelte.config.js).
 * - En el panel, el editor, el login, las páginas de entradas, las de cuentas y el permiso del
 *   conector de Claude (`/mcp`): no se pueden mostrar dentro de un iframe de otro sitio
 *   (`X-Frame-Options: DENY` y `frame-ancestors 'none'`). Así nadie puede
 *   esconder un botón del panel ("Reembolsar", "Marcar ingreso") debajo de su propia página.
 *   El resto del sitio sigue pudiendo embeberse.
 */

/** Qué funciones del navegador puede pedir el sitio. */
export const PERMISSIONS_POLICY = 'camera=(self), microphone=(), geolocation=()';

/** Prefijos de rutas que nunca se muestran dentro de un iframe. */
export const NO_FRAME_PREFIXES = [
	'/admin',
	'/edit',
	'/login',
	'/logout',
	'/callback',
	'/entradas',
	'/ingresar',
	'/mi-rincon',
	'/mcp'
];

/** @param {string} pathname */
export function isNoFramePath(pathname) {
	return NO_FRAME_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * @param {URL} url
 * @param {Response} response
 * @returns {Response}
 */
export function withSecurityHeaders(url, response) {
	try {
		const h = response.headers;
		if (!h.has('X-Content-Type-Options')) h.set('X-Content-Type-Options', 'nosniff');
		if (!h.has('Referrer-Policy')) h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
		if (!h.has('Permissions-Policy')) h.set('Permissions-Policy', PERMISSIONS_POLICY);
		if (isNoFramePath(url.pathname)) {
			h.set('X-Frame-Options', 'DENY');
			const csp = h.get('Content-Security-Policy');
			if (!csp) h.set('Content-Security-Policy', "frame-ancestors 'none'");
			else if (!/frame-ancestors/.test(csp))
				h.set('Content-Security-Policy', `${csp}; frame-ancestors 'none'`);
		}
	} catch {
		// Respuestas con headers inmutables (p. ej. un fetch reenviado): se devuelven tal cual.
	}
	return response;
}
