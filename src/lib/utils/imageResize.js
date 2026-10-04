/**
 * Achicar una imagen en el navegador antes de subirla a la biblioteca (docs/imagenes.md): el lado
 * más largo queda en {@link MAX_SIDE} px como mucho y se pasa a WEBP. Así se sube poco y el sitio
 * carga rápido. Si el navegador no puede (un tipo que no sabe dibujar, o no sabe hacer WEBP), o si
 * el resultado pesa más que el original sin haber hecho falta achicarlo, se sube el original.
 *
 * Las cuentas (medidas, qué hacer) son funciones puras y se prueban en vitest; lo que usa el
 * canvas recibe las funciones del navegador como parámetro.
 */

/** Lado más largo, en píxeles. */
export const MAX_SIDE = 2000;

/** Calidad del WEBP (0 a 1). */
export const WEBP_QUALITY = 0.85;

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
	const base = String(name || 'imagen').replace(/\.[^./]+$/, '');
	return `${base || 'imagen'}.webp`;
}

/**
 * Entre el original y el WEBP, cuál se sube: el WEBP si el navegador lo hizo de verdad y (si no
 * hubo que achicar) pesa menos que el original.
 * @param {{ size: number }} original
 * @param {{ type: string, size: number } | null} converted
 * @param {boolean} scaled
 */
export function keepConverted(original, converted, scaled) {
	if (!converted || converted.type !== 'image/webp' || converted.size === 0) return false;
	return scaled || converted.size < original.size;
}

/**
 * @typedef {{ blob: Blob, name: string, width: number | null, height: number | null,
 *   converted: boolean }} PreparedImage
 */

/**
 * Achica y pasa a WEBP (en el navegador). Si algo falla, devuelve el original tal cual.
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
		const blob = await toWebp(canvas);
		if (!keepConverted(file, blob, size.scaled)) {
			return { ...original, width: bitmap.width, height: bitmap.height };
		}
		return {
			blob: /** @type {Blob} */ (blob),
			name: webpName(file.name),
			width: size.width,
			height: size.height,
			converted: true
		};
	} catch {
		return original;
	} finally {
		bitmap?.close?.();
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
 * @returns {Promise<Blob | null>}
 */
function toWebp(canvas) {
	if ('convertToBlob' in canvas) {
		return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
	}
	return new Promise((resolve) =>
		/** @type {HTMLCanvasElement} */ (canvas).toBlob(resolve, 'image/webp', WEBP_QUALITY)
	);
}
