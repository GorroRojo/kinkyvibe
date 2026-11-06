import { describe, expect, it } from 'vitest';
import {
	CARRUSEL_DIAS,
	CARRUSEL_DIAS_RANGO,
	CARRUSEL_MAXIMO,
	CARRUSEL_MAXIMO_RANGO,
	CARRUSEL_TIPOS,
	carruselPosts,
	enRango,
	publicadoEl
} from './carrusel.js';

const NOW = Date.UTC(2026, 10, 5, 15, 0);
const DAY = 86_400_000;
const iso = (/** @type {number} */ ms) => new Date(ms).toISOString();

/** @param {string} slug @param {number} days @param {Record<string, unknown>} [meta] */
const evento = (slug, days, meta = {}) => ({
	path: `/calendario/${slug}`,
	meta: {
		title: slug,
		category: 'calendario',
		tags: ['KinkyVibe'],
		start: iso(NOW + days * DAY),
		...meta
	}
});
/** @param {'material' | 'amigues'} category @param {string} slug @param {number} daysAgo @param {Record<string, unknown>} [meta] */
const nuevo = (category, slug, daysAgo, meta = {}) => ({
	path: `/${category}/${slug}`,
	meta: { title: slug, category, published_date: iso(NOW - daysAgo * DAY), ...meta }
});
/** @param {string} slug @param {number} daysAgo */
const wiki = (slug, daysAgo) => ({
	path: `/wiki/${slug}`,
	meta: { title: slug, category: 'wiki' },
	createdAt: NOW - daysAgo * DAY
});

describe('carruselPosts', () => {
	it('los eventos de Kinky Vibe que no empezaron ni se cancelaron, por fecha', () => {
		const posts = [
			evento('tercero', 9),
			evento('primero', 1),
			evento('cancelado', 2, { status: 'cancelado' }),
			evento('ajeno', 3, { tags: ['otra'] }),
			evento('pasado', -1),
			evento('segundo', 4)
		];
		expect(carruselPosts(posts, { now: NOW }).map((p) => p.path)).toEqual([
			'/calendario/primero',
			'/calendario/segundo',
			'/calendario/tercero'
		]);
	});

	it('después, lo nuevo de los últimos días, intercalando los tipos (lo más nuevo primero)', () => {
		const posts = [
			nuevo('material', 'm1', 1),
			nuevo('material', 'm2', 2),
			nuevo('material', 'm3', 3),
			nuevo('material', 'm4', 4),
			nuevo('amigues', 'a1', 5),
			wiki('w1', 6),
			evento('ev', 2)
		];
		expect(carruselPosts(posts, { now: NOW }).map((p) => p.path)).toEqual([
			'/calendario/ev',
			'/material/m1',
			'/amigues/a1',
			'/wiki/w1',
			'/material/m2',
			'/material/m3',
			'/material/m4'
		]);
	});

	it('sin lo viejo, lo de fecha futura, lo que redirige ni lo que no tiene fecha', () => {
		const posts = [
			nuevo('material', 'viejo', CARRUSEL_DIAS + 1),
			nuevo('material', 'futuro', -1),
			nuevo('material', 'redirige', 1, { redirect: true }),
			nuevo('amigues', 'sin-fecha', 1, { published_date: undefined }),
			{ path: '/wiki/sin-fecha', meta: { title: 'x', category: 'wiki' } },
			nuevo('amigues', 'si', 1)
		];
		expect(carruselPosts(posts, { now: NOW }).map((p) => p.path)).toEqual(['/amigues/si']);
		// con más días, lo viejo entra
		expect(
			carruselPosts(posts, { now: NOW, dias: CARRUSEL_DIAS + 5 }).map((p) => p.path)
		).toContain('/material/viejo');
	});

	it('como mucho el máximo, contando los eventos (que van primero)', () => {
		const posts = [
			...Array.from({ length: 6 }, (_, i) => evento(`e${i}`, i + 1)),
			...Array.from({ length: 6 }, (_, i) => nuevo('material', `m${i}`, i))
		];
		expect(carruselPosts(posts, { now: NOW })).toHaveLength(CARRUSEL_MAXIMO);
		const tres = carruselPosts(posts, { now: NOW, limit: 3 });
		expect(tres.map((p) => p.path)).toEqual(['/calendario/e0', '/calendario/e1', '/calendario/e2']);
		expect(carruselPosts(posts, { now: NOW, limit: 7 }).at(-1)?.path).toBe('/material/m0');
	});

	it('la fecha de cada tipo: la de publicación, o la de la etiqueta en la Kinkipedia', () => {
		expect(publicadoEl(nuevo('material', 'x', 2))).toBe(NOW - 2 * DAY);
		expect(publicadoEl(wiki('x', 3))).toBe(NOW - 3 * DAY);
		expect(publicadoEl({ path: '/material/x', meta: { category: 'material' } })).toBeNaN();
	});
});

describe('enRango (los números de Ajustes)', () => {
	it('un entero dentro del rango; si no, el borde o lo de por defecto', () => {
		expect(enRango('20', CARRUSEL_DIAS_RANGO, CARRUSEL_DIAS)).toBe(20);
		expect(enRango(500, CARRUSEL_DIAS_RANGO, CARRUSEL_DIAS)).toBe(CARRUSEL_DIAS_RANGO.max);
		expect(enRango('0', CARRUSEL_MAXIMO_RANGO, CARRUSEL_MAXIMO)).toBe(CARRUSEL_MAXIMO_RANGO.min);
		for (const raro of ['', null, undefined, 'muchos', '2.5', NaN]) {
			expect(enRango(raro, CARRUSEL_MAXIMO_RANGO, CARRUSEL_MAXIMO)).toBe(CARRUSEL_MAXIMO);
		}
	});
});

describe('los nombres de los tipos', () => {
	it('los del sitio: Material, Amigues, Kinkipedia', () => {
		expect(CARRUSEL_TIPOS).toMatchObject({
			material: 'Material',
			amigues: 'Amigues',
			wiki: 'Kinkipedia'
		});
	});
});
