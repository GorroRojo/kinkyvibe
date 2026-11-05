import { describe, expect, it } from 'vitest';
import {
	MAX_PICK_BYTES,
	MAX_SIDE,
	appendCopies,
	keepConverted,
	pickProblem,
	prepareImage,
	HEAVY_COVER_BYTES,
	SHRINK_STEPS,
	targetSize,
	webpName
} from './imageResize.js';

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
	it('los pasos nunca bajan de 1080 px ni llegan al tamaño de siempre', () => {
		expect(SHRINK_STEPS.every((s) => s.side >= 1080 && s.side < MAX_SIDE)).toBe(true);
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
