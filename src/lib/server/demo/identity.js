/**
 * Identidad del "admin de prueba" de los deploys de preview (modo demo, ver docs/demo.md).
 *
 * En un preview, /login ofrece "Entrar como admin de prueba": pone la cookie DEMO_COOKIE y
 * hooks.server.js arma esta sesión falsa. `isAdmin` (en $lib/server/auth) solo la acepta cuando
 * `isPreviewDeploy()`; en el build de producción el bloque de hooks ni siquiera está en el bundle.
 */

/** Cookie httpOnly que marca la sesión demo (valor '1'). */
export const DEMO_COOKIE = 'kvDemo';

/** No es un id de GitHub (esos son positivos): no puede coincidir con una cuenta real. */
export const DEMO_USER_ID = -1;

export const DEMO_LOGIN = 'demo';

/** "Token" de la sesión demo. No es un token de GitHub y nunca se manda a GitHub. */
export const DEMO_TOKEN = 'demo-session';

/** @returns {NonNullable<App.Locals['user']>} */
export function demoUser() {
	// Avatar propio: sin avatar_url, UserMenu usaría github.com/demo.png (una cuenta real ajena).
	return {
		id: DEMO_USER_ID,
		login: DEMO_LOGIN,
		name: 'Admin de prueba',
		avatar_url: '/favicon-32x32.png'
	};
}

/**
 * ¿Es la identidad del admin de prueba? (No dice si se acepta: eso lo decide isAdmin.)
 * @param {{ id?: number, login?: string }|undefined|null} user
 */
export function isDemoUser(user) {
	return !!user && user.id === DEMO_USER_ID && user.login === DEMO_LOGIN;
}
