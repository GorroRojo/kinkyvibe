/**
 * En qué deploy corre el sitio. `__DEPLOY_BRANCH__` lo fija vite.config.js al compilar, con la
 * rama que pone Cloudflare en el build: WORKERS_CI_BRANCH (Workers Builds) o CF_PAGES_BRANCH
 * (Cloudflare Pages); '' en local y en los tests. Ver ./deployBranch.js.
 */

/** Rama de producción (Workers Builds y Cloudflare Pages). */
export const PRODUCTION_BRANCH = 'main';

/**
 * `true` en un deploy de preview (cualquier rama que no sea main), en Workers o en Pages.
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
