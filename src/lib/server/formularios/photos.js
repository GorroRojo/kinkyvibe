/**
 * Las preguntas «Foto» de los formularios (docs/formularios.md, «Foto»): la subida desde la página
 * pública y cómo se sirve la foto (solo al panel y a la API de Gancho, nunca en /media).
 *
 * - **Dónde.** En el bucket `MEDIA`, bajo `formularios/<formulario>/<sha-256>.<ext>`
 *   (`photoKey`). Ese prefijo no es la biblioteca: /media solo sirve `img/` y `file/`, y la copia
 *   nocturna de la biblioteca tampoco lo lleva. La respuesta guarda la clave, no los bytes.
 * - **Qué se acepta.** Lo que dicen los bytes (`sniffImage`: JPG, PNG, WEBP, GIF, AVIF), nunca el
 *   nombre ni el tipo que manda el navegador; hasta {@link PHOTO_MAX_BYTES}. Se le sacan los
 *   metadatos (GPS, fecha, modelo del celu: `stripImageMetadata`, lo mismo que la biblioteca)
 *   antes de calcular el hash y guardarla.
 * - **Tope.** Megabytes de fotos por formulario y por conexión (hash, sin la IP) por hora
 *   ({@link PHOTO_RATE_LIMIT}), además del tope de respuestas de public.js.
 * - **Sin borrado automático** (gorrite, 24/11): la usa la app de Gancho el día del evento y quizás
 *   después.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { clientOf } from '$lib/server/cuentas/web.js';
import { stripImageMetadata } from '$lib/server/media/metadata.js';
import { sha256Hex, sniffImage } from '$lib/server/media/sniff.js';
import { PHOTO_MAX_BYTES, answerName, isPhotoKey, photoKey } from '$lib/utils/formularios.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */
/** @typedef {import('./store.js').Form} Form */

/** Megabytes de fotos por formulario y por conexión en una hora (redondeado para arriba). */
export const PHOTO_RATE_LIMIT = Object.freeze({ limit: 60, windowSeconds: 60 * 60 });

/** Cómo se guarda y se sirve una foto: privada, nunca en una caché compartida. */
export const PHOTO_CACHE = 'private, no-store';

/** Una imagen nunca corre nada, aunque alguien la abra sola (como /media). */
const SANDBOX = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const MB = 1024 * 1024;

/** Los tipos por extensión, por si R2 no tiene el guardado. */
const MIME_OF = /** @type {Record<string, string>} */ ({
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	avif: 'image/avif'
});

/** ¿El formulario tiene alguna pregunta «Foto»? @param {{ questions: { kind: string }[] }} form */
export const hasPhotoQuestion = (form) => form.questions.some((q) => q.kind === 'photo');

/**
 * @typedef {{ key: string, bytes: Uint8Array, mime: string }} PendingPhoto
 * @typedef {{ ok: true, keys: Record<string, string>, pending: PendingPhoto[],
 *     errors: Record<string, string> }
 *   | { ok: false, status: number, message: string }} TakenPhotos
 */

/**
 * Lee las fotos que llegaron (sin guardarlas todavía): por pregunta, la clave que va a tener y sus
 * bytes ya limpios, o el error del campo. Un archivo vacío (el campo sin elegir) es «sin foto».
 * Falla entero (`ok: false`) si no hay dónde guardarlas o si se pasó del tope.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {D1Database} db
 * @param {Form} form
 * @param {FormData} data
 * @returns {Promise<TakenPhotos>}
 */
export async function takePhotos(event, db, form, data) {
	/** @type {Record<string, string>} */
	const keys = {};
	/** @type {PendingPhoto[]} */
	const pending = [];
	/** @type {Record<string, string>} */
	const errors = {};
	/** @type {{ id: string, file: File }[]} */
	const files = [];
	for (const q of form.questions) {
		if (q.kind !== 'photo') continue;
		const v = data.get(answerName(q.id));
		// Un texto (no un archivo) no es una foto: así nadie manda la clave de otra.
		if (v && typeof v === 'object' && 'arrayBuffer' in v && v.size > 0)
			files.push({ id: q.id, file: v });
	}
	if (!files.length) return { ok: true, keys, pending, errors };
	if (!event.platform?.env?.MEDIA)
		return {
			ok: false,
			status: 503,
			message: 'Todavía no se pueden subir fotos. Probá más tarde.'
		};

	const total = files.reduce((n, f) => n + f.file.size, 0);
	const client = await clientOf(event);
	const allowed = await hitRateLimit(
		db,
		`form:${form.id}:foto:${client}`,
		PHOTO_RATE_LIMIT,
		Date.now(),
		Math.max(1, Math.ceil(total / MB))
	);
	if (!allowed.allowed)
		return {
			ok: false,
			status: 429,
			message: 'Subiste muchas fotos seguidas. Esperá un rato y probá de nuevo.'
		};

	for (const { id, file } of files) {
		if (file.size > PHOTO_MAX_BYTES) {
			errors[id] = `La foto pesa más de ${PHOTO_MAX_BYTES / MB} MB. Elegí una más liviana.`;
			continue;
		}
		const raw = new Uint8Array(await file.arrayBuffer());
		const sniffed = sniffImage(raw);
		if (!sniffed) {
			errors[id] = 'La foto tiene que ser JPG, PNG, WEBP, GIF o AVIF.';
			continue;
		}
		// Sin GPS, fecha ni comentarios, antes del hash: lo guardado nunca los lleva.
		const bytes = stripImageMetadata(raw);
		const key = photoKey(form.id, await sha256Hex(bytes), sniffed.ext);
		keys[id] = key;
		pending.push({ key, bytes, mime: sniffed.mime });
	}
	return { ok: true, keys, pending, errors };
}

/**
 * Guarda en R2 las fotos leídas por {@link takePhotos} (la misma foto ya guardada no se vuelve a
 * subir: la clave es por contenido).
 * @param {R2Bucket} bucket
 * @param {PendingPhoto[]} pending
 */
export async function storePhotos(bucket, pending) {
	for (const p of pending) {
		if (await bucket.head(p.key)) continue;
		await bucket.put(p.key, p.bytes, {
			httpMetadata: { contentType: p.mime, cacheControl: PHOTO_CACHE }
		});
	}
}

/**
 * La foto de una clave como respuesta HTTP (privada, sin caché, `nosniff`), o `null` si la clave
 * no es de una foto de formulario o no está en R2.
 * @param {R2Bucket | undefined | null} bucket
 * @param {unknown} key
 */
export async function photoResponse(bucket, key) {
	if (!bucket || !isPhotoKey(key)) return null;
	const obj = await bucket.get(key);
	if (!obj) return null;
	const ext = key.slice(key.lastIndexOf('.') + 1);
	return new Response(/** @type {ReadableStream} */ (/** @type {unknown} */ (obj.body)), {
		headers: {
			'content-type': MIME_OF[ext] ?? 'application/octet-stream',
			'content-length': String(obj.size),
			'cache-control': PHOTO_CACHE,
			'x-content-type-options': 'nosniff',
			'content-security-policy': SANDBOX,
			'x-robots-tag': 'noindex'
		}
	});
}
