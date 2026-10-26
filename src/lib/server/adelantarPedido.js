/**
 * Lo primero de cada pedido (hooks.server.js): poner el árbol de etiquetas del pedido
 * (`applySiteTags`, src/lib/server/etiquetas/source.js) y, en las páginas públicas, pedir antes lo
 * que el pedido va a leer de todos modos, para que salga en la misma ida a la base.
 *
 * El árbol se recuerda 30 s por isolate. Mientras vale, el pedido no espera a la base acá y las
 * primeras consultas de la página (la marca del contenido y lo demás) salen juntas en una ida
 * (src/lib/server/db/autoBatch.js). Cuando venció (o el isolate es nuevo), el pedido espera esa
 * lectura antes de correr los loads, y todo lo que los loads iban a pedir después tardaba una ida
 * más (o varias). Entonces, en esa misma ida:
 *
 * - la marca del contenido (`askListsEarly`) y, en un isolate recién nacido, las consultas con que se
 *   arman las listas; después de poner el árbol, el pedido espera a que las listas estén armadas
 *   (sin ir a la base: ya está todo leído), así la página adelanta lo suyo con ellas;
 * - los interruptores vencidos (`askFlagsEarly`) y los textos de la vista previa al compartir
 *   (`askLinkPreviewEarly`).
 *
 * Y si al árbol le quedan pocos segundos (`aging`), se renueva sin esperar
 * (`refreshTagSourceAhead`): con visitas seguidas, ningún pedido espera por él.
 *
 * Nada de esto cambia qué se lee ni cuánto se recuerda cada cosa: son las mismas sentencias, antes
 * (las de después reciben lo ya leído). Solo en pedidos de lectura con las tandas automáticas
 * (sin ellas, adelantar es consultar de más) y solo en las páginas de `(content)`: las demás (el
 * panel, la API, /og) no leen las listas en cada pedido.
 */
import { getDB } from '$lib/server/db';
import { batchesReads } from '$lib/server/db/autoBatch.js';
import { askListsEarly, sitePosts } from '$lib/server/contenido/posts.js';
import { askFlagsEarly } from '$lib/server/flags.js';
import { askLinkPreviewEarly } from '$lib/server/linkPreview.js';
import {
	applySiteTags,
	refreshTagSourceAhead,
	tagSourceFreshness
} from '$lib/server/etiquetas/source.js';

/**
 * ¿Es una página pública (el grupo de rutas `(content)`)?
 * @param {{ route?: { id?: string | null } }} event
 */
const isContentPage = (event) => Boolean(event.route?.id?.startsWith('/(content)'));

/**
 * Pide antes lo que el pedido va a leer (ver arriba). Devuelve si pidió las listas de un isolate
 * recién nacido.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {boolean}
 */
export function askRequestEarly(event) {
	if (!isContentPage(event)) return false;
	const db = getDB(event.platform);
	if (!db || !batchesReads(db)) return false;
	const now = Date.now();
	const freshness = tagSourceFreshness(now);
	if (freshness === 'aging') {
		const ctx = /** @type {any} */ (event.platform)?.ctx;
		refreshTagSourceAhead(db, {
			now,
			waitUntil: ctx?.waitUntil ? (task) => ctx.waitUntil(task) : undefined
		});
	}
	// Si el árbol vale, el pedido no espera acá: lo demás sale con las primeras consultas de la página.
	if (freshness !== 'stale') return false;
	askFlagsEarly(db, { now });
	askLinkPreviewEarly(db, now);
	return askListsEarly(db);
}

/**
 * Lo de hooks.server.js antes de los loads: lo adelantado (ver arriba) y el árbol de etiquetas del
 * pedido. Nunca tira.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function startRequest(event) {
	const lists = askRequestEarly(event);
	await applySiteTags(event.platform);
	// Isolate recién nacido: las listas, ya con el árbol del pedido y sin otra ida (lo leyó la misma
	// tanda que el árbol). Si algo falla, la página lo vuelve a pedir y falla como siempre.
	if (lists) await sitePosts(event.platform).catch(() => {});
}
