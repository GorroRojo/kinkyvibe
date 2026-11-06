/**
 * Achicar una imagen en el navegador antes de subirla a la biblioteca (docs/imagenes.md): el lado
 * más largo queda en {@link MAX_SIDE} px como mucho y se pasa a WEBP. Si así pesa más de
 * {@link HEAVY_COVER_BYTES}, se achica un poco más ({@link SHRINK_STEPS}). Así se sube poco y el sitio
 * carga rápido. Si el navegador no sabe hacer WEBP (Safari), una foto JPEG se pasa a JPEG: dibujada
 * de nuevo, ya no lleva sus datos ocultos (GPS, fecha); un PNG, WEBP o AVIF va como está (puede
 * tener transparencias, que en JPEG saldrían negras). Si no puede dibujarla, o si el resultado pesa
 * más que el original sin haber hecho falta achicarlo, se sube el original (el servidor le saca
 * igual los metadatos a un JPEG, PNG, WEBP o AVIF: media/metadata.js).
 *
 * Del mismo dibujo salen también las dos copias chicas para las tarjetas (WEBP, lado más corto de
 * 360 y 720 px; $lib/utils/mediaCopies.js), que viajan con la subida. Si no salen, se sube igual
 * (la tarjeta usa el original hasta la pasada de scripts/copias-chicas.js). Y sus colores
 * principales (`colors`, $lib/utils/flyerColors.js: la paleta del carrusel de la portada); si no
 * salen, se sube sin colores.
 *
 * Las cuentas (medidas, qué hacer) son funciones puras y se prueban en vitest; lo que usa el
 * canvas recibe las funciones del navegador como parámetro.
 */
import { COPY_QUALITY, COPY_SIDES, copySize } from './mediaCopies.js';
import { colorsFromImage } from './flyerColors.js';

/** Lado más largo, en píxeles. */
export const MAX_SIDE = 2000;

/** Calidad del WEBP (0 a 1). */
export const WEBP_QUALITY = 0.85;

/** Calidad del JPEG, cuando el navegador no sabe hacer WEBP (0 a 1). */
export const JPEG_QUALITY = 0.85;

/** Lo que puede salir del canvas y se sube en lugar del original. */
const CONVERTED_TYPES = ['image/webp', 'image/jpeg'];

/**
 * «Portadas pesadas» (Para revisar, docs/imagenes.md): una portada que pesa más que esto se puede
 * «Achicar». Es el mismo número que usó la auditoría de UX.
 */
export const HEAVY_COVER_BYTES = 300 * 1024;

/** Lo más chico que puede quedar el lado largo al achicar con tope de peso. */
export const MIN_SHRINK_SIDE = 720;

/** La calidad más baja del WEBP al achicar con tope de peso. */
export const MIN_SHRINK_QUALITY = 0.5;

/**
 * Si con {@link MAX_SIDE} y {@link WEBP_QUALITY} todavía pesa más que lo pedido (`targetBytes`),
 * se prueban estos pasos en orden, hasta que alcance. Primero baja el lado hasta 1080 px; después,
 * la calidad (0,7, 0,62, 0,55); recién después, el lado otra vez (960, 840, 720). Nunca bajan de
 * {@link MIN_SHRINK_SIDE} px de lado largo ni de {@link MIN_SHRINK_QUALITY} de calidad: una portada
 * se ve a lo sumo a unos 768 px (24rem en 2×) y las tarjetas usan sus copias chicas. Si ni así
 * alcanza, queda el más liviano (y quien lo pidió decide si sirve: {@link muchLighter}).
 */
export const SHRINK_STEPS = Object.freeze([
	{ side: 1600, quality: 0.8 },
	{ side: 1280, quality: 0.78 },
	{ side: 1080, quality: 0.75 },
	{ side: 1080, quality: 0.7 },
	{ side: 1080, quality: 0.62 },
	{ side: 1080, quality: 0.55 },
	{ side: 960, quality: 0.55 },
	{ side: 840, quality: 0.55 },
	{ side: MIN_SHRINK_SIDE, quality: 0.55 },
	{ side: MIN_SHRINK_SIDE, quality: MIN_SHRINK_QUALITY }
]);

