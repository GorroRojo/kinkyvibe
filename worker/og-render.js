/**
 * Dibuja una tarjeta de vista previa (docs/compartir.md): el árbol de src/lib/utils/ogCollage.js →
 * SVG (satori, que ubica las cajas con yoga) → píxeles (resvg) → JPEG (jpeg-js). Las dos partes
 * que son WebAssembly se reciben ya cargadas: en el Worker, como módulos que sube wrangler
 * (worker/og.js; Workers no deja compilar WebAssembly desde bytes); en Node (pruebas, el script de
 * las tarjetas de respaldo), leídas del disco.
 *
 * JPEG y no PNG: un collage de fotos en PNG pesa cerca de 1 MB y WhatsApp no muestra imágenes de
 * más de unos 300 KB; en JPEG (calidad 82) queda entre 100 y 200 KB.
 *
 * Solo imports de paquetes y relativos: Vite no lo procesa (lo importa worker/og.js, que empaqueta
 * wrangler).
 */
import satori, { init as initYoga } from 'satori/standalone';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import encodeJpeg from 'jpeg-js/lib/encoder.js';

/** Calidad del JPEG. */
export const JPEG_QUALITY = 82;

/**
 * @typedef {{ name: string, data: ArrayBuffer | Uint8Array, weight?: number, style?: 'normal' | 'italic' }} OgFont
 * @typedef {(text: string, style: Record<string, any>) => Promise<number>} OgMeasure cuántas líneas
 *   ocupa un texto con ese estilo (que lleva `width`), con las mismas fuentes del dibujo
 * @typedef {unknown | ((measure: OgMeasure) => Promise<unknown>)} OgTree el árbol, o una función que
 *   lo arma midiendo textos (las tarjetas de objetos: src/lib/utils/ogObjeto.js)
 * @typedef {(tree: OgTree, opts: { width: number, height: number, fonts: OgFont[] }) => Promise<Uint8Array>} OgRenderer
 */

/**
 * Cuántas líneas ocupa un texto, medido con satori mismo: con `embedFont: false`, cada pedazo de
 * línea sale como un `<text>` con su `y`, así que las `y` distintas son las líneas. El corte es
 * exactamente el del dibujo (mismas fuentes, mismo `textWrap`). Unos pocos milisegundos.
 * @param {string} text
 * @param {Record<string, any>} style
 * @param {OgFont[]} fonts
 */
export async function measureLines(text, style, fonts) {
	const width = Math.max(1, Math.round(Number(style.width) || 1));
	const svg = await satori(
		/** @type {any} */ ({
			type: 'div',
			props: {
				style: { display: 'flex', width },
				children: { type: 'div', props: { style: { display: 'block', ...style }, children: text } }
			}
		}),
		{ width, height: 4000, fonts: /** @type {any} */ (fonts), embedFont: false }
	);
	const ys = new Set(
		[...svg.matchAll(/<text\b[^>]*?\sy="([-\d.]+)"/g)].map((m) => Math.round(Number(m[1])))
	);
	return ys.size;
}

/**
 * Un dibujante que carga el WebAssembly la primera vez que se usa (no al arrancar el Worker).
 * @param {unknown} yogaWasm el de satori (`satori/yoga.wasm`)
 * @param {unknown} resvgWasm el de resvg (`@resvg/resvg-wasm/index_bg.wasm`)
 * @returns {OgRenderer}
 */
export function createOgRenderer(yogaWasm, resvgWasm) {
	/** @type {Promise<unknown> | null} */
	let ready = null;
	return async (tree, { width, height, fonts }) => {
		ready ??= Promise.all([
			initYoga(/** @type {any} */ (yogaWasm)),
			initWasm(/** @type {any} */ (resvgWasm))
		]).catch((error) => {
			ready = null;
			throw error;
		});
		await ready;
		const built =
			typeof tree === 'function'
				? await tree((/** @type {string} */ text, /** @type {Record<string, any>} */ style) =>
						measureLines(text, style, fonts)
					)
				: tree;
		const svg = await satori(/** @type {any} */ (built), {
			width,
			height,
			fonts: /** @type {any} */ (fonts)
		});
		const resvg = new Resvg(svg, { fitTo: { mode: 'original' } });
		const image = resvg.render();
		try {
			const out = encodeJpeg(
				{ data: image.pixels, width: image.width, height: image.height },
				JPEG_QUALITY
			);
			return new Uint8Array(/** @type {ArrayLike<number>} */ (/** @type {unknown} */ (out.data)));
		} finally {
			image.free();
			resvg.free();
		}
	};
}
