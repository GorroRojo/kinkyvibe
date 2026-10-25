/**
 * Punto de entrada del Worker `kinkyvibe` (el `main` de wrangler.toml).
 *
 * `@sveltejs/adapter-cloudflare` genera un Worker que solo exporta `fetch`. Este archivo lo
 * envuelve para sumar `scheduled()` (los crons de wrangler.toml: recordatorios y backup
 * nocturno), sin tocar cómo se atienden las páginas. El adapter escribe su Worker en
 * `.svelte-kit/cloudflare/_worker.js` (ver svelte.config.js y wrangler.adapter.toml); wrangler
 * empaqueta este archivo junto con ese.
 *
 * Acá también se anotan las visitas anónimas (docs/analiticas.md): este `fetch` ve todos los
 * pedidos que llegan al Worker, incluso las páginas que el adapter sirve desde su caché (esas no
 * pasan por hooks.server.js). Sin el binding `ANALYTICS` no hace nada.
 *
 * Las imágenes de vista previa (`/og/…`, docs/compartir.md) se dibujan con WebAssembly, que en
 * Workers solo se puede usar como módulo que sube wrangler: Vite (que arma el Worker de
 * SvelteKit) no lo puede importar. Por eso el dibujante vive acá (worker/og.js) y le llega a la
 * ruta de SvelteKit en `platform.env.OG_RENDER`, solo en esos pedidos.
 *
 * Las páginas públicas para quien no tiene sesión se guardan 1 minuto en la caché de Cloudflare
 * (decisión 0049, src/lib/server/edgeCache.js). Va acá y no en los hooks: el adapter busca en su
 * propia caché por URL antes de los hooks, y le serviría la página anónima a quien tiene sesión.
 * La clave lleva la versión del build de SvelteKit, así que cada deploy empieza de cero. Se apaga
 * sin deploy con la variable `KV_EDGE_CACHE = "off"` en el panel.
 */
import app from '../.svelte-kit/cloudflare/_worker.js';
import { handleScheduled } from '../src/lib/server/scheduled.js';
import { trackPageView } from '../src/lib/server/analytics/track.js';
import { withEdgeCache } from '../src/lib/server/edgeCache.js';
import { renderOg } from './og.js';
import buildVersion from '../.svelte-kit/cloudflare/_app/version.json';

export default {
	/**
	 * @param {Request} request
	 * @param {Record<string, unknown>} env
	 * @param {import('@cloudflare/workers-types').ExecutionContext} ctx
	 */
	async fetch(request, env, ctx) {
		const og = new URL(request.url).pathname.startsWith('/og/');
		const response = await withEdgeCache(
			request,
			ctx,
			() => app.fetch(request, og ? { ...env, OG_RENDER: renderOg } : env, ctx),
			{
				cache: typeof caches === 'undefined' ? undefined : /** @type {any} */ (caches).default,
				version: buildVersion.version,
				enabled: env.KV_EDGE_CACHE !== 'off'
			}
		);
		// Sincrónico y nunca tira (writeDataPoint no espera la red). No lee el cuerpo.
		trackPageView(request, response, env);
		return response;
	},

	/**
	 * @param {import('@cloudflare/workers-types').ScheduledController} controller
	 * @param {Record<string, unknown>} env
	 * @param {import('@cloudflare/workers-types').ExecutionContext} ctx
	 */
	async scheduled(controller, env, ctx) {
		await handleScheduled(controller, env, ctx, (request, e, c) => app.fetch(request, e, c));
	}
};
