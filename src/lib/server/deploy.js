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
