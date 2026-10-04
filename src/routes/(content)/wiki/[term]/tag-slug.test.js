/**
 * /wiki/<término> sin entrada de la Kinkipedia: la página muestra la etiqueta, resuelta desde la
 * forma de la URL («Rancheadita-Kinky» → «Rancheadita Kinky», alias → su etiqueta) con el mismo
 * helper que /api/series y el .ics. Posts inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { DAY, fakeEvent } from '$lib/server/series/fixtures.js';

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
afterEach(() => {
	vi.doUnmock('$lib/utils');
	vi.resetModules();
});

async function modules() {
	vi.resetModules();
	const now = Date.now();
	const posts = [
		fakeEvent('rancheadita-prueba', now + 20 * DAY, ['Rancheadita Kinky']),
		fakeEvent('picante-prueba', now + 10 * DAY, ['Picantearla']),
		fakeEvent('ssc-prueba', now + 6 * DAY, ['SSC'])
	];
	// Los eventos salen de la base.
	await seedPosts(t.db, posts);
	vi.doMock('$lib/utils', async () => ({
		.../** @type {object} */ (await vi.importActual('$lib/utils')),
		fetchMarkdownPosts: async () => [...posts],
		fetchPost: async () => {
			throw new Error('404');
		},
		currentRelated: (/** @type {ProcessedPost[]} */ related) => ({
			relatedPosts: related,
			relatedPastCount: 0
		})
	}));
	return {
		server: await import('./+page.server.js'),
		universal: await import('./+page.js')
	};
}

/**
 * Lo que recibe la página para `term`: los posts relacionados (server) y la etiqueta (+page.js).
 * `siteTags` es lo que manda el layout raíz: null (el archivo) o el árbol de la base (interruptor
 * `etiquetas_db`).
 *
 * @param {Awaited<ReturnType<typeof modules>>} m
 * @param {string} term
 * @param {Record<string, unknown>[] | null} [siteTags]
 */
async function pageData(m, term, siteTags = null) {
	const data = /** @type {any} */ (
		await m.server.load(/** @type {any} */ ({ params: { term }, platform: t.platform }))
	);
	const parent = async () => ({ siteTags });
	const page = /** @type {any} */ (
		await m.universal.load(/** @type {any} */ ({ params: { term }, data, parent }))
	);
	return { slugs: data.relatedPosts.map((/** @type {any} */ p) => p.meta.postID), tag: page.tag };
}

describe('/wiki/<término> → etiqueta', () => {
	it('serie de varias palabras por su slug', async () => {
		const m = await modules();
		for (const term of ['Rancheadita-Kinky', 'Rancheadita Kinky', 'rancheadita-kinky']) {
			const { slugs, tag } = await pageData(m, term);
			expect(tag.id).toBe('Rancheadita Kinky');
			expect(tag.orphan).toBeFalsy();
			expect(slugs).toEqual(['rancheadita-prueba']);
		}
	});

	it('una de una palabra, como siempre', async () => {
		const m = await modules();
		const { slugs, tag } = await pageData(m, 'Picantearla');
		expect(tag.id).toBe('Picantearla');
		expect(slugs).toEqual(['picante-prueba']);
	});

	it('alias de varias palabras → su etiqueta', async () => {
		const m = await modules();
		const { slugs, tag } = await pageData(m, 'Sano-Seguro-y-Consensuado');
		expect(tag.id).toBe('SSC');
		expect(slugs).toEqual(['ssc-prueba']);
	});

	it('lo que no existe: etiqueta huérfana, sin posts', async () => {
		const m = await modules();
		const { slugs, tag } = await pageData(m, 'Rancheadita-Inventada');
		expect(tag.orphan).toBe(true);
		expect(slugs).toEqual([]);
	});

	it('con el árbol de la base (interruptor `etiquetas_db`), usa ese', async () => {
		const m = await modules();
		const siteTags = [
			{ id: 'root', children: ['evento recurrente'] },
			{ id: 'evento recurrente', children: ['Serie Inventada'] },
			{ id: 'Serie Inventada', visible_name: 'Una Serie Inventada' }
		];
		const { tag } = await pageData(m, 'Serie-Inventada', siteTags);
		expect(tag.id).toBe('Serie Inventada');
		expect(tag.orphan).toBeFalsy();
		expect(tag.visible_name).toBe('Una Serie Inventada');
		// La lista del layout no se toca (sigue siendo datos).
		expect(() => structuredClone(siteTags)).not.toThrow();
	});
});
