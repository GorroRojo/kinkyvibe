/**
 * Biblioteca de imágenes (docs/imagenes.md) contra el D1 y el R2 de miniflare (el bucket `MEDIA`
 * de wrangler.toml, en memoria). Imágenes inventadas de un color.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import {
	ImageError,
	MAX_UPLOAD_BYTES,
	contextImages,
	deleteImage,
	findImage,
	imageKeysByObject,
	imageOf,
	imagesUsedBy,
	linkImage,
	memberMayUse,
	searchImages,
	seriesImageKeys,
	servableImage,
	storeImage
} from './library.js';
import { solidPng } from './testing.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});

const ADMIN = /** @type {const} */ ({ role: 'admin', id: 'admin-prueba' });
const bucket = () => /** @type {import('@cloudflare/workers-types').R2Bucket} */ (t.env.MEDIA);

/** @param {number} n @param {[number, number, number]} [rgb] */
const png = (n, rgb) => solidPng(n, n, rgb);

describe('storeImage', () => {
	it('guarda el archivo en R2 con clave por contenido y el objeto con sus medidas', async () => {
		const bytes = png(12);
		const { image, created } = await storeImage(
			t.db,
			bucket(),
			{ bytes, name: 'flyer-violeta.png', alt: 'Cuadrado violeta de prueba' },
			{ actor: 'admin-prueba' }
		);
		expect(created).toBe(true);
		expect(image.key).toMatch(/^img\/[0-9a-f]{64}\.png$/);
		expect(image.url).toBe(`/media/${image.key}`);
		expect(image).toMatchObject({
			title: 'flyer-violeta',
			alt: 'Cuadrado violeta de prueba',
			width: 12,
			height: 12,
			mime: 'image/png',
			size: bytes.length
		});
		const stored = await bucket().get(image.key);
		expect(stored?.httpMetadata?.contentType).toBe('image/png');
		expect(stored?.httpMetadata?.cacheControl).toContain('immutable');
		expect(new Uint8Array(await /** @type {any} */ (stored).arrayBuffer())).toEqual(bytes);
	});

	it('el mismo archivo es la misma imagen; si estaba borrada, vuelve', async () => {
		const bytes = png(8);
		const a = await storeImage(t.db, bucket(), { bytes, name: 'a.png' }, { actor: 'x' });
		const b = await storeImage(
			t.db,
			bucket(),
			{ bytes, name: 'b.png', alt: 'Ahora con texto' },
			{ actor: 'x' }
		);
		expect(b.created).toBe(false);
		expect(b.image.id).toBe(a.image.id);
		expect(b.image.alt).toBe('Ahora con texto');
		expect(await deleteImage(t.db, a.image.id, { actor: 'x' })).toBe(true);
		expect(await servableImage(t.db, a.image.key)).toBeNull();
		const c = await storeImage(t.db, bucket(), { bytes, name: 'c.png' }, { actor: 'x' });
		expect(c.image.id).toBe(a.image.id);
		expect(await servableImage(t.db, a.image.key)).not.toBeNull();
	});

	it('rechaza lo que no es imagen, lo vacío, lo muy pesado y la falta de bucket', async () => {
		const bad = (/** @type {Uint8Array} */ bytes, b = bucket()) =>
			storeImage(t.db, b, { bytes, name: 'x' }, { actor: 'x' }).catch((e) => e);
		const notImage = await bad(new TextEncoder().encode('<svg onload=alert(1)></svg>'));
		expect(notImage).toBeInstanceOf(ImageError);
		expect(notImage.status).toBe(415);
		expect((await bad(new Uint8Array())).status).toBe(400);
		const huge = new Uint8Array(MAX_UPLOAD_BYTES + 1);
		huge.set(png(2));
		expect((await bad(huge)).status).toBe(413);
		expect((await bad(png(3), /** @type {any} */ (null))).status).toBe(503);
		expect(
			(await t.db.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'imagen'").first())?.n
		).toBe(0);
	});
});

describe('buscar y usos', () => {
	/** Un evento inventado. @param {string} slug @param {string[]} [tags] */
	async function evento(slug, tags = []) {
		return saveObject(
			t.db,
			{
				type: 'evento',
				slug,
				title: `Evento ${slug}`,
				data: { start: '2026-11-20T20:00-03:00', tags }
			},
			{ actor: 'admin-prueba' }
		);
	}

	it('busca por nombre o texto alternativo; una cuenta ve solo lo que subió', async () => {
		const a = await storeImage(
			t.db,
			bucket(),
			{ bytes: png(5), name: 'fiesta-primavera.png', alt: 'Flyer con flores' },
			{ actor: 'admin-prueba' }
		);
		await storeImage(
			t.db,
			bucket(),
			{ bytes: png(6), name: 'taller.png', alt: 'Cuerdas' },
			{ actor: 'cuenta:otra' }
		);
		expect((await searchImages(t.db, { q: 'primav', viewer: ADMIN })).map((i) => i.id)).toEqual([
			a.image.id
		]);
		expect((await searchImages(t.db, { q: 'flores', viewer: ADMIN })).map((i) => i.id)).toEqual([
			a.image.id
		]);
		expect(await searchImages(t.db, { q: 'nada-que-ver', viewer: ADMIN })).toEqual([]);
		expect(await searchImages(t.db, { viewer: ADMIN })).toHaveLength(2);
		const mine = await searchImages(t.db, {
			viewer: { role: 'member', id: 'cuenta:otra' },
			createdBy: 'cuenta:otra'
		});
		expect(mine.map((i) => i.title)).toEqual(['taller']);
		// Ningún operador de búsqueda que venga del pedido rompe la consulta.
		expect(await searchImages(t.db, { q: '" OR * (', viewer: ADMIN })).toEqual([]);
	});

	it('los edges: portada de un evento, imagen de su serie y «De este evento»', async () => {
		const serie = await saveObject(
			t.db,
			{
				type: 'etiqueta',
				slug: 'serie-prueba',
				title: 'Serie Prueba',
				data: { key: 'Serie Prueba' }
			},
			{ actor: 'admin-prueba' }
		);
		const ev1 = await evento('edicion-1', ['Serie Prueba']);
		const ev2 = await evento('edicion-2', ['Serie Prueba']);
		const otro = await evento('otro-evento');
		const i1 = (
			await storeImage(t.db, bucket(), { bytes: png(7), name: 'uno.png' }, { actor: 'a' })
		).image;
		const i2 = (
			await storeImage(t.db, bucket(), { bytes: png(9), name: 'dos.png' }, { actor: 'a' })
		).image;
		const i3 = (
			await storeImage(t.db, bucket(), { bytes: png(4), name: 'tres.png' }, { actor: 'a' })
		).image;
		await linkImage(t.db, ev1.id, 'portada', i1.id, { actor: 'a' });
		await linkImage(t.db, serie.id, 'imagen', i2.id, { actor: 'a' });
		await linkImage(t.db, otro.id, 'portada', i3.id, { actor: 'a' });

		expect((await imageOf(t.db, ev1.id, 'portada', ADMIN))?.id).toBe(i1.id);
		expect(await imageKeysByObject(t.db, 'evento', 'portada')).toEqual(
			new Map([
				[ev1.id, i1.key],
				[otro.id, i3.key]
			])
		);
		expect(await seriesImageKeys(t.db)).toEqual(new Map([['Serie Prueba', i2.key]]));
		const ctx = await contextImages(t.db, ev2.id, ADMIN, { seriesKeys: ['Serie Prueba'] });
		expect(ctx.map((i) => i.id).sort()).toEqual([i1.id, i2.id].sort());
		expect(await contextImages(t.db, ev2.id, ADMIN, { seriesKeys: [] })).toEqual([]);
		expect((await imagesUsedBy(t.db, [otro.id], ADMIN)).map((i) => i.id)).toEqual([i3.id]);

		// Sacarla: el edge se va; volver a pedir lo mismo no guarda otra versión.
		const before = ev1.version + 1;
		await linkImage(t.db, ev1.id, 'portada', null, { actor: 'a' });
		expect(await imageOf(t.db, ev1.id, 'portada', ADMIN)).toBeNull();
		const after = await t.db
			.prepare('SELECT version FROM objects WHERE id = ?1')
			.bind(ev1.id)
			.first();
		expect(after?.version).toBe(before + 1);
		await linkImage(t.db, ev1.id, 'portada', null, { actor: 'a' });
		const again = await t.db
			.prepare('SELECT version FROM objects WHERE id = ?1')
			.bind(ev1.id)
			.first();
		expect(again?.version).toBe(before + 1);

		// Una imagen borrada no se ve en ningún lado (los edges quedan, para deshacer).
		await deleteImage(t.db, i3.id, { actor: 'a' });
		expect(await imageKeysByObject(t.db, 'evento', 'portada')).toEqual(new Map());
		expect(await imageOf(t.db, otro.id, 'portada', ADMIN)).toBeNull();
		expect(await findImage(t.db, i3.id, ADMIN)).toBeNull();
		expect(await deleteImage(t.db, i3.id, { actor: 'a' })).toBe(false);
	});

	it('una cuenta solo usa imágenes que subió o que su objeto ya tiene', async () => {
		const mine = (
			await storeImage(t.db, bucket(), { bytes: png(10), name: 'm.png' }, { actor: 'cuenta:yo' })
		).image;
		const other = (
			await storeImage(t.db, bucket(), { bytes: png(11), name: 'o.png' }, { actor: 'admin-prueba' })
		).image;
		const ev = await evento('cualquiera');
		expect(await memberMayUse(t.db, mine.id, { actor: 'cuenta:yo', objectId: ev.id })).toBe(true);
		expect(await memberMayUse(t.db, other.id, { actor: 'cuenta:yo', objectId: ev.id })).toBe(false);
		await linkImage(t.db, ev.id, 'portada', other.id, { actor: 'admin-prueba' });
		expect(await memberMayUse(t.db, other.id, { actor: 'cuenta:yo', objectId: ev.id })).toBe(true);
	});

	it('servableImage: solo claves válidas de imágenes vivas', async () => {
		const { image } = await storeImage(
			t.db,
			bucket(),
			{ bytes: png(3), name: 'x.png' },
			{ actor: 'a' }
		);
		expect((await servableImage(t.db, image.key))?.id).toBe(image.id);
		expect(await servableImage(t.db, image.key.replace('.png', '.webp'))).toBeNull();
		expect(await servableImage(t.db, '../secreto')).toBeNull();
	});
});
