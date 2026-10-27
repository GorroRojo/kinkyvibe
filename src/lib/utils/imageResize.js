/**
 * Achicar una imagen en el navegador antes de subirla a la biblioteca (docs/imagenes.md): el lado
 * más largo queda en {@link MAX_SIDE} px como mucho y se pasa a WEBP. Así se sube poco y el sitio
 * carga rápido. Si el navegador no sabe hacer WEBP (Safari), se pasa a JPEG: dibujada de nuevo, la
 * foto ya no lleva sus datos ocultos (GPS, fecha). Si no puede dibujarla, o si el resultado pesa
 * más que el original sin haber hecho falta achicarlo, se sube el original (el servidor le saca
 * igual los metadatos a un JPEG o un PNG: media/metadata.js).
 *
 * Del mismo dibujo salen también las dos copias chicas para las tarjetas (WEBP, lado más corto de
 * 360 y 720 px; $lib/utils/mediaCopies.js), que viajan con la subida. Si no salen, se sube igual
 * (la tarjeta usa el original hasta la pasada de scripts/copias-chicas.js).
 *
 * Las cuentas (medidas, qué hacer) son funciones puras y se prueban en vitest; lo que usa el
 * canvas recibe las funciones del navegador como parámetro.
 */
import { COPY_QUALITY, COPY_SIDES, copySize } from './mediaCopies.js';

/** Lado más largo, en píxeles. */
export const MAX_SIDE = 2000;

/** Calidad del WEBP (0 a 1). */
export const WEBP_QUALITY = 0.85;

/** Calidad del JPEG, cuando el navegador no sabe hacer WEBP (0 a 1). */
export const JPEG_QUALITY = 0.85;

/** Lo que puede salir del canvas y se sube en lugar del original. */
const CONVERTED_TYPES = ['image/webp', 'image/jpeg'];

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
 *   converted: boolean, copies?: ImageCopy[] }} PreparedImage
 */

/**
 * Suma las copias chicas a lo que se sube (`copy360`, `copy720`), si las hay.
 * @param {FormData} form
 * @param {PreparedImage} prepared
 */
export function appendCopies(form, prepared) {
	for (const c of prepared.copies ?? []) form.set(`copy${c.side}`, c.blob, `copia-${c.side}.webp`);
}

/**
 * Achica y pasa a WEBP (en el navegador), y hace las copias chicas. Si algo falla, devuelve el
 * original tal cual (sin copias).
 *
 * @param {File} file
 * @param {{ createImageBitmap?: typeof globalThis.createImageBitmap,
 *   makeCanvas?: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas }} [env]
 * @returns {Promise<PreparedImage>}
 */
export async function prepareImage(file, env = {}) {
	const original = { blob: file, name: file.name, width: null, height: null, converted: false };
	const decode = env.createImageBitmap ?? globalThis.createImageBitmap;
	if (!RESIZABLE_TYPES.includes(file.type) || typeof decode !== 'function') return original;
	/** @type {ImageBitmap | undefined} */
	let bitmap;
	try {
		bitmap = await decode(file, { imageOrientation: 'from-image' });
		const size = targetSize(bitmap.width, bitmap.height);
		const canvas = (env.makeCanvas ?? defaultCanvas)(size.width, size.height);
		const ctx = /** @type {CanvasRenderingContext2D | null} */ (canvas.getContext('2d'));
		if (!ctx) return { ...original, width: bitmap.width, height: bitmap.height };
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, 0, 0, size.width, size.height);
		let blob = await toWebp(canvas, WEBP_QUALITY);
		// Safari no hace WEBP desde un canvas (devuelve PNG): JPEG, en lugar del original tal cual.
		if (blob && blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', JPEG_QUALITY);
		const converted = keepConverted(file, blob, size.scaled);
		// Las copias se miden contra lo que se sube (el WEBP achicado o el original).
		const up = converted ? size : { width: bitmap.width, height: bitmap.height };
		const copies = await makeCopies(bitmap, up, env.makeCanvas ?? defaultCanvas);
		if (!converted) {
			return { ...original, width: bitmap.width, height: bitmap.height, copies };
		}
		return {
			blob: /** @type {Blob} */ (blob),
			name: convertedName(file.name, /** @type {Blob} */ (blob).type),
			width: size.width,
			height: size.height,
			converted: true,
			copies
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
