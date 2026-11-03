/**
 * /media/<clave>: los archivos de la biblioteca, desde R2 (docs/imagenes.md): imágenes
 * (`img/<sha-256>.<ext>`) y documentos o videos (`file/<sha-256>.<ext>`).
 *
 * La clave es por contenido: un archivo nunca cambia, así que se guarda en caché para siempre.
 * Solo se sirve si su objeto (`imagen` o `archivo`) existe y lo puede ver cualquiera (uno borrado
 * deja de servirse aunque su archivo siga en R2). Lo que no existe es 404.
 *
 * La imagen de un perfil es la excepción: se guarda un día, y si el perfil dejó de mostrarse
 * (oculto, borrado, sin aprobar) solo se sirve a quien lo ve, sin caché compartida
 * (`servableMedia` en $lib/server/media/library.js decide y dice el `Cache-Control`).
 *
 * - Siempre: el tipo correcto y `X-Content-Type-Options: nosniff` (el navegador no adivina otro).
 * - PDF y video: `Content-Disposition: inline` con un nombre seguro (se abren en el navegador);
 *   ODT, ODS y ODP: `attachment` (se descargan).
 * - Pedidos de una parte (`Range`), para adelantar un video: 206 con `Content-Range`, 416 si el
 *   rango está fuera del archivo; `Accept-Ranges: bytes` en todas las respuestas.
 * - Las copias chicas de las tarjetas (`img/<hash>-360.webp`, `-720.webp`; $lib/utils/mediaCopies.js):
 *   la copia si está en R2 (en caché para siempre, como el original) y, si todavía no está (una
 *   imagen de antes de la pasada de scripts/copias-chicas.js), una redirección al original que se
 *   guarda solo {@link MISSING_COPY_CACHE}, así la copia se ve apenas exista.
 * - `Cache-Tag`: `img-<hash>` (el original y sus copias) o `file-<hash>`, para purgarlos de la
 *   caché del borde cuando dejan de servirse ($lib/server/media/purge.js). Cloudflare la saca
 *   antes de que llegue al navegador.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { servableCopy, servableMedia } from '$lib/server/media/library.js';
import { mediaCacheTag } from '$lib/server/media/purge.js';
import { contentRange, disposition, parseRange } from '$lib/server/media/range.js';
import { MEDIA_KEY } from '$lib/server/objects/types/imagen.js';
import { FILE_KEY } from '$lib/server/objects/types/archivo.js';
import { COPY_KEY } from '$lib/utils/mediaCopies.js';

/** Una imagen (o un archivo que se descarga) nunca corre nada, aunque alguien lo abra solo. */
const SANDBOX = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** Cuánto se guarda la redirección de una copia que todavía no existe: una hora. */
const MISSING_COPY_CACHE = 'public, max-age=3600';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, request, locals }) {
	const key = params.key;
	const who = { viewer: viewerFor(locals), accountId: locals.member?.id ?? null };
	if (COPY_KEY.test(key)) return serveCopy(key, platform, request, who);
	const isImage = MEDIA_KEY.test(key);
	if (!isImage && !FILE_KEY.test(key)) error(404, 'No existe.');
	const db = getDB(platform);
	const bucket = platform?.env?.MEDIA;
	if (!db || !bucket) error(404, 'No existe.');
	const found = await servableMedia(db, key, who);
	if (!found) error(404, 'No existe.');
	const hash = key.slice(key.indexOf('/') + 1, key.lastIndexOf('.'));
	const etag = `"${hash}"`;
	const headers = new Headers({
		'Content-Type': found.mime,
		'Cache-Control': found.cacheControl,
		ETag: etag,
		'X-Content-Type-Options': 'nosniff',
		'Accept-Ranges': 'bytes',
		'Cache-Tag': String(mediaCacheTag(key))
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

/**
 * Una copia chica: la copia de R2, o una redirección al original si todavía no está.
 * @param {string} key
 * @param {App.Platform | undefined} platform
 * @param {Request} request
 * @param {import('$lib/server/media/library.js').MediaViewer} who
 */
async function serveCopy(key, platform, request, who) {
	const db = getDB(platform);
	const bucket = platform?.env?.MEDIA;
	if (!db || !bucket) error(404, 'No existe.');
	const found = await servableCopy(db, key, who);
	if (!found) error(404, 'No existe.');
	const etag = `"${key.slice(key.indexOf('/') + 1, key.lastIndexOf('.'))}"`;
	const headers = new Headers({
		'Content-Type': 'image/webp',
		'Cache-Control': found.cacheControl,
		ETag: etag,
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': SANDBOX,
		'Cache-Tag': String(mediaCacheTag(key))
	});
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}
	const object = await bucket.get(key);
	if (!object) {
		return new Response(null, {
			status: 302,
			headers: { Location: `/media/${found.original}`, 'Cache-Control': MISSING_COPY_CACHE }
		});
	}
	headers.set('Content-Length', String(object.size));
	return new Response(/** @type {any} */ (object.body), { headers });
}
