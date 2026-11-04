/**
 * La imagen de la vista previa de un objeto sin imagen propia (docs/compartir.md):
 * `/og/objeto/<tipo>/<dirección>/<hash>.jpg`, con el diseño «Ficha» (src/lib/utils/ogObjeto.js). La
 * dirección lleva el hash de lo que se dibuja (el título, la fecha, el lugar, el resumen…), así que
 * la respuesta se guarda para siempre. Lo mismo que las tarjetas de las secciones
 * (src/routes/og/[card]/[file]/+server.js):
 *
 * - Ya en la caché de Cloudflare con esta misma dirección: de ahí, sin mirar la base.
 * - Hash viejo (cambió algo del objeto): 302 a la dirección de ahora.
 * - Ya dibujada: de R2 (`og/objeto-<hash>.jpg` en `MEDIA`).
 * - Si no, se dibuja (worker/og.js), se guarda en R2 y en la caché, y se manda.
 * - Si no se puede (sin base, en `vite dev`, el objeto ya no se ve sin cuenta o tiene imagen, o
 *   falla el dibujo): 302 a la tarjeta de `static/` (la de la Kinkipedia para una entrada; la por
 *   defecto para lo demás), por un rato.
 *
 * Lo que se dibuja es siempre lo que ve alguien sin cuenta: nunca un evento oculto ni una dirección
 * escondida, aunque quien compartió el link sea admin.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { OG_IMMUTABLE, OG_SHORT } from '$lib/server/ogImage.js';
import { objectCardSpecFor, objectCardStorageKey, renderObjectCard } from '$lib/server/ogObjeto.js';
import { OG_CARDS } from '$lib/utils/ogCards.js';
import { isObjectCardKind, objectCardHash, objectCardPath } from '$lib/utils/ogObjeto.js';

const FILE = /^([0-9a-f]{16})\.jpg$/;

/**
 * @param {BodyInit | null} body
 * @param {string} cacheControl
 */
function jpeg(body, cacheControl) {
	return new Response(body, {
		headers: {
			'content-type': 'image/jpeg',
			'cache-control': cacheControl,
			'x-content-type-options': 'nosniff'
		}
	});
}

/**
 * @param {string} location
 * @param {string} [reason] por qué se manda la de respaldo (`x-og-fallback`: `no-db`,
 *   `no-object`, `no-renderer` o `render-error: …`)
 */
const redirect302 = (location, reason) =>
	new Response(null, {
		status: 302,
		headers: {
			location,
			'cache-control': OG_SHORT,
			...(reason ? { 'x-og-fallback': reason } : {})
		}
	});

/** El error en una línea corta, sin caracteres raros (va en un encabezado). @param {unknown} e */
const errorLine = (e) =>
	(e instanceof Error ? `${e.name}: ${e.message}` : String(e))
		.replace(/[^\x20-\x7e]/g, '?')
		.slice(0, 160);

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, url, fetch }) {
	const { kind, slug } = params;
	const m = FILE.exec(params.file);
	if (!isObjectCardKind(kind) || !m || !slug) error(404, 'No existe esa imagen.');
	const fallbackFile = OG_CARDS[kind === 'wiki' ? 'wiki' : 'default'].file;
	const fallback = (/** @type {string} */ reason) => redirect302('/' + fallbackFile, reason);
	// Primero la caché de Cloudflare, con la dirección pedida (sin `?…`): si está, ni la base.
	const cache = /** @type {any} */ (platform?.caches)?.default;
	const cacheKey = new Request(url.origin + url.pathname);
	const hit = await cache?.match(cacheKey).catch(() => null);
	if (hit) return hit;
	if (!getDB(platform)) return fallback('no-db');

	let spec;
	try {
		spec = await objectCardSpecFor(platform, kind, slug);
	} catch (e) {
		console.error('[og] leer el objeto:', e);
		return fallback(`render-error: ${errorLine(e)}`);
	}
	if (!spec?.title) return fallback('no-object');
	const hash = await objectCardHash(spec);
	if (hash !== m[1]) return redirect302(objectCardPath(kind, slug, hash));

	const env = /** @type {import('$lib/server/ogImage.js').OgEnv} */ (platform?.env ?? {});
	const key = objectCardStorageKey(hash);
	const waitUntil = (/** @type {Promise<unknown>} */ p) =>
		platform?.ctx?.waitUntil(p.catch((e) => console.error('[og] guardar la imagen:', e)));
	const stored = await env.MEDIA?.get(key).catch(() => null);
	if (stored) {
		const bytes = await stored.arrayBuffer();
		waitUntil(cache?.put(cacheKey, jpeg(bytes, OG_IMMUTABLE)) ?? Promise.resolve());
		return jpeg(bytes, OG_IMMUTABLE);
	}
	if (!env.OG_RENDER) return fallback('no-renderer');

	let bytes;
	try {
		bytes = await renderObjectCard(spec, { env, fetch, origin: url.origin });
	} catch (e) {
		console.error('[og] dibujar la imagen:', e);
		return fallback(`render-error: ${errorLine(e)}`);
	}
	waitUntil(
		Promise.all([
			env.MEDIA?.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } }),
			cache?.put(cacheKey, jpeg(bytes, OG_IMMUTABLE))
		])
	);
	return jpeg(bytes, OG_IMMUTABLE);
}
