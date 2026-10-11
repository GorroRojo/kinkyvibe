/**
 * El dibujante de verdad (worker/og-render.js, con el WebAssembly de satori y resvg leído del
 * disco, como en el script de las tarjetas de respaldo): una tarjeta del collage sale como JPEG de
 * 1200 × 630 y liviana. Las portadas son JPEG inventados (un cuadrado de color).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import decodeJpeg from 'jpeg-js/lib/decoder.js';
import encodeJpeg from 'jpeg-js/lib/encoder.js';
import { createOgRenderer } from '../../../worker/og-render.js';
import { COLLAGE_FONTS, COLLAGE_LOGO, collageTiles, collageTree } from '$lib/utils/ogCollage.js';
import { OG_CARD_SIZE, ogCardText } from '$lib/utils/ogCards.js';

vi.setConfig({ testTimeout: 60_000 });

/** @param {string} specifier */
const fromPackage = (specifier) => readFileSync(fileURLToPath(import.meta.resolve(specifier)));
/** @param {string} path */
const fromStatic = (path) =>
	readFileSync(fileURLToPath(new URL(`../../../static${path}`, import.meta.url)));

/** Un JPEG de 250 × 250 de un color. @param {[number, number, number]} rgb */
function square([r, g, b]) {
	const data = new Uint8Array(250 * 250 * 4);
	for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
	const out = encodeJpeg({ data, width: 250, height: 250 }, 80);
	return `data:image/jpeg;base64,${Buffer.from(out.data).toString('base64')}`;
}

describe('createOgRenderer', () => {
	it('dibuja el collage: JPEG de 1200 × 630, de menos de 300 KB', async () => {
		const render = createOgRenderer(
			fromPackage('satori/yoga.wasm'),
			fromPackage('@resvg/resvg-wasm/index_bg.wasm')
		);
		const fonts = COLLAGE_FONTS.map((f) => ({
			name: f.name,
			weight: f.weight,
			data: fromStatic(f.file)
		}));
		const logo = `data:image/png;base64,${fromStatic(COLLAGE_LOGO).toString('base64')}`;
		const tiles = collageTiles([
			square([255, 80, 200]),
			square([40, 200, 160]),
			square([250, 220, 60])
		]);
		const bytes = await render(collageTree({ ...ogCardText('calendario'), tiles, logo }), {
			...OG_CARD_SIZE,
			fonts
		});
		expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
		expect(bytes.length).toBeLessThan(300 * 1024);
		const img = decodeJpeg(bytes, { useTArray: true });
		expect({ width: img.width, height: img.height }).toEqual({ width: 1200, height: 630 });
		// a la izquierda, el fondo violeta oscuro; a la derecha, las portadas (colores claros)
		const px = (/** @type {number} */ x, /** @type {number} */ y) => {
			const i = (y * img.width + x) * 4;
			return [img.data[i], img.data[i + 1], img.data[i + 2]];
		};
		const [r, g, b] = px(20, 600);
		expect(b).toBeGreaterThan(r);
		expect(r + g + b).toBeLessThan(150);
		const right = px(1000, 320);
		expect(Math.max(...right)).toBeGreaterThan(150);
	});
});
