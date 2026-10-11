/**
 * La imagen de una tarjeta de vista previa (docs/compartir.md): `/og/<tarjeta>/<hash>.jpg`, con
 * las portadas de los próximos eventos y los textos del panel. La dirección lleva el hash de lo
 * que se dibuja (src/lib/server/linkPreview.js), así que la respuesta se guarda para siempre.
 *
 * - Hash viejo (cambió un texto o una portada): 302 a la dirección de ahora.
 * - Ya dibujada: de la caché de Cloudflare o de R2.
 * - Si no, se dibuja (worker/og.js), se guarda en R2 y en la caché, y se manda.
 * - Si no se puede dibujar (sin base, en `vite dev`, o si falla): 302 a la tarjeta de `static/`
 *   (el mismo diseño, sin portadas), por un rato.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { linkPreviewState } from '$lib/server/linkPreview.js';
import { OG_IMMUTABLE, OG_SHORT, ogStorageKey, renderCard } from '$lib/server/ogImage.js';
import { OG_CARDS, isOgCard } from '$lib/utils/ogCards.js';

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

/** @param {string} location */
const redirect302 = (location) =>
	new Response(null, { status: 302, headers: { location, 'cache-control': OG_SHORT } });

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, url, fetch }) {
	const card = params.card;
	const m = FILE.exec(params.file);
	if (!isOgCard(card) || !m) error(404, 'No existe esa imagen.');
	const fallback = () => redirect302('/' + OG_CARDS[card].file);
	if (!getDB(platform)) return fallback();
	const current = (await linkPreviewState(platform)).cards[card];
	if (!current) return fallback();
	if (current.hash !== m[1]) return redirect302(current.url);

	const env = /** @type {import('$lib/server/ogImage.js').OgEnv} */ (platform?.env ?? {});
	const cache = /** @type {any} */ (platform?.caches)?.default;
	const cacheKey = new Request(url.origin + current.url);
	const hit = await cache?.match(cacheKey).catch(() => null);
	if (hit) return hit;

	const key = ogStorageKey(card, current.hash);
	const waitUntil = (/** @type {Promise<unknown>} */ p) =>
		platform?.ctx?.waitUntil(p.catch((e) => console.error('[og] guardar la imagen:', e)));
	const stored = await env.MEDIA?.get(key).catch(() => null);
	if (stored) {
		const bytes = await stored.arrayBuffer();
		waitUntil(cache?.put(cacheKey, jpeg(bytes, OG_IMMUTABLE)) ?? Promise.resolve());
		return jpeg(bytes, OG_IMMUTABLE);
	}
	if (!env.OG_RENDER) return fallback();

	let result;
	try {
		result = await renderCard(current.spec, { env, fetch, origin: url.origin });
	} catch (e) {
		console.error('[og] dibujar la imagen:', e);
		return fallback();
	}
	if (!result.complete) return jpeg(result.bytes, OG_SHORT);
	const { bytes } = result;
	waitUntil(
		Promise.all([
			env.MEDIA?.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } }),
			cache?.put(cacheKey, jpeg(bytes, OG_IMMUTABLE))
		])
	);
	return jpeg(bytes, OG_IMMUTABLE);
}
