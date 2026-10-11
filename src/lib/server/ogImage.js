/**
 * La imagen de una tarjeta de vista previa (`/og/<tarjeta>/<hash>.jpg`, docs/compartir.md): junta
 * lo que se dibuja (las fuentes y el logo de los archivos estáticos, las miniaturas de las
 * portadas) y se lo pasa al dibujante del Worker (`platform.env.OG_RENDER`, worker/og.js). La
 * imagen se guarda en R2 (`og/<tarjeta>-<hash>.jpg` en el bucket `MEDIA`) y en la caché de
 * Cloudflare: se dibuja una vez por cada cambio de textos o portadas.
 *
 * Las miniaturas (250 × 250, JPEG) las hace el binding de imágenes de Cloudflare (`IMAGES`): casi
 * todas las portadas son WEBP y el dibujante (resvg) no lee WEBP. Sin el binding (local), solo
 * sirven las portadas JPG o PNG livianas.
 */
import { toBase64 } from '$lib/utils/base64.js';
import { isMediaPath, isPublicMediaUrl } from '$lib/utils/media.js';
import { OG_CARD_SIZE } from '$lib/utils/ogCards.js';
import {
	COLLAGE_FONTS,
	COLLAGE_LOGO,
	COLLAGE_TILE,
	collageTiles,
	collageTree
} from '$lib/utils/ogCollage.js';

/** Una tarjeta dibujada no cambia nunca (su dirección lleva el hash). */
export const OG_IMMUTABLE = 'public, max-age=31536000, immutable';
/** Lo provisorio (redirecciones, una imagen sin todas las portadas): un rato. */
export const OG_SHORT = 'public, max-age=300';

/** La clave en R2 de una tarjeta ya dibujada. @param {string} card @param {string} hash */
export const ogStorageKey = (card, hash) => `og/${card}-${hash}.jpg`;

/** Sin el binding de imágenes, hasta este peso se usa una portada JPG o PNG tal cual. */
const RAW_COVER_MAX = 400 * 1024;

/**
 * @typedef {object} OgEnv
 * @property {import('@cloudflare/workers-types').R2Bucket} [MEDIA]
 * @property {import('@cloudflare/workers-types').ImagesBinding} [IMAGES]
 * @property {import('@cloudflare/workers-types').Fetcher} [ASSETS]
 * @property {import('../../../worker/og-render.js').OgRenderer} [OG_RENDER]
 */

/**
 * Un archivo estático (fuente, logo): por el binding `ASSETS` en el Worker, o por `fetch` (en
 * `vite dev` y en las pruebas).
 * @param {OgEnv} env
 * @param {typeof fetch} fetchFn
 * @param {string} origin
 * @param {string} path
 */
async function staticFile(env, fetchFn, origin, path) {
	const url = new URL(path, origin);
	const res = env.ASSETS
		? /** @type {Response} */ (/** @type {unknown} */ (await env.ASSETS.fetch(url.href)))
		: await fetchFn(url.href);
	if (!res.ok) throw new Error(`${path}: ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}

/**
 * La portada original: de R2 (`/media/img/…`) o, en los eventos de demo de un preview, del sitio
 * público (solo `https://kinkyvibe.ar/media/img/…`).
 * @param {OgEnv} env
 * @param {string} src
 * @returns {Promise<{ body: ReadableStream<Uint8Array>, type: string, size: number | null } | null>}
 */
async function coverSource(env, src) {
	if (isMediaPath(src)) {
		const obj = await env.MEDIA?.get(src.slice('/media/'.length));
		if (!obj) return null;
		return {
			body: /** @type {ReadableStream<Uint8Array>} */ (/** @type {unknown} */ (obj.body)),
			type: obj.httpMetadata?.contentType ?? '',
			size: obj.size
		};
	}
	if (isPublicMediaUrl(src)) {
		const res = await fetch(src);
		if (!res.ok || !res.body) return null;
		return {
			body: res.body,
			type: res.headers.get('content-type') ?? '',
			size: Number(res.headers.get('content-length')) || null
		};
	}
	return null;
}

/**
 * La miniatura de una portada como dirección `data:` (JPEG de {@link COLLAGE_TILE} px), o `null`
 * si no se pudo.
 * @param {OgEnv} env
 * @param {string} src
 */
export async function coverThumb(env, src) {
	const source = await coverSource(env, src);
	if (!source) return null;
	if (env.IMAGES) {
		const out = await env.IMAGES.input(/** @type {any} */ (source.body))
			.transform({ width: COLLAGE_TILE, height: COLLAGE_TILE, fit: 'cover' })
			.output({ format: 'image/jpeg', quality: 80 });
		const bytes = await out.response().arrayBuffer();
		return `data:image/jpeg;base64,${toBase64(bytes)}`;
	}
	const type = source.type.split(';')[0].trim();
	if (!['image/jpeg', 'image/png'].includes(type) || (source.size ?? Infinity) > RAW_COVER_MAX) {
		await source.body.cancel();
		return null;
	}
	return `data:${type};base64,${toBase64(await new Response(source.body).arrayBuffer())}`;
}

/**
 * Dibuja una tarjeta. `complete` es `false` si alguna portada no se pudo leer: esa imagen no se
 * guarda (la próxima vez se vuelve a intentar).
 * @param {ReturnType<typeof import('./linkPreview.js').cardSpec>} spec
 * @param {{ env: OgEnv, fetch: typeof fetch, origin: string }} ctx
 * @returns {Promise<{ bytes: Uint8Array, complete: boolean }>}
 */
export async function renderCard(spec, { env, fetch: fetchFn, origin }) {
	if (!env.OG_RENDER) throw new Error('Sin dibujante (OG_RENDER)');
	const unique = [...new Set(spec.tiles)];
	const [fonts, logo, thumbs] = await Promise.all([
		Promise.all(
			COLLAGE_FONTS.map(async (f) => ({
				name: f.name,
				weight: f.weight,
				data: await staticFile(env, fetchFn, origin, f.file)
			}))
		),
		staticFile(env, fetchFn, origin, COLLAGE_LOGO),
		Promise.all(unique.map((src) => coverThumb(env, src).catch(() => null)))
	]);
	/** @type {Map<string, string>} */
	const bySrc = new Map();
	unique.forEach((src, i) => {
		const t = thumbs[i];
		if (t) bySrc.set(src, t);
	});
	// En el orden de la tarjeta; si faltó alguna, las que hay se repiten hasta llenar el mosaico.
	const tiles = collageTiles(spec.tiles.filter((src) => bySrc.has(src))).map(
		(src) => /** @type {string} */ (bySrc.get(src))
	);
	const tree = collageTree({
		name: spec.name,
		subtitle: spec.subtitle,
		tiles,
		logo: `data:image/png;base64,${toBase64(logo)}`
	});
	const bytes = await env.OG_RENDER(tree, { ...OG_CARD_SIZE, fonts });
	return { bytes, complete: bySrc.size === unique.length };
}
