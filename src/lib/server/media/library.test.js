/**
 * Biblioteca de imágenes (docs/imagenes.md) contra el D1 y el R2 de miniflare (el bucket `MEDIA`
 * de wrangler.toml, en memoria). Imágenes inventadas de un color.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import {
	ImageError,
	MAX_FILE_BYTES,
	MAX_UPLOAD_BYTES,
	contextImages,
	deleteImage,
	findImage,
	imageKeysByObject,
	imageOf,
	imageUses,
	imagesUsedBy,
	linkImage,
	memberMayUse,
	searchImages,
	seriesImageKeys,
	imageUsage,
	servableCopy,
	servableImage,
	servableMedia,
	storeFile,
	storeImage
} from './library.js';
import { fakePdf, fakeWebp, fakeZip, solidPng } from './testing.js';

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

describe('storeImage: copias chicas para las tarjetas', () => {
	/** @param {string} key */
	const has = async (key) => (await bucket().head(key)) !== null;
	/** @param {string} key */
	const bytesOf = async (key) =>
		new Uint8Array(await /** @type {any} */ (await bucket().get(key)).arrayBuffer());
	const copiesFor = (/** @type {number} */ seed = 1) => [
		{ side: 360, bytes: fakeWebp(360, 450, seed) },
		{ side: 720, bytes: fakeWebp(720, 900, seed) }
	];

	it('guarda las copias al lado del original, con la clave del original', async () => {
		const bytes = fakeWebp(1600, 2000, 9);
		const { image, copies } = await storeImage(
			t.db,
			bucket(),
			{ bytes, name: 'flyer.webp', alt: 'Flyer inventado', copies: copiesFor() },
			{ actor: 'admin-prueba' }
		);
		expect(copies).toEqual([360, 720]);
		const base = image.key.replace(/\.webp$/, '');
		expect(await bytesOf(`${base}-360.webp`)).toEqual(fakeWebp(360, 450, 1));
		const stored = await bucket().get(`${base}-720.webp`);
		expect(stored?.httpMetadata?.contentType).toBe('image/webp');
		expect(stored?.httpMetadata?.cacheControl).toContain('immutable');
		expect(await servableCopy(t.db, `${base}-720.webp`)).toEqual({ original: image.key });
	});

	it('ignora las copias que no corresponden, sin frenar la subida', async () => {
		const bytes = fakeWebp(1600, 2000, 8);
		const { image, created, copies } = await storeImage(
			t.db,
			bucket(),
			{
				bytes,
				name: 'flyer.webp',
				alt: 'Flyer inventado',
				copies: [
					{ side: 360, bytes: fakeWebp(360, 360) }, // otra proporción
					{ side: 720, bytes: solidPng(720, 900) }, // no es WEBP
					{ side: 500, bytes: fakeWebp(500, 625) } // un lado que no existe
				]
			},
			{ actor: 'admin-prueba' }
		);
		expect(created).toBe(true);
		expect(copies).toEqual([]);
		const base = image.key.replace(/\.webp$/, '');
		expect(await has(`${base}-360.webp`)).toBe(false);
		expect(await has(`${base}-720.webp`)).toBe(false);
	});

	it('si el original ya estaba, no suma ni pisa copias (las hace la pasada)', async () => {
		const bytes = fakeWebp(1600, 2000, 7);
		const first = await storeImage(
			t.db,
			bucket(),
			{ bytes, name: 'a.webp', alt: 'Inventada' },
			{ actor: 'admin-prueba' }
		);
		const again = await storeImage(
			t.db,
			bucket(),
			{ bytes, name: 'b.webp', alt: 'Inventada', copies: copiesFor(2) },
			{ actor: 'cuenta:otra' }
		);
		expect(again.copies).toEqual([]);
		expect(await has(first.image.key.replace(/\.webp$/, '-360.webp'))).toBe(false);
	});

	it('nunca pisa una copia que ya está en R2', async () => {
		const bytes = fakeWebp(1600, 2000, 6);
		const hash = hexOf(await crypto.subtle.digest('SHA-256', bytes));
		const copy = `img/${hash}-360.webp`;
		const before = fakeWebp(360, 450, 42);
		await bucket().put(copy, before);
		const { copies } = await storeImage(
			t.db,
			bucket(),
			{ bytes, name: 'c.webp', alt: 'Inventada', copies: copiesFor(3) },
			{ actor: 'admin-prueba' }
		);
		expect(copies).toEqual([720]);
		expect(await bytesOf(copy)).toEqual(before);
	});

	it('servableCopy: solo de una imagen viva y que no sea GIF', async () => {
		const { image } = await storeImage(
			t.db,
			bucket(),
			{ bytes: fakeWebp(800, 800, 5), name: 'd.webp', alt: 'Inventada' },
			{ actor: 'admin-prueba' }
		);
		const copy = image.key.replace(/\.webp$/, '-360.webp');
		expect(await servableCopy(t.db, copy)).toEqual({ original: image.key });
		expect(await deleteImage(t.db, image.id, { actor: 'admin-prueba' })).toBe(true);
		expect(await servableCopy(t.db, copy)).toBeNull();
		expect(await servableCopy(t.db, image.key)).toBeNull();
		expect(await servableCopy(t.db, `img/${'e'.repeat(64)}-360.webp`)).toBeNull();
	});
});

