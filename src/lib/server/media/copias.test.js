/**
 * La pasada única de las copias chicas (src/lib/server/media/copias.js, scripts/copias-chicas.js)
 * contra el R2 de miniflare: solo suma lo que falta, nunca pisa ni borra, e idempotente. También
 * la copia de verdad con sharp (imágenes inventadas de un color).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { backfillCopies, imageKeys } from './copias.js';
import { fakeWebp, solidPng } from './testing.js';
import { sniffImage } from './sniff.js';
import { resizeWithSharp } from '../../../../scripts/copias-chicas.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const bucket = () => /** @type {import('@cloudflare/workers-types').R2Bucket} */ (t.env.MEDIA);
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const G = 'c'.repeat(64);

/** @param {string} key */
const bytesOf = async (key) =>
	new Uint8Array(await /** @type {any} */ (await bucket().get(key)).arrayBuffer());

/** Lo que había antes de la pasada (todo inventado). */
const BEFORE = {
	[`img/${A}.png`]: solidPng(40, 20),
	[`img/${A}-360.webp`]: fakeWebp(40, 20, 77), // una copia que ya estaba: no se toca
	[`img/${B}.webp`]: fakeWebp(1000, 1000, 1),
	[`img/${G}.gif`]: new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0]),
	[`file/${A}.pdf`]: new TextEncoder().encode('%PDF-1.4 inventado')
};

beforeEach(async () => {
	const b = bucket();
	for (const o of (await b.list()).objects) await b.delete(o.key);
	for (const [key, bytes] of Object.entries(BEFORE)) await b.put(key, bytes);
});

/** Una copia de mentira: marca el lado (para ver qué se escribió). */
const fakeResize = vi.fn(async (/** @type {Uint8Array} */ _b, /** @type {number} */ side) =>
	fakeWebp(side, side, side % 251)
);

describe('backfillCopies', () => {
	it('sin escribir (vista previa): dice qué escribiría y no toca nada', async () => {
		const r = await backfillCopies(bucket(), { dryRun: true });
		expect(r.planned.map((p) => p.key)).toEqual([
			`img/${A}-720.webp`,
			`img/${B}-360.webp`,
			`img/${B}-720.webp`
		]);
		expect(r.originals).toBe(2);
		expect(r.written).toEqual([]);
		expect((await imageKeys(bucket())).sort()).toEqual(
			Object.keys(BEFORE)
				.filter((k) => k.startsWith('img/'))
				.sort()
		);
	});

	it('escribe solo lo que falta, sin pisar ni borrar nada; la segunda vez, nada', async () => {
		fakeResize.mockClear();
		const r = await backfillCopies(bucket(), {
			dryRun: false,
			resize: /** @type {any} */ (fakeResize)
		});
		expect(r.errors).toEqual([]);
		expect(r.written.map((w) => w.key)).toEqual([
			`img/${A}-720.webp`,
			`img/${B}-360.webp`,
			`img/${B}-720.webp`
		]);
		// Todo lo de antes sigue, byte a byte (originales, la copia que ya estaba, el PDF).
		for (const [key, bytes] of Object.entries(BEFORE)) expect(await bytesOf(key)).toEqual(bytes);
		const written = await bucket().get(`img/${B}-720.webp`);
		expect(written?.httpMetadata?.contentType).toBe('image/webp');
		expect(written?.httpMetadata?.cacheControl).toContain('immutable');
		// Un GIF no tiene copias.
		expect(await bucket().head(`img/${G}-360.webp`)).toBeNull();

		const again = await backfillCopies(bucket(), {
			dryRun: false,
			resize: /** @type {any} */ (fakeResize)
		});
		expect(again.planned).toEqual([]);
		expect(again.written).toEqual([]);
		expect(fakeResize).toHaveBeenCalledTimes(3);
	});

	it('si la copia aparece mientras corre (otra subida), no la pisa', async () => {
		const resize = vi.fn(async (/** @type {Uint8Array} */ _b, /** @type {number} */ side) => {
			// Mientras se achica la primera, «otra subida» deja la de 360 de B.
			if (side === 720) await bucket().put(`img/${B}-360.webp`, fakeWebp(9, 9, 9));
			return fakeWebp(side, side);
		});
		const r = await backfillCopies(bucket(), {
			dryRun: false,
			resize: /** @type {any} */ (resize)
		});
		expect(r.written.map((w) => w.key)).not.toContain(`img/${B}-360.webp`);
		expect(await bytesOf(`img/${B}-360.webp`)).toEqual(fakeWebp(9, 9, 9));
	});
});

describe('resizeWithSharp', () => {
	it('WEBP con el lado más corto pedido y la misma proporción; nunca agranda', async () => {
		const big = sniffImage(await resizeWithSharp(solidPng(800, 400), 360));
		expect(big).toMatchObject({ mime: 'image/webp', width: 720, height: 360 });
		const small = sniffImage(await resizeWithSharp(solidPng(40, 20), 360));
		expect(small).toMatchObject({ mime: 'image/webp', width: 40, height: 20 });
	});
});
