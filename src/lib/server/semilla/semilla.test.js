/**
 * La semilla de contenido de las bases locales (./index.js y los .json de esta carpeta): se carga
 * entera sin errores en una base vacía, lo que sirve para las pruebas E2E está, y cargarla otra vez
 * no cambia nada.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { loadSeed } from './index.js';
import etiquetas from './etiquetas.json';
import wiki from './wiki.json';
import amigues from './amigues.json';
import calendario from './calendario.json';
import material from './material.json';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const seed = { etiquetas, wiki, amigues, calendario, material };

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

/**
 * @param {string} type
 * @returns {Promise<string[]>}
 */
async function slugsOf(type) {
	const { results } = await t.db
		.prepare('SELECT slug FROM objects WHERE type = ?1 AND deleted_at IS NULL ORDER BY slug')
		.bind(type)
		.all();
	return results.map((r) => String(r.slug));
}

describe('loadSeed', () => {
	it('carga todo en una base vacía, sin errores', async () => {
		const r = await loadSeed(t.db, seed, { actor: 'prueba', now: Date.UTC(2026, 9, 1) });
		expect(r.errors).toEqual([]);
		expect(r.calendario?.created).toBe(calendario.length);
		expect(r.material?.created).toBe(material.length);
		expect(r.amigues?.created).toBe(amigues.length);
		expect(r.etiquetas?.created).toBeGreaterThan(0);
		expect(r.etiquetas?.error).toBe(0);
	});

	it('trae lo que usan las pruebas E2E (tests/smoke.spec.js, tests/tickets)', async () => {
		const eventos = await slugsOf('evento');
		for (const slug of [
			'someter-2026-09',
			'prueba-entradas-2026-12',
			'cine-para-sucixs-octubre-2023',
			'grupo-de-apoyo-y-discusion-para-doms-noviembre-2023'
		]) {
			expect(eventos).toContain(slug);
		}
		expect(await slugsOf('material')).toContain('6-tips-para-tops');
		const { results } = await t.db
			.prepare(
				`SELECT legacy_slug FROM profile_sources WHERE legacy_slug = 'AUCH'
				UNION ALL SELECT json_extract(data, '$.key') FROM objects
				WHERE type = 'etiqueta' AND json_extract(data, '$.key') = 'BDSM'`
			)
			.all();
		expect(results).toHaveLength(2);
	});

	it('cargarla otra vez no cambia nada', async () => {
		const r = await loadSeed(t.db, seed, { actor: 'prueba' });
		expect(r.errors).toEqual([]);
		// Las etiquetas no se vuelven a cargar en una base que ya tiene.
		expect(r.etiquetas).toBeNull();
		for (const part of /** @type {const} */ (['amigues', 'calendario', 'material'])) {
			expect(r[part]).toMatchObject({ created: 0, updated: 0, error: 0 });
		}
	});
});
