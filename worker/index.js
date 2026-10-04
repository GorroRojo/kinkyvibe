/**
 * Punto de entrada del Worker `kinkyvibe` (el `main` de wrangler.toml).
 *
 * `@sveltejs/adapter-cloudflare` genera un Worker que solo exporta `fetch`. Este archivo lo
 * envuelve para sumar `scheduled()` (los crons de wrangler.toml: recordatorios y backup
 * nocturno), sin tocar cómo se atienden las páginas. El adapter escribe su Worker en
 * `.svelte-kit/cloudflare/_worker.js` (ver svelte.config.js y wrangler.adapter.toml); wrangler
 * empaqueta este archivo junto con ese.
 */
import app from '../.svelte-kit/cloudflare/_worker.js';
import { handleScheduled } from '../src/lib/server/scheduled.js';

export default {
	/**
	 * @param {Request} request
	 * @param {Record<string, unknown>} env
	 * @param {import('@cloudflare/workers-types').ExecutionContext} ctx
	 */
	fetch(request, env, ctx) {
		return app.fetch(request, env, ctx);
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
