/**
 * Adelantar consultas de la página de un post (evento o material): lo que la página pregunta
 * después de leer el post y la lista, pedido a la par de su lectura con lo que ya sabe este isolate
 * del post (las listas armadas la última vez, `peekSitePost`). Son las mismas consultas que salen
 * después: con las tandas automáticas (src/lib/server/db/autoBatch.js) van en la misma ida que la
 * lectura del post, y las de después reciben lo ya leído. Si el post cambió y la pregunta de verdad
 * es otra, sale aparte, como siempre: esto nunca decide qué se muestra.
 *
 * Solo sin sesión (con sesión, quien mira cambia las respuestas) y solo si la base junta las
 * lecturas del pedido (sin tandas, adelantar es consultar de más).
 */
import { currentRelated, relatedPostsFor } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { batchesReads } from '$lib/server/db/autoBatch.js';
import { relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { personasForPage } from '$lib/server/personas/index.js';
import { peekSitePost } from './posts.js';

/** @param {Promise<unknown>} p */
const quiet = (p) => {
	p.catch(() => {});
};

/**
 * Adelanta los lugares de los relacionados («Más cosas de…») y las personas del post. Devuelve el
 * post como lo tienen las listas (para que la página adelante lo suyo), o `null` si no adelantó
 * nada.
 *
 * @param {App.Platform | undefined} platform
 * @param {App.Locals} locals
 * @param {'calendario' | 'material'} category
 * @param {string} slug
 * @returns {{ db: import('@cloudflare/workers-types').D1Database, meta: Record<string, any> } | null}
 */
export function askPostPageEarly(platform, locals, category, slug) {
	const db = getDB(platform);
	if (!db || !batchesReads(db) || locals.user || locals.member) return null;
	const guess = peekSitePost(category, slug);
	if (!guess) return null;
	const meta = guess.post.meta;
	quiet(relatedWithVenuePlaces(db, currentRelated(relatedPostsFor(meta, guess.posts))));
	quiet(personasForPage(platform, meta));
	return { db, meta };
}