/** Cuánto más liviana tiene que quedar una copia (si no baja de {@link HEAVY_COVER_BYTES}). */
export const MIN_SAVING = 0.15;

/**
 * ¿La copia vale la pena? Sí si pesa como mucho {@link HEAVY_COVER_BYTES}, o al menos un
 * {@link MIN_SAVING} (15 %) menos que la original. «Achicar» (en el navegador) y swapCover (en el
 * servidor) usan esta misma regla: si no, no se cambia la portada.
 * @param {number} before bytes de la original
 * @param {number} after bytes de la copia
 */
export function muchLighter(before, after) {
	if (!(after > 0) || !(before > 0) || after >= before) return false;
	return after <= HEAVY_COVER_BYTES || after <= before * (1 - MIN_SAVING);
}

/**
 * Un peso en KB para la persona («381 KB»). Con `other` (el otro peso que se muestra al lado,
 * «antes» y «ahora»), suma decimales hasta que no se vean iguales si no lo son: «380,6 KB» y
 * «381,2 KB». Con coma decimal.
 * @param {number} bytes
 * @param {number} [other]
 */
export function kbText(bytes, other) {
	const k = bytes / 1024;
	let digits = 0;
	if (other !== undefined && other !== bytes) {
		const o = other / 1024;
		while (digits < 2 && k.toFixed(digits) === o.toFixed(digits)) digits++;
	}
	return `${k.toFixed(digits).replace('.', ',')} KB`;
}

/** Peso máximo del archivo que se elige (antes de achicar). El servidor tiene el mismo tope. */
export const MAX_PICK_BYTES = 10 * 1024 * 1024;

/** Lo que se achica y se pasa a WEBP. Un GIF se sube como está (puede ser animado). */
export const RESIZABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/** Lo que se puede elegir (el `accept` del input). */
export const PICKABLE_TYPES = [...RESIZABLE_TYPES, 'image/gif'];

/**
 * Las medidas para que el lado más largo no pase de `max` (sin agrandar nunca).
 * @param {number} width
 * @param {number} height
 * @param {number} [max]
 * @returns {{ width: number, height: number, scaled: boolean }}
 */
export function targetSize(width, height, max = MAX_SIDE) {
	const w = Math.max(1, Math.round(width));
	const h = Math.max(1, Math.round(height));
	const long = Math.max(w, h);
	if (long <= max) return { width: w, height: h, scaled: false };
	const k = max / long;
	return {
		width: Math.max(1, Math.round(w * k)),
		height: Math.max(1, Math.round(h * k)),
		scaled: true
	};
}

/**
 * ¿Se puede elegir este archivo? `''` si sí; si no, el porqué (para la persona).
 * @param {{ type: string, size: number }} file
 */
export function pickProblem(file) {
	if (!PICKABLE_TYPES.includes(file.type))
		return 'La imagen tiene que ser JPG, PNG, WEBP, GIF o AVIF.';
	if (file.size > MAX_PICK_BYTES) {
		return `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo es ${
			MAX_PICK_BYTES / 1024 / 1024
		} MB.`;
	}
	return '';
}

/** `foto de la fiesta.JPG` → `foto de la fiesta.webp` @param {string} name */
export function webpName(name) {
	return convertedName(name, 'image/webp');
}

/**
 * El nombre con la extensión de lo que salió del canvas: `.webp` o `.jpg`.
 * @param {string} name
 * @param {string} type
 */
export function convertedName(name, type) {
	const base = String(name || 'imagen').replace(/\.[^./]+$/, '');
	return `${base || 'imagen'}.${type === 'image/jpeg' ? 'jpg' : 'webp'}`;
}

