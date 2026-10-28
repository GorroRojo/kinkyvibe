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
 * ruta de SvelteKit en `platform.env.OG_RENDER`, solo en esos pedidos. Se importa la primera vez que
 * se dibuja una tarjeta (`renderOg`, abajo), no al arrancar: satori, resvg y sus tablas se
 * inicializan solo en un pedido que dibuja, y un isolate nuevo que atiende una página no los paga.
 *
 * Las páginas públicas para quien no tiene sesión se guardan 1 minuto en la caché de Cloudflare
 * (decisión 0049, src/lib/server/edgeCache.js). Va acá y no en los hooks: el adapter busca en su
 * propia caché por URL antes de los hooks, y le serviría la página anónima a quien tiene sesión.
 * La clave lleva la versión del build de SvelteKit, así que cada deploy empieza de cero. Se apaga
 * sin deploy con la variable `KV_EDGE_CACHE = "off"` en el panel.
 *
 * Toda respuesta lleva `Server-Timing` (cuánto tardó el Worker, cuántas consultas hizo a D1 y cuánto
 * esperó a la base, y si el isolate es nuevo; src/lib/server/serverTiming.js y d1Timing.js), para
 * medir desde afuera. Para contar las consultas, el binding `DB` que recibe SvelteKit va envuelto
 * (siempre el mismo envoltorio) y cada pedido corre con su contador en `d1Context`.
 *
 * Baja en un clic (RFC 8058, src/lib/server/email/oneClick.js): el POST sin `Origin` que manda el
 * servidor de correo a una página de baja llega a SvelteKit con el `Origin` del sitio; si no, su
 * chequeo CSRF lo rechaza con 403. Solo esas rutas y solo sin `Origin`.
 *
 * Clave de caché (src/lib/server/cacheKey.js): los GET a las rutas públicas cacheables que no leen
 * el query (`/media/`, `/og/`, `/api/posts`, `/api/search-index.json`, los `.ics` públicos) le
 * llegan al adapter sin query y sin `cache-control`, así caen siempre en la misma entrada de su
 * caché. Las visitas se anotan con el pedido original.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import app from '../.svelte-kit/cloudflare/_worker.js';
import { handleScheduled } from '../src/lib/server/scheduled.js';
import { trackPageView } from '../src/lib/server/analytics/track.js';
import { withEdgeCache } from '../src/lib/server/edgeCache.js';
import { startServerTiming } from '../src/lib/server/serverTiming.js';
import { createD1Stats, d1ServerTiming, d1Timer } from '../src/lib/server/d1Timing.js';
import { allowOneClickPost } from '../src/lib/server/email/oneClick.js';
import { normalizeCacheableRequest } from '../src/lib/server/cacheKey.js';
import buildVersion from '../.svelte-kit/cloudflare/_app/version.json';

/**
 * El dibujante de worker/og.js, importado recién al usarlo (ver arriba). El import dinámico no va a
 * la red: wrangler lo empaqueta en el mismo archivo y solo posterga la inicialización del módulo.
 * @type {import('./og-render.js').OgRenderer}
 */
const renderOg = async (tree, opts) => (await import('./og.js')).renderOg(tree, opts);

/** El contador de consultas a D1 del pedido en curso (src/lib/server/d1Timing.js). */
const d1Context = new AsyncLocalStorage();
const timedDB = d1Timer(() => /** @type {any} */ (d1Context.getStore()));

export default {
	/**
	 * @param {Request} request
	 * @param {Record<string, unknown>} env
	 * @param {import('@cloudflare/workers-types').ExecutionContext} ctx
	 */
	async fetch(incoming, env, ctx) {
		const request = allowOneClickPost(incoming);
		const appRequest = normalizeCacheableRequest(request);
		const timing = startServerTiming();
		const d1 = createD1Stats();
		const og = new URL(request.url).pathname.startsWith('/og/');
		const appEnv = { ...env, DB: timedDB(env.DB), ...(og ? { OG_RENDER: renderOg } : {}) };
		const response = await withEdgeCache(
			appRequest,
			ctx,
			() => d1Context.run(d1, () => app.fetch(appRequest, appEnv, ctx)),
			{
				cache: typeof caches === 'undefined' ? undefined : /** @type {any} */ (caches).default,
				version: buildVersion.version,
				enabled: env.KV_EDGE_CACHE !== 'off'
			}
		);
		// Sincrónico y nunca tira (writeDataPoint no espera la red). No lee el cuerpo.
		trackPageView(request, response, env);
		return timing(response, d1ServerTiming(d1));
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
