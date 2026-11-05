/**
 * El carrusel de la portada del lado del servidor (src/lib/server/carrusel.js) contra el D1 de
 * miniflare: el modo guardado en Ajustes, los colores guardados de los flyers y las diapositivas
 * armadas. Eventos e imágenes inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import {
	CARRUSEL_CACHE_MS,
	carruselModoCached,
	carruselSlides,
	colorsByFeatured,
	readCarruselModo,
	resetCarruselCache,
	saveCarruselModo
} from './carrusel.js';

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
	resetCarruselCache();
});

const NOW = Date.UTC(2026, 10, 5, 15, 0);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

/**
 * Una imagen de la biblioteca (sin archivo en R2: acá solo importa el objeto).
 * @param {string} hash
 * @param {Record<string, unknown>} [extra]
 */
async function image(hash, extra = {}) {
	return saveObject(
		t.db,
		{
			type: 'imagen',
			slug: hash,
			title: `flyer ${hash.slice(0, 4)}`,
			data: { key: `img/${hash}.webp`, mime: 'image/webp', size: 100, ...extra }
		},
		{ actor: 'admin-prueba', now: NOW }
	);
}

/**
 * Un evento como los de la portada.
 * @param {string} slug
 * @param {number} days días desde NOW
 * @param {Record<string, unknown>} [meta]
 */
const event = (slug, days, meta = {}) => ({
	path: `/calendario/${slug}`,
	meta: {
		title: `Evento ${slug}`,
		category: 'calendario',
		tags: ['KinkyVibe'],
		start: new Date(NOW + days * 86_400_000).toISOString().replace('Z', '+00:00'),
		...meta
	}
});

describe('el modo de Ajustes', () => {
	it('sin nada guardado, rotar', async () => {
		expect(await readCarruselModo(t.db)).toEqual({
			modo: 'rotar',
			updatedAt: null,
			updatedBy: null
		});
		expect(await readCarruselModo(null)).toMatchObject({ modo: 'rotar' });
	});

	it('se guarda en ticket_settings, con quién y cuándo', async () => {
		await saveCarruselModo(t.db, 'c', { by: 'admin-prueba', now: NOW });
		expect(await readCarruselModo(t.db)).toEqual({
			modo: 'c',
			updatedAt: NOW,
			updatedBy: 'admin-prueba'
		});
		await saveCarruselModo(t.db, 'rotar', { by: 'otre-admin', now: NOW + 1 });
		expect((await readCarruselModo(t.db)).modo).toBe('rotar');
		const rows = await t.db
			.prepare("SELECT COUNT(*) AS n FROM ticket_settings WHERE key = 'carrusel_estilo'")
			.first();
		expect(rows?.n).toBe(1);
	});

	it('lo raro guardado a mano se lee como rotar', async () => {
		await t.db
			.prepare(
				"INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES ('carrusel_estilo', 'zzz', 1, 'x')"
			)
			.run();
		expect((await readCarruselModo(t.db)).modo).toBe('rotar');
	});

	it('la portada lo recuerda un rato; guardar lo olvida', async () => {
		expect(await carruselModoCached(t.db, NOW)).toBe('rotar');
		await t.db
			.prepare(
				"INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES ('carrusel_estilo', 'b', 1, 'x')"
			)
			.run();
		expect(await carruselModoCached(t.db, NOW + 1000)).toBe('rotar');
		expect(await carruselModoCached(t.db, NOW + CARRUSEL_CACHE_MS + 1)).toBe('b');
		await saveCarruselModo(t.db, 'e', { by: 'x', now: NOW });
		expect(await carruselModoCached(t.db, NOW + CARRUSEL_CACHE_MS + 2)).toBe('e');
	});
});

describe('colorsByFeatured', () => {
	it('los colores guardados de las imágenes de la biblioteca, por dirección', async () => {
		await image(HASH_A, { colors: ['#e6148c', '#1e9be0'] });
		await image(HASH_B);
		const map = await colorsByFeatured(t.db, [
			`/media/img/${HASH_A}.webp`,
			`/media/img/${HASH_B}.webp`,
			'https://otro.sitio/flyer.png',
			undefined
		]);
		expect([...map]).toEqual([[`/media/img/${HASH_A}.webp`, ['#e6148c', '#1e9be0']]]);
	});

	it('una imagen borrada no da colores; sin direcciones de la biblioteca, no consulta', async () => {
		const o = await image(HASH_A, { colors: ['#e6148c'] });
		await saveObject(
			t.db,
			{ id: o.id, type: 'imagen', version: o.version, deleted: true },
			{ actor: 'x', now: NOW }
		);
		expect((await colorsByFeatured(t.db, [`/media/img/${HASH_A}.webp`])).size).toBe(0);
		expect((await colorsByFeatured(null, ['/x.webp'])).size).toBe(0);
	});
});

describe('carruselSlides', () => {
	it('cada diapositiva con su estilo (rotando, o el del evento) y los colores de su flyer', async () => {
		await image(HASH_A, { colors: ['#e6148c', '#1e9be0'] });
		const posts = [
			event('tercero', 9),
			event('primero', 2, { featured: `/media/img/${HASH_A}.webp` }),
			event('segundo', 5, { featured: `/media/img/${HASH_B}.webp`, carrusel_estilo: 'e' }),
			event('ajeno', 3, { tags: ['otra'] }),
			event('pasado', -1)
		];
		const slides = await carruselSlides(t.platform, posts, { now: NOW });
		expect(slides.map((s) => [s.path, s.estilo, s.colors])).toEqual([
			['/calendario/primero', 'a', ['#e6148c', '#1e9be0']],
			// el del evento manda; su imagen todavía no tiene colores: la marca
			['/calendario/segundo', 'e', null],
			['/calendario/tercero', 'c', null]
		]);
	});

	it('con un estilo fijo en Ajustes, todas ese (menos la que eligió otro)', async () => {
		await saveCarruselModo(t.db, 'd', { by: 'x', now: NOW });
		const posts = [event('uno', 1), event('dos', 2, { carrusel_estilo: 'b' }), event('tres', 3)];
		const slides = await carruselSlides(t.platform, posts, { now: NOW });
		expect(slides.map((s) => s.estilo)).toEqual(['d', 'b', 'd']);
		// `modo` (solo en desarrollo, `?carrousel=`) prueba otro sin guardarlo
		const tried = await carruselSlides(t.platform, posts, { now: NOW, modo: 'rotar' });
		expect(tried.map((s) => s.estilo)).toEqual(['a', 'b', 'c']);
	});

	it('sin eventos que entren, ninguna (y no consulta nada)', async () => {
		expect(
			await carruselSlides(t.platform, [event('ajeno', 3, { tags: [] })], { now: NOW })
		).toEqual([]);
	});
});
