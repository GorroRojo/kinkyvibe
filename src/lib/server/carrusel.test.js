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
	carruselAjustesCached,
	carruselSlides,
	colorsByFeatured,
	readCarruselAjustes,
	saveCarruselCantidad,
	resetCarruselCache,
	saveCarruselModo
} from './carrusel.js';
import { conFichas } from './carruselFicha.js';

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

describe('los ajustes (modo, días y máximo)', () => {
	it('sin nada guardado: rotar, 14 días y 8', async () => {
		expect(await readCarruselAjustes(t.db)).toEqual({
			modo: 'rotar',
			dias: 14,
			maximo: 8,
			updatedAt: null,
			updatedBy: null
		});
		expect(await readCarruselAjustes(null)).toMatchObject({ modo: 'rotar', dias: 14, maximo: 8 });
	});

	it('el modo se guarda en ticket_settings, con quién y cuándo', async () => {
		await saveCarruselModo(t.db, 'c', { by: 'admin-prueba', now: NOW });
		expect(await readCarruselAjustes(t.db)).toEqual({
			modo: 'c',
			dias: 14,
			maximo: 8,
			updatedAt: NOW,
			updatedBy: 'admin-prueba'
		});
		await saveCarruselModo(t.db, 'rotar', { by: 'otre-admin', now: NOW + 1 });
		expect((await readCarruselAjustes(t.db)).modo).toBe('rotar');
		const rows = await t.db
			.prepare("SELECT COUNT(*) AS n FROM ticket_settings WHERE key = 'carrusel_estilo'")
			.first();
		expect(rows?.n).toBe(1);
	});

	it('días y máximo, cada uno en su fila, dentro de su rango; el último cambio manda', async () => {
		await saveCarruselModo(t.db, 'b', { by: 'admin-prueba', now: NOW });
		await saveCarruselCantidad(t.db, { dias: 30, maximo: 5 }, { by: 'otre-admin', now: NOW + 5 });
		expect(await readCarruselAjustes(t.db)).toEqual({
			modo: 'b',
			dias: 30,
			maximo: 5,
			updatedAt: NOW + 5,
			updatedBy: 'otre-admin'
		});
		await saveCarruselCantidad(t.db, { dias: 999, maximo: 0 }, { by: 'x', now: NOW + 6 });
		expect(await readCarruselAjustes(t.db)).toMatchObject({ dias: 60, maximo: 1 });
	});

	it('lo raro guardado a mano se lee como lo de por defecto', async () => {
		await t.db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES
				('carrusel_estilo', 'zzz', 1, 'x'), ('carrusel_dias', 'muchos', 1, 'x'),
				('carrusel_maximo', '2.5', 1, 'x')`
			)
			.run();
		expect(await readCarruselAjustes(t.db)).toMatchObject({ modo: 'rotar', dias: 14, maximo: 8 });
	});

	it('la portada los recuerda un rato; guardar los olvida', async () => {
		expect((await carruselAjustesCached(t.db, NOW)).modo).toBe('rotar');
		await t.db
			.prepare(
				"INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES ('carrusel_estilo', 'b', 1, 'x')"
			)
			.run();
		expect((await carruselAjustesCached(t.db, NOW + 1000)).modo).toBe('rotar');
		expect((await carruselAjustesCached(t.db, NOW + CARRUSEL_CACHE_MS + 1)).modo).toBe('b');
		await saveCarruselModo(t.db, 'e', { by: 'x', now: NOW });
		expect((await carruselAjustesCached(t.db, NOW + CARRUSEL_CACHE_MS + 2)).modo).toBe('e');
		await saveCarruselCantidad(t.db, { dias: 3, maximo: 2 }, { by: 'x', now: NOW });
		expect(await carruselAjustesCached(t.db, NOW + CARRUSEL_CACHE_MS + 3)).toMatchObject({
			dias: 3,
			maximo: 2
		});
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

	it('lo nuevo después de los eventos, con los días y el máximo de Ajustes', async () => {
		await image(HASH_A, { colors: ['#0f8b7a'] });
		const day = 86_400_000;
		const fecha = (/** @type {number} */ d) => new Date(NOW - d * day).toISOString();
		const posts = [
			event('evento', 3),
			{
				path: '/material/guia',
				meta: {
					title: 'Guía',
					category: 'material',
					published_date: fecha(2),
					featured: `/media/img/${HASH_A}.webp`
				}
			},
			{
				path: '/amigues/alguien',
				meta: { title: 'Alguien', category: 'amigues', published_date: fecha(1) }
			},
			{
				path: '/material/vieja',
				meta: { title: 'Vieja', category: 'material', published_date: fecha(20) }
			},
			{
				path: '/wiki/termino',
				meta: { title: 'Término', category: 'wiki' },
				createdAt: NOW - 4 * day
			}
		];
		const slides = await carruselSlides(t.platform, posts, { now: NOW });
		// Lo nuevo va como su vista previa (`ficha`), sin los colores de su imagen; los estilos son
		// para los eventos.
		expect(slides.map((s) => [s.path, s.estilo, s.colors])).toEqual([
			['/calendario/evento', 'a', null],
			['/amigues/alguien', 'ficha', null],
			['/material/guia', 'ficha', null],
			['/wiki/termino', 'ficha', null]
		]);
		const fichas = await conFichas(t.platform, slides);
		expect(fichas.map((s) => s.ficha && [s.ficha.kind, s.ficha.label, s.ficha.icon])).toEqual([
			null,
			['perfil', 'Amigues', 'heart'],
			['material', 'Material', 'book-open'],
			['wiki', 'Kinkipedia', 'globe']
		]);
		await saveCarruselCantidad(t.db, { dias: 30, maximo: 3 }, { by: 'x', now: NOW });
		resetCarruselCache();
		const otra = await carruselSlides(t.platform, posts, { now: NOW });
		expect(otra.map((s) => s.path)).toEqual([
			'/calendario/evento',
			'/amigues/alguien',
			'/material/guia'
		]);
	});

	it('sin eventos que entren, ninguna (y no consulta nada)', async () => {
		expect(
			await carruselSlides(t.platform, [event('ajeno', 3, { tags: [] })], { now: NOW })
		).toEqual([]);
	});
});
