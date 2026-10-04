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
 * Cloudflare Pages no usa este archivo: allá el sitio sigue siendo el `_worker.js` del adapter.
 */
import app from '../.svelte-kit/cloudflare/_worker.js';
import { handleScheduled } from '../src/lib/server/scheduled.js';
import { trackPageView } from '../src/lib/server/analytics/track.js';

export default {
	/**
	 * @param {Request} request
	 * @param {Record<string, unknown>} env
	 * @param {import('@cloudflare/workers-types').ExecutionContext} ctx
	 */
	async fetch(request, env, ctx) {
		const response = await app.fetch(request, env, ctx);
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
