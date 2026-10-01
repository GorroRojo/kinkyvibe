/**
 * Rama que se está compilando, leída de las variables que pone Cloudflare en el build. La usa
 * vite.config.js para fijar `__DEPLOY_BRANCH__` (ver ./deploy.js). Sin imports: se carga desde
 * vite.config.js, en Node.
 *
 * - Workers Builds pone `WORKERS_CI_BRANCH` (en producción y en los Previews):
 *   https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#environment-variables
 * - Cloudflare Pages pone `CF_PAGES_BRANCH` (se mantiene mientras el sitio siga en Pages).
 * - En local, en los tests y en un `wrangler deploy` a mano no hay ninguna: '' (producción, sin
 *   modo demo). Ante la duda, siempre el lado seguro.
 *
 * @param {Record<string, string | undefined>} env normalmente `process.env`
 * @returns {string}
 */
export function deployBranchFromEnv(env) {
	return (env.WORKERS_CI_BRANCH || env.CF_PAGES_BRANCH || '').trim();
}
