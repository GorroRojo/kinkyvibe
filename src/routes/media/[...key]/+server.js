/**
 * /media/<clave>: los archivos de la biblioteca de imágenes, desde R2 (docs/imagenes.md).
 *
 * La clave es por contenido (`img/<sha-256>.<ext>`): un archivo nunca cambia, así que se guarda en
 * caché para siempre. Solo se sirve si su objeto `imagen` existe y lo puede ver cualquiera (una
 * imagen borrada deja de servirse aunque su archivo siga en R2). Lo que no existe es 404.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { IMMUTABLE_CACHE, servableImage } from '$lib/server/media/library.js';
import { MEDIA_KEY } from '$lib/server/objects/types/imagen.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, request }) {
	const key = params.key;
	if (!MEDIA_KEY.test(key)) error(404, 'No existe.');
	const db = getDB(platform);
	const bucket = platform?.env?.MEDIA;
	if (!db || !bucket) error(404, 'No existe.');
	const image = await servableImage(db, key);
	if (!image) error(404, 'No existe.');
	const etag = `"${key.slice(4, 68)}"`;
	const headers = new Headers({
		'Content-Type': image.mime,
		'Cache-Control': IMMUTABLE_CACHE,
		ETag: etag,
		'X-Content-Type-Options': 'nosniff',
		// Una imagen nunca corre nada, aunque alguien la abra sola.
		'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
	});
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}
	const object = await bucket.get(key);
	if (!object) error(404, 'No existe.');
	headers.set('Content-Length', String(object.size));
	return new Response(/** @type {any} */ (object.body), { headers });
}