/** @param {ArrayBuffer} buf */
const hexOf = (buf) =>
	[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

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
		// Dónde se usa cada una (el buscador del selector lo muestra).
		const uses = await imageUses(t.db, [i1.id, i2.id, i3.id], ADMIN);
		expect(uses.get(i3.id)).toEqual([`evento «${otro.title}»`]);
		expect(uses.get(i2.id)).toEqual(['etiqueta «Serie Prueba»']);

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

describe('storeFile (documentos y video)', () => {
	/** @param {Uint8Array} bytes @param {any} [extra] */
	const store = (bytes, extra = { title: 'Guía de prueba' }) =>
		storeFile(t.db, bucket(), { bytes, ...extra }, { actor: 'admin-prueba' });
	/** @param {Uint8Array} bytes @param {any} [extra] */
	const bad = async (bytes, extra) => {
		try {
			await store(bytes, extra);
		} catch (e) {
			return /** @type {any} */ (e);
		}
		throw new Error('se esperaba un error');
	};

	it('guarda un PDF en `file/…` con su nombre; sin nombre usa el del archivo', async () => {
		const { file, created } = await store(fakePdf());
		expect(created).toBe(true);
		expect(file.key).toMatch(/^file\/[0-9a-f]{64}\.pdf$/);
		expect(file).toMatchObject({ title: 'Guía de prueba', kind: 'documento', size: 300 });
		expect(await bucket().head(file.key)).not.toBeNull();
		expect(await servableMedia(t.db, file.key)).toMatchObject({
			kind: 'documento',
			mime: 'application/pdf',
			ext: 'pdf'
		});
		const other = await store(fakePdf(400), { name: 'otra-guia.pdf' });
		expect(other.file.title).toBe('otra-guia');
	});

	it('pide nombre, revisa el tipo por los bytes y el peso', async () => {
		expect((await bad(fakePdf(), { title: '  ', name: '' })).status).toBe(400);
		expect((await bad(fakeZip('word/document.xml', '<w/>'))).status).toBe(415);
		expect((await bad(solidPng(3, 3))).status).toBe(415);
		const huge = new Uint8Array(MAX_FILE_BYTES + 1);
		huge.set(fakePdf());
		const tooBig = await bad(huge);
		expect(tooBig.status).toBe(413);
		expect(tooBig.message).toMatch(/El máximo es 25 MB/);
	});

	it('borrar lo saca de /media; subirlo de nuevo lo vuelve; un texto que lo enlaza cuenta como uso', async () => {
		const { file } = await store(fakePdf());
		await saveObject(
			t.db,
			{
				type: 'material',
				slug: 'guia-inventada',
				title: 'Guía inventada',
				data: { body: `[Bajar el PDF](${file.url})` }
			},
			{ actor: 'admin-prueba' }
		);
		expect((await imageUsage(t.db, [file.id], ADMIN)).get(file.id)).toEqual([
			'material «Guía inventada»'
		]);
		expect(await deleteImage(t.db, file.id, { actor: 'admin-prueba' })).toBe(true);
		expect(await servableMedia(t.db, file.key)).toBeNull();
		const again = await store(fakePdf());
		expect(again.file.id).toBe(file.id);
		expect(await servableMedia(t.db, file.key)).not.toBeNull();
	});
});
