/**
 * Importación de las imágenes del repo a la biblioteca (scripts/import-images.js): vista previa
 * sin escribir nada, la importación con sus edges y que correrla de nuevo no duplica. D1 y R2 de
 * miniflare; eventos, series e imágenes inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { featuredPath, importRepoImages, isImportablePath, seriesImagePath } from './import.js';
import { solidPng } from './testing.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

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

const OWN = 'src/lib/posts/calendario/media/fiesta-inventada-2031-03/1.png';
const SHARED = 'src/lib/assets/serie-inventada.png';
const files = [
	{ path: OWN, bytes: solidPng(6, 4, [200, 30, 30]) },
	{ path: SHARED, bytes: solidPng(5, 5, [30, 30, 200]) },
	// No es una imagen de las que se importan (un PDF del material): se saltea.
	{ path: 'src/lib/posts/material/media/guia-inventada/guia.pdf', bytes: new Uint8Array([1]) }
];

async function seed() {
	await seedPosts(t.db, [
		{
			category: 'calendario',
			postID: 'fiesta-inventada-2031-03',
			title: 'Fiesta Inventada',
			start: '2031-03-10T22:00-03:00',
			featured: 1
		},
		{
			category: 'calendario',
			postID: 'otra-fiesta-2031-04',
			title: 'Otra Fiesta',
			start: '2031-04-10T22:00-03:00',
			featured: 'serie-inventada.png'
		},
		{
			category: 'calendario',
			postID: 'sin-archivo-2031-05',
			title: 'Sin Archivo',
			start: '2031-05-10T22:00-03:00',
			featured: 7
		}
	]);
	await saveObject(
		t.db,
		{
			type: 'etiqueta',
			slug: 'serie-inventada',
			title: 'Serie Inventada',
			data: { key: 'Serie Inventada', image: 'calendario:fiesta-inventada-2031-03/1.png' }
		},
		{ actor: 'prueba' }
	);
}

const count = async (/** @type {string} */ sql) =>
	Number((await t.db.prepare(sql).first())?.n ?? 0);

describe('rutas del repo', () => {
	it('qué se importa y a qué archivo apunta cada campo viejo', () => {
		expect(isImportablePath(OWN)).toBe(true);
		expect(isImportablePath(SHARED)).toBe(true);
		expect(isImportablePath('src/lib/posts/material/media/x/guia.pdf')).toBe(false);
		expect(isImportablePath('src/lib/assets/sub/x.png')).toBe(false);
		const paths = new Set([OWN, SHARED]);
		expect(featuredPath('calendario', 'fiesta-inventada-2031-03', 1, paths)).toBe(OWN);
		expect(featuredPath('calendario', 'x', 'serie-inventada.png', paths)).toBe(SHARED);
		expect(featuredPath('calendario', 'x', '../../secreto.png', paths)).toBeNull();
		expect(seriesImagePath('calendario:fiesta-inventada-2031-03/1.png', paths)).toBe(OWN);
		expect(seriesImagePath('serie-inventada.png', paths)).toBe(SHARED);
		expect(seriesImagePath('https://otro.example/x.png', paths)).toBeNull();
	});
});

describe('importRepoImages', () => {
	it('vista previa: cuenta todo y no escribe nada', async () => {
		await seed();
		const before = await count('SELECT max(version) + count(*) AS n FROM objects');
		const s = await importRepoImages(t.db, t.env.MEDIA, { files, actor: 'prueba', dryRun: true });
		expect(s).toMatchObject({ files: 2, newImages: 2, knownImages: 0, errors: [] });
		expect(s.skipped).toEqual(['src/lib/posts/material/media/guia-inventada/guia.pdf']);
		expect(s.links.map((l) => `${l.type}:${l.slug}:${l.kind}`).sort()).toEqual([
			'etiqueta:Serie Inventada:imagen',
			'evento:fiesta-inventada-2031-03:portada',
			'evento:otra-fiesta-2031-04:portada'
		]);
		expect(s.missing).toEqual([{ type: 'evento', slug: 'sin-archivo-2031-05', value: '7' }]);
		expect(await count("SELECT count(*) AS n FROM objects WHERE type = 'imagen'")).toBe(0);
		expect(await count('SELECT max(version) + count(*) AS n FROM objects')).toBe(before);
		expect((await /** @type {any} */ (t.env.MEDIA).list()).objects).toHaveLength(0);
	});

	it('importa una vez: imágenes, edges y nada duplicado al repetir', async () => {
		await seed();
		const s = await importRepoImages(t.db, t.env.MEDIA, { files, actor: 'prueba' });
		expect(s.errors).toEqual([]);
		expect(await count("SELECT count(*) AS n FROM objects WHERE type = 'imagen'")).toBe(2);
		expect(await count("SELECT count(*) AS n FROM edges WHERE kind IN ('portada', 'imagen')")).toBe(
			3
		);
		expect((await /** @type {any} */ (t.env.MEDIA).list()).objects).toHaveLength(2);
		const own = await t.db
			.prepare(
				"SELECT title, json_extract(data, '$.alt') AS alt, json_extract(data, '$.source_path') AS src FROM objects WHERE type = 'imagen' AND json_extract(data, '$.source_path') = ?1"
			)
			.bind(OWN)
			.first();
		expect(own).toMatchObject({ alt: expect.stringContaining('Fiesta Inventada'), src: OWN });

		const again = await importRepoImages(t.db, t.env.MEDIA, { files, actor: 'prueba' });
		expect(again).toMatchObject({ newImages: 0, knownImages: 2, errors: [] });
		expect(again.links).toEqual([]);
		expect(await count("SELECT count(*) AS n FROM objects WHERE type = 'imagen'")).toBe(2);
		expect(await count("SELECT count(*) AS n FROM edges WHERE kind IN ('portada', 'imagen')")).toBe(
			3
		);
	});
});