/**
 * Entre el original y lo convertido, cuál se sube: lo convertido (WEBP, o JPEG si el navegador no
 * sabe hacer WEBP) si el navegador lo hizo de verdad y (si no hubo que achicar) pesa menos que el
 * original.
 * @param {{ size: number }} original
 * @param {{ type: string, size: number } | null} converted
 * @param {boolean} scaled
 */
export function keepConverted(original, converted, scaled) {
	if (!converted || !CONVERTED_TYPES.includes(converted.type) || converted.size === 0) return false;
	return scaled || converted.size < original.size;
}

/**
 * @typedef {{ side: number, blob: Blob }} ImageCopy una copia chica (`side`: su lado más corto
 *   pedido, 360 o 720)
 * @typedef {{ blob: Blob, name: string, width: number | null, height: number | null,
 *   converted: boolean, copies?: ImageCopy[], colors?: string[] | null }} PreparedImage
 */

/**
 * Suma las copias chicas a lo que se sube (`copy360`, `copy720`), si las hay, y los colores
 * (`colors`, en JSON).
 * @param {FormData} form
 * @param {PreparedImage} prepared
 */
export function appendCopies(form, prepared) {
	for (const c of prepared.copies ?? []) form.set(`copy${c.side}`, c.blob, `copia-${c.side}.webp`);
	if (prepared.colors?.length) form.set('colors', JSON.stringify(prepared.colors));
}

/**
 * Achica y pasa a WEBP (en el navegador), y hace las copias chicas. Si algo falla, devuelve el
 * original tal cual (sin copias).
 *
 * Con `targetBytes` (las subidas y «Achicar» una portada pesada usan {@link HEAVY_COVER_BYTES}): si
 * lo que sale pesa más que eso, prueba los pasos de {@link SHRINK_STEPS} hasta que alcance (o queda
 * el más liviano). Si ya alcanza con el tamaño de siempre, no prueba nada más.
 *
 * @param {File} file
 * @param {{ createImageBitmap?: typeof globalThis.createImageBitmap,
 *   makeCanvas?: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas }} [env]
 * @param {{ targetBytes?: number }} [opts]
 * @returns {Promise<PreparedImage>}
 */
export async function prepareImage(file, env = {}, { targetBytes } = {}) {
	const original = { blob: file, name: file.name, width: null, height: null, converted: false };
	const decode = env.createImageBitmap ?? globalThis.createImageBitmap;
	if (!RESIZABLE_TYPES.includes(file.type) || typeof decode !== 'function') return original;
	/** @type {ImageBitmap | undefined} */
	let bitmap;
	try {
		bitmap = await decode(file, { imageOrientation: 'from-image' });
		const makeCanvas = env.makeCanvas ?? defaultCanvas;
		let size = targetSize(bitmap.width, bitmap.height);
		let blob = await drawConverted(bitmap, size, WEBP_QUALITY, makeCanvas, file.type);
		if (blob === undefined) return { ...original, width: bitmap.width, height: bitmap.height };
		for (const step of targetBytes ? SHRINK_STEPS : []) {
			if (!blob || blob.size <= /** @type {number} */ (targetBytes)) break;
			const smaller = targetSize(bitmap.width, bitmap.height, step.side);
			const next = await drawConverted(bitmap, smaller, step.quality, makeCanvas, file.type);
			if (!next || !CONVERTED_TYPES.includes(next.type) || next.size === 0) break;
			if (next.size < blob.size) {
				blob = next;
				size = smaller;
			}
		}
		const converted = keepConverted(file, blob, size.scaled);
		// Las copias se miden contra lo que se sube (el WEBP achicado o el original).
		const up = converted ? size : { width: bitmap.width, height: bitmap.height };
		const copies = await makeCopies(bitmap, up, env.makeCanvas ?? defaultCanvas);
		const colors = colorsFromImage(bitmap, env.makeCanvas ?? defaultCanvas);
		if (!converted) {
			return { ...original, width: bitmap.width, height: bitmap.height, copies, colors };
		}
		return {
			blob: /** @type {Blob} */ (blob),
			name: convertedName(file.name, /** @type {Blob} */ (blob).type),
			width: size.width,
			height: size.height,
			converted: true,
			copies,
			colors
		};
	} catch {
		return original;
	} finally {
		bitmap?.close?.();
	}
}

