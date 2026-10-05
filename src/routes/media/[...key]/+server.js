/**
 * /media/<clave>: los archivos de la biblioteca, desde R2 (docs/imagenes.md): imágenes
 * (`img/<sha-256>.<ext>`) y documentos o videos (`file/<sha-256>.<ext>`).
 *
 * La clave es por contenido: un archivo nunca cambia, así que se guarda en caché para siempre.
 * Solo se sirve si su objeto (`imagen` o `archivo`) existe y lo puede ver cualquiera (uno borrado
 * deja de servirse aunque su archivo siga en R2). Lo que no existe es 404.
 *
 * - Siempre: el tipo correcto y `X-Content-Type-Options: nosniff` (el navegador no adivina otro).
 * - PDF y video: `Content-Disposition: inline` con un nombre seguro (se abren en el navegador);
 *   ODT, ODS y ODP: `attachment` (se descargan).
 * - Pedidos de una parte (`Range`), para adelantar un video: 206 con `Content-Range`, 416 si el
 *   rango está fuera del archivo; `Accept-Ranges: bytes` en todas las respuestas.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { IMMUTABLE_CACHE, servableMedia } from '$lib/server/media/library.js';
import { contentRange, disposition, parseRange } from '$lib/server/media/range.js';
import { MEDIA_KEY } from '$lib/server/objects/types/imagen.js';
import { FILE_KEY } from '$lib/server/objects/types/archivo.js';

/** Una imagen (o un archivo que se descarga) nunca corre nada, aunque alguien lo abra solo. */
const SANDBOX = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, request }) {
	const key = params.key;
	const isImage = MEDIA_KEY.test(key);
	if (!isImage && !FILE_KEY.test(key)) error(404, 'No existe.');
	const db = getDB(platform);
	const bucket = platform?.env?.MEDIA;
	if (!db || !bucket) error(404, 'No existe.');
	const found = await servableMedia(db, key);
	if (!found) error(404, 'No existe.');
	const hash = key.slice(key.indexOf('/') + 1, key.lastIndexOf('.'));
	const etag = `"${hash}"`;
	const headers = new Headers({
		'Content-Type': found.mime,
		'Cache-Control': IMMUTABLE_CACHE,
		ETag: etag,
		'X-Content-Type-Options': 'nosniff',
		'Accept-Ranges': 'bytes'
	});
	if (found.kind === 'imagen') {
		headers.set('Content-Security-Policy', SANDBOX);
	} else if (found.mime === 'application/pdf' || found.kind === 'video') {
		// Sin `sandbox`: el visor de PDF del navegador no abre en un documento con sandbox.
		headers.set('Content-Disposition', disposition('inline', found.title, found.ext));
	} else {
		headers.set('Content-Security-Policy', SANDBOX);
		headers.set('Content-Disposition', disposition('attachment', found.title, found.ext));
	}
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}
	const range = parseRange(request.headers.get('range'), found.size);
	if (range === 'unsatisfiable') {
		headers.set('Content-Range', `bytes */${found.size}`);
		return new Response(null, { status: 416, headers });
	}
	const object = range ? await bucket.get(key, { range }) : await bucket.get(key);
	if (!object) error(404, 'No existe.');
	if (range) {
		headers.set('Content-Range', contentRange(range, object.size));
		headers.set('Content-Length', String(range.length));
		return new Response(/** @type {any} */ (object.body), { status: 206, headers });
	}
	headers.set('Content-Length', String(object.size));
	return new Response(/** @type {any} */ (object.body), { headers });
}
