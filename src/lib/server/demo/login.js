import { authCookieOptions, safeRedirect } from '../auth.js';
import { DEMO_COOKIE } from './identity.js';

/** Duración de la sesión demo, en segundos. */
export const DEMO_SESSION_MAX_AGE = 7 * 24 * 60 * 60;

/**
 * "Entrar como admin de prueba" (POST /login/demo). Solo en deploys de preview: en cualquier otro
 * lado no pone la cookie y devuelve null (la ruta responde 404).
 * @param {{ preview: boolean, cookies: import('@sveltejs/kit').Cookies, url: URL, redirectTo: unknown }} opts
 * @returns {string | null} a dónde redirigir, o null si no corresponde
 */
export function startDemoSession({ preview, cookies, url, redirectTo }) {
	if (preview !== true) return null;
	cookies.set(DEMO_COOKIE, '1', authCookieOptions(url, DEMO_SESSION_MAX_AGE));
	const target = safeRedirect(redirectTo, url.origin, '/admin');
	return target === '/' ? '/admin' : target;
}
