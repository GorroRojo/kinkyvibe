import { describe, expect, it } from 'vitest';
import {
	MAX_PICK_BYTES,
	MAX_SIDE,
	appendCopies,
	keepConverted,
	pickProblem,
	prepareImage,
	HEAVY_COVER_BYTES,
	MIN_SHRINK_QUALITY,
	MIN_SHRINK_SIDE,
	SHRINK_STEPS,
	WEBP_QUALITY,
	kbText,
	muchLighter,
	targetSize,
	webpName
} from './imageResize.js';
import { readFileSync } from 'node:fs';

describe('targetSize', () => {
	it('achica hasta 2000 px el lado más largo y nunca agranda', () => {
		expect(targetSize(4000, 3000)).toEqual({ width: 2000, height: 1500, scaled: true });
		expect(targetSize(1000, 5000)).toEqual({ width: 400, height: 2000, scaled: true });
		expect(targetSize(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
		expect(targetSize(2000, 2000)).toEqual({ width: 2000, height: 2000, scaled: false });
	});
});

describe('pickProblem', () => {
	it('acepta imágenes hasta 10 MB y rechaza el resto', () => {
		expect(pickProblem({ type: 'image/jpeg', size: 1000 })).toBe('');
		expect(pickProblem({ type: 'image/gif', size: 1000 })).toBe('');
		expect(pickProblem({ type: 'image/svg+xml', size: 10 })).toMatch(/JPG, PNG/);
		expect(pickProblem({ type: 'image/png', size: MAX_PICK_BYTES + 1 })).toMatch(/10 MB/);
	});
});

describe('webpName y keepConverted', () => {
	it('cambia la extensión', () => {
		expect(webpName('flyer final.JPG')).toBe('flyer final.webp');
		expect(webpName('')).toBe('imagen.webp');
	});
	it('usa el WEBP si hubo que achicar o si pesa menos', () => {
		expect(keepConverted({ size: 100 }, { type: 'image/webp', size: 300 }, true)).toBe(true);
		expect(keepConverted({ size: 100 }, { type: 'image/webp', size: 50 }, false)).toBe(true);
		expect(keepConverted({ size: 100 }, { type: 'image/webp', size: 300 }, false)).toBe(false);
		// El navegador no sabe hacer WEBP (devuelve PNG): se sube el original.
		expect(keepConverted({ size: 100 }, { type: 'image/png', size: 10 }, true)).toBe(false);
		expect(keepConverted({ size: 100 }, null, true)).toBe(false);
	});
});

describe('prepareImage', () => {
	/** Canvas de mentira que «dibuja» y devuelve un WEBP de `size` bytes. */
	const env = (/** @type {number} */ w, /** @type {number} */ h, size = 10) => {
		/** @type {any[]} */
		const drawn = [];
		return {
			drawn,
			createImageBitmap: /** @type {any} */ (async () => ({ width: w, height: h, close() {} })),
			makeCanvas: /** @type {any} */ (
				(/** @type {number} */ cw, /** @type {number} */ ch) => ({
					getContext: () => ({
						drawImage: (/** @type {any[]} */ ...a) => drawn.push([cw, ch, a.slice(1)])
					}),
					convertToBlob: async () => new Blob([new Uint8Array(size)], { type: 'image/webp' })
				})
			)
		};
	};
	it('achica una foto grande y la pasa a WEBP', async () => {
		const file = new File([new Uint8Array(5000)], 'foto.jpg', { type: 'image/jpeg' });
		const e = env(4000, 2000);
		const r = await prepareImage(file, e);
		expect(r).toMatchObject({ name: 'foto.webp', width: 2000, height: 1000, converted: true });
		expect(r.blob.type).toBe('image/webp');
		expect(e.drawn[0][0]).toBe(2000);
	});
	it('hace las dos copias chicas (lado más corto 360 y 720) de lo que se sube', async () => {
		const file = new File([new Uint8Array(5000)], 'flyer.jpg', { type: 'image/jpeg' });
		const e = env(1600, 2000);
		const r = await prepareImage(file, e);
		expect(r).toMatchObject({ width: 1600, height: 2000, converted: true });
		expect(r.copies?.map((c) => c.side)).toEqual([360, 720]);
		expect(r.copies?.every((c) => c.blob.type === 'image/webp')).toBe(true);
		// el dibujo de lo que se sube y el de cada copia, a su medida
		expect(e.drawn.map(([w, h]) => [w, h])).toEqual([
			[1600, 2000],
			[360, 450],
			[720, 900]
		]);
		const form = new FormData();
		appendCopies(form, r);
		expect(form.get('copy360')).toBeInstanceOf(Blob);
		expect(form.get('copy720')).toBeInstanceOf(Blob);
	});
	it('si una copia no sale como WEBP, ninguna (y se sube igual)', async () => {
		const file = new File([new Uint8Array(5000)], 'foto.jpg', { type: 'image/jpeg' });
		let n = 0;
		const r = await prepareImage(file, {
			createImageBitmap: /** @type {any} */ (
				async () => ({ width: 3000, height: 3000, close() {} })
			),
			makeCanvas: /** @type {any} */ (
				() => ({
					getContext: () => ({ drawImage() {} }),
					// la primera (lo que se sube) sale bien; las copias, como PNG
					convertToBlob: async () =>
						new Blob([new Uint8Array(10)], { type: n++ === 0 ? 'image/webp' : 'image/png' })
				})
			)
		});
		expect(r.converted).toBe(true);
		expect(r.copies).toEqual([]);
		const form = new FormData();
		appendCopies(form, r);
		expect(form.has('copy360')).toBe(false);
	});
	it('con targetBytes, prueba los pasos más chicos hasta que alcanza', async () => {
		const file = new File([new Uint8Array(900_000)], 'portada.jpg', { type: 'image/jpeg' });
		/** @type {number[]} */
		const sides = [];
		const r = await prepareImage(
			file,
			{
				createImageBitmap: /** @type {any} */ (
					async () => ({ width: 2000, height: 1500, close() {} })
				),
				makeCanvas: /** @type {any} */ (
					(/** @type {number} */ w) => ({
						getContext: () => ({ drawImage() {} }),
						// pesa según el lado largo: 2000 → 500 KB, 1600 → 400 KB, 1280 → 250 KB
						convertToBlob: async () => {
							sides.push(w);
							return new Blob([new Uint8Array(w * 200)], { type: 'image/webp' });
						}
					})
				)
			},
			{ targetBytes: HEAVY_COVER_BYTES }
		);
		expect(r).toMatchObject({ converted: true, width: 1280, height: 960 });
		expect(r.blob.size).toBeLessThanOrEqual(HEAVY_COVER_BYTES);
		// 2000, 1600 y 1280 (alcanzó: no prueba 1080); después, las dos copias chicas
		expect(sides.slice(0, 3)).toEqual([2000, 1600, 1280]);
		expect(sides).toHaveLength(5);
	});
	it('los pasos nunca bajan del piso (720 px, calidad 0,5) ni llegan al tamaño de siempre', () => {
		expect(MIN_SHRINK_SIDE).toBe(720);
		expect(MIN_SHRINK_QUALITY).toBe(0.5);
		expect(
			SHRINK_STEPS.every(
				(s) =>
					s.side >= MIN_SHRINK_SIDE &&
					s.side < MAX_SIDE &&
					s.quality >= MIN_SHRINK_QUALITY &&
					s.quality < WEBP_QUALITY
			)
		).toBe(true);
		// cada paso es más chico (o igual) que el anterior, de lado y de calidad
		for (let i = 1; i < SHRINK_STEPS.length; i++) {
			expect(SHRINK_STEPS[i].side).toBeLessThanOrEqual(SHRINK_STEPS[i - 1].side);
			expect(SHRINK_STEPS[i].quality).toBeLessThanOrEqual(SHRINK_STEPS[i - 1].quality);
		}
		expect(SHRINK_STEPS.at(-1)).toEqual({ side: MIN_SHRINK_SIDE, quality: MIN_SHRINK_QUALITY });
	});

	describe('con un canvas que pesa según el lado y la calidad', () => {
		/**
		 * Canvas de mentira: el WEBP pesa `perPixel × píxeles × calidad` bytes. Anota cada dibujo
		 * de lo que se sube (lado largo y calidad), sin las copias chicas (calidad COPY_QUALITY).
		 * @param {number} w
		 * @param {number} h
		 * @param {number} perPixel
		 */
		const sized = (w, h, perPixel) => {
			/** @type {[number, number][]} */
			const tries = [];
			return {
				tries,
				createImageBitmap: /** @type {any} */ (async () => ({ width: w, height: h, close() {} })),
				makeCanvas: /** @type {any} */ (
					(/** @type {number} */ cw, /** @type {number} */ ch) => ({
						getContext: () => ({ drawImage() {} }),
						convertToBlob: async (/** @type {{ quality: number }} */ o) => {
							tries.push([Math.max(cw, ch), o.quality]);
							const bytes = Math.round(cw * ch * perPixel * o.quality);
							return new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
						}
					})
				)
			};
		};
		const big = () => new File([new Uint8Array(2_000_000)], 'portada.jpg', { type: 'image/jpeg' });
		/** Los dibujos de lo que se sube (las dos copias chicas son las últimas). @param {[number, number][]} t */
		const main = (t) => t.slice(0, -2);

		it('baja la calidad a 1080 px hasta que alcanza', async () => {
			// 1080×810: a 0,7 pesa ~317 KB; a 0,62, ~280 KB (alcanza)
			const e = sized(2000, 1500, 0.53);
			const r = await prepareImage(big(), e, { targetBytes: HEAVY_COVER_BYTES });
			expect(r.blob.size).toBeLessThanOrEqual(HEAVY_COVER_BYTES);
			expect(r).toMatchObject({ converted: true, width: 1080, height: 810 });
			expect(main(e.tries)).toEqual([
				[2000, WEBP_QUALITY],
				[1600, 0.8],
				[1280, 0.78],
				[1080, 0.75],
				[1080, 0.7],
				[1080, 0.62]
			]);
		});

		it('si no alcanza bajando la calidad, achica el lado (960, 840, 720)', async () => {
			const e = sized(2000, 1500, 0.9);
			const r = await prepareImage(big(), e, { targetBytes: HEAVY_COVER_BYTES });
			expect(r.blob.size).toBeLessThanOrEqual(HEAVY_COVER_BYTES);
			expect(r).toMatchObject({ width: 840, height: 630 });
			expect(main(e.tries).slice(-3)).toEqual([
				[1080, 0.55],
				[960, 0.55],
				[840, 0.55]
			]);
		});

		it('nunca pasa del piso: si ni así alcanza, queda el más liviano (720 px, calidad 0,5)', async () => {
			const e = sized(2000, 1500, 3);
			const r = await prepareImage(big(), e, { targetBytes: HEAVY_COVER_BYTES });
			expect(r.blob.size).toBeGreaterThan(HEAVY_COVER_BYTES);
			expect(r).toMatchObject({ converted: true, width: 720, height: 540 });
			expect(main(e.tries)).toHaveLength(SHRINK_STEPS.length + 1);
			expect(
				main(e.tries).every(([side, q]) => side >= MIN_SHRINK_SIDE && q >= MIN_SHRINK_QUALITY)
			).toBe(true);
		});

		it('una imagen que ya pesa poco sale igual que sin tope (una sola pasada)', async () => {
			const file = new File([new Uint8Array(400_000)], 'foto.jpg', { type: 'image/jpeg' });
			const withTarget = sized(1200, 900, 0.2);
			const without = sized(1200, 900, 0.2);
			const a = await prepareImage(file, withTarget, { targetBytes: HEAVY_COVER_BYTES });
			const b = await prepareImage(file, without);
			expect(main(withTarget.tries)).toEqual([[1200, WEBP_QUALITY]]);
			expect(withTarget.tries).toEqual(without.tries);
			expect({ ...a, blob: a.blob.size, copies: a.copies?.length }).toEqual({
				...b,
				blob: b.blob.size,
				copies: b.copies?.length
			});
		});
	});
	it('un GIF (puede ser animado) va tal cual', async () => {
		const file = new File([new Uint8Array(50)], 'anim.gif', { type: 'image/gif' });
		const r = await prepareImage(file, env(10, 10));
		expect(r.blob).toBe(file);
		expect(r.converted).toBe(false);
		expect(r.copies).toBeUndefined();
	});
	it('si el navegador no puede, sube el original', async () => {
		const file = new File([new Uint8Array(50)], 'x.png', { type: 'image/png' });
		const r = await prepareImage(file, {
			createImageBitmap: /** @type {any} */ (
				async () => {
					throw new Error('no');
				}
			)
		});
		expect(r.blob).toBe(file);
	});
});

describe('muchLighter', () => {
	it('vale la pena si baja de 300 KB o pesa al menos un 15 % menos', () => {
		const kb = 1024;
		expect(muchLighter(381 * kb, 300 * kb)).toBe(true);
		expect(muchLighter(900 * kb, 760 * kb)).toBe(true); // 15,6 % menos
		// el caso de producción: 381 KB → 380,6 KB no sirve
		expect(muchLighter(381 * kb, 380.6 * kb)).toBe(false);
		expect(muchLighter(900 * kb, 800 * kb)).toBe(false); // 11 % menos y arriba de 300 KB
		expect(muchLighter(200 * kb, 250 * kb)).toBe(false); // pesa más
		expect(muchLighter(200 * kb, 200 * kb)).toBe(false);
		expect(muchLighter(200 * kb, 0)).toBe(false);
	});
});

describe('kbText', () => {
	it('redondea a KB, con decimales solo si «antes» y «ahora» se verían iguales', () => {
		expect(kbText(390_144)).toBe('381 KB');
		expect(kbText(300 * 1024)).toBe('300 KB');
		expect(kbText(389_734, 390_144)).toBe('380,6 KB');
		expect(kbText(390_144, 389_734)).toBe('381,0 KB');
		expect(kbText(390_144, 200_000)).toBe('381 KB');
		expect(kbText(390_144, 390_144)).toBe('381 KB');
		// muy parecidos: hasta dos decimales
		expect(kbText(390_144, 390_100)).toBe('381,00 KB');
		expect(kbText(390_100, 390_144)).toBe('380,96 KB');
	});
});

describe('las subidas', () => {
	it('usan el mismo tope de peso que «Achicar» (300 KB), así una portada nueva ya llega liviana', () => {
		for (const file of [
			'src/lib/components/admin/ImagePicker.svelte',
			'src/routes/(authed)/admin/contenido/biblioteca/+page.svelte'
		]) {
			const source = readFileSync(file, 'utf8');
			expect(source, file).toContain(
				'prepareImage(picked, {}, { targetBytes: HEAVY_COVER_BYTES })'
			);
			expect(source, file).not.toMatch(/prepareImage\(picked\)/);
		}
	});
});