/**
 * Las copias chicas (una por lado de {@link COPY_SIDES}), dibujadas desde la imagen entera. Si
 * alguna no sale como WEBP, ninguna: la tarjeta usa el original.
 * @param {ImageBitmap} bitmap
 * @param {{ width: number, height: number }} up las medidas de lo que se sube
 * @param {(w: number, h: number) => HTMLCanvasElement | OffscreenCanvas} makeCanvas
 * @returns {Promise<ImageCopy[]>}
 */
async function makeCopies(bitmap, up, makeCanvas) {
	try {
		/** @type {ImageCopy[]} */
		const copies = [];
		for (const side of COPY_SIDES) {
			const s = copySize(up.width, up.height, side);
			const canvas = makeCanvas(s.width, s.height);
			const ctx = /** @type {CanvasRenderingContext2D | null} */ (canvas.getContext('2d'));
			if (!ctx) return [];
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(bitmap, 0, 0, s.width, s.height);
			const blob = await toWebp(canvas, COPY_QUALITY);
			if (!blob || blob.type !== 'image/webp' || blob.size === 0) return [];
			copies.push({ side, blob });
		}
		return copies;
	} catch {
		return [];
	}
}

/**
 * Dibuja la imagen con esas medidas y la pasa a WEBP. Safari no hace WEBP desde un canvas
 * (devuelve PNG): una foto JPEG sale JPEG, en lugar del original tal cual. Un PNG, WEBP o AVIF no:
 * puede tener partes transparentes, que en JPEG saldrían negras; da `null` y va el original (al
 * PNG el servidor le saca igual los metadatos). `undefined` si no hay contexto 2D.
 * @param {ImageBitmap} bitmap
 * @param {{ width: number, height: number }} size
 * @param {number} quality
 * @param {(w: number, h: number) => HTMLCanvasElement | OffscreenCanvas} makeCanvas
 * @param {string} fileType
 * @returns {Promise<Blob | null | undefined>}
 */
async function drawConverted(bitmap, size, quality, makeCanvas, fileType) {
	const canvas = makeCanvas(size.width, size.height);
	const ctx = /** @type {CanvasRenderingContext2D | null} */ (canvas.getContext('2d'));
	if (!ctx) return undefined;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, size.width, size.height);
	const blob = await toWebp(canvas, quality);
	// Safari no hace WEBP desde un canvas (devuelve PNG): una foto JPEG sale JPEG, en lugar del
	// original tal cual. Un PNG, WEBP o AVIF no: puede tener partes transparentes, que en JPEG
	// saldrían negras; va el original (el servidor le saca igual los metadatos).
	if (blob && blob.type !== 'image/webp') {
		return fileType === 'image/jpeg'
			? toBlob(canvas, 'image/jpeg', quality === WEBP_QUALITY ? JPEG_QUALITY : quality)
			: null;
	}
	return blob;
}

/** @param {number} w @param {number} h */
function defaultCanvas(w, h) {
	if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

/**
 * @param {HTMLCanvasElement | OffscreenCanvas} canvas
 * @param {number} quality
 * @returns {Promise<Blob | null>}
 */
function toWebp(canvas, quality) {
	return toBlob(canvas, 'image/webp', quality);
}

/**
 * @param {HTMLCanvasElement | OffscreenCanvas} canvas
 * @param {string} type
 * @param {number} quality
 * @returns {Promise<Blob | null>}
 */
function toBlob(canvas, type, quality) {
	if ('convertToBlob' in canvas) {
		return canvas.convertToBlob({ type, quality });
	}
	return new Promise((resolve) =>
		/** @type {HTMLCanvasElement} */ (canvas).toBlob(resolve, type, quality)
	);
}
