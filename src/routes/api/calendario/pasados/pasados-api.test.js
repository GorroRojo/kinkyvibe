/**
 * GET /api/calendario/pasados?mes=yyyy-MM: los eventos que ya empezaron ese mes, en hora de
 * Argentina (UTC−3). Sin más, solo lo de la grilla (sin lugar ni resumen); con `enteros=1`,
 * enteros (para la lista con «Mostrar eventos pasados», que antes bajaba /api/posts entero). Un mes
 * vacío da `[]`. D1 de miniflare; eventos inventados.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { fakeEvent, fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { PAST_EVENT_FIELDS } from '$lib/server/eventos/pasados.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const NOW = Date.parse('2026-10-12T15:00:00-03:00');

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	await seedPosts(
		t.db,
		[
			// el 31/8 a las 23:59 en Argentina ya es 1/9 en UTC: es de agosto
			fakeEvent('fin-de-agosto', '2026-08-31T23:59-03:00', ['taller']),
			// el 30/9 a las 22 en Argentina ya es 1/10 en UTC: es de septiembre
			fakeEvent('fin-de-septiembre', '2026-09-30T22:00-03:00', ['taller']),
			// el 1/10 a las 0:30 en Argentina (3:30 UTC): es de octubre
			fakeEvent('inicio-de-octubre', '2026-10-01T00:30-03:00', ['taller']),
			fakeEvent('octubre-pasado', '2026-10-03T20:00-03:00', ['taller'], {
				location: 'Calle Inventada 123'
			}),
			fakeEvent('octubre-proximo', '2026-10-20T20:00-03:00', ['taller'])
		],
		{ now: NOW - 90 * 86_400_000 }
	);
});
afterAll(async () => {
	await t?.dispose();
});
afterEach(() => {
	vi.useRealTimers();
});

/**
 * @param {string} query
 * @returns {Promise<any[]>}
 */
async function get(query) {
	vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
	const { GET } = await import('./+server.js');
	const res = await GET(
		/** @type {any} */ (
			fakeRequestEvent({ platform: t.platform, path: `/api/calendario/pasados?${query}` })
		)
	);
	return res.json();
}

/** @param {any[]} posts */
const slugs = (posts) => posts.map((p) => p.meta.postID).sort();

describe('GET /api/calendario/pasados', () => {
	it('un mes: solo los que ya empezaron, con lo de la grilla (sin lugar ni resumen)', async () => {
		const posts = await get('mes=2026-10');
		expect(slugs(posts)).toEqual(['inicio-de-octubre', 'octubre-pasado']);
		for (const p of posts) {
			expect(Object.keys(p.meta).every((k) => PAST_EVENT_FIELDS.includes(k))).toBe(true);
		}
		expect(JSON.stringify(posts)).not.toContain('Calle Inventada 123');
		expect(JSON.stringify(posts)).not.toContain('Resumen inventado');
	});

	it('enteros=1: los mismos, enteros (para la lista), y nada de otro mes', async () => {
		const posts = await get('mes=2026-10&enteros=1');
		expect(slugs(posts)).toEqual(['inicio-de-octubre', 'octubre-pasado']);
		const pasado = posts.find((p) => p.meta.postID === 'octubre-pasado');
		expect(pasado.path).toBe('/calendario/octubre-pasado');
		expect(pasado.meta).toMatchObject({ summary: 'Resumen inventado', authors: ['KinkyVibe'] });
	});

	it('un mes vacío: []', async () => {
		expect(await get('mes=2026-11')).toEqual([]);
		expect(await get('mes=2026-11&enteros=1')).toEqual([]);
		expect(await get('mes=2019-01&enteros=1')).toEqual([]);
	});

	it('los bordes del mes van en hora de Argentina (UTC−3), no en UTC', async () => {
		expect(slugs(await get('mes=2026-09&enteros=1'))).toEqual(['fin-de-septiembre']);
		expect(slugs(await get('mes=2026-08&enteros=1'))).toEqual(['fin-de-agosto']);
		expect(slugs(await get('mes=2026-09'))).toEqual(['fin-de-septiembre']);
	});

	it('un mes mal escrito: 400', async () => {
		for (const q of ['mes=2026-13', 'mes=octubre', '', 'enteros=1']) {
			expect(await thrown(() => get(q))).toMatchObject({ status: 400 });
		}
	});
});
