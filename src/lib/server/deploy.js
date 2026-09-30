/**
 * En qué deploy corre el sitio. `__DEPLOY_BRANCH__` lo fija vite.config.js al compilar, con la
 * variable CF_PAGES_BRANCH que pone Cloudflare Pages en el build ('' fuera de Pages: local, tests).
 */

/** Rama de producción en Cloudflare Pages. */
export const PRODUCTION_BRANCH = 'main';

/**
 * `true` en un deploy de preview de Cloudflare Pages (cualquier rama que no sea main).
 *
 * @param {string} [branch]
 */
export function isPreviewDeploy(branch = __DEPLOY_BRANCH__) {
	return branch !== '' && branch !== PRODUCTION_BRANCH;
}

/**
 * Lo mismo que `isPreviewDeploy()`, pero como constante que el bundler resuelve al compilar:
 * `__DEPLOY_BRANCH__` es un literal, así que en el build de producción (y en local) esto queda
 * `false` y todo lo que va dentro de `if (PREVIEW_BUILD)` (el modo demo) se elimina del bundle.
 * ('main' escrito literal a propósito, para que se pueda resolver sin mirar PRODUCTION_BRANCH.)
 */
export const PREVIEW_BUILD = __DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main';
