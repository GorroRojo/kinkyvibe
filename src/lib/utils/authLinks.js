/**
 * Links a /login y /logout que vuelven a la página actual. `redirectTo` va siempre codificado
 * (si no, el `?` y los `&` de la página se mezclan con los de /login o /logout) y con la ruta más
 * la query, sin el origen. Del otro lado, /login y /logout lo validan con `safeRedirect`.
 */

/**
 * @param {Pick<URL, 'pathname' | 'search'>} url la página a la que se vuelve
 * @returns {string}
 */
export function returnPath(url) {
	return (url.pathname || '/') + (url.search || '');
}

/**
 * `/login?redirectTo=<página actual codificada>`
 * @param {Pick<URL, 'pathname' | 'search'>} url
 */
export function loginHref(url) {
	return '/login?redirectTo=' + encodeURIComponent(returnPath(url));
}

/**
 * `/logout?redirectTo=<página actual codificada>`
 * @param {Pick<URL, 'pathname' | 'search'>} url
 */
export function logoutHref(url) {
	return '/logout?redirectTo=' + encodeURIComponent(returnPath(url));
}
