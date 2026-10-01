/**
 * /wiki/<término> sin entrada de la Kinkipedia: la página muestra la etiqueta, resuelta desde la
 * forma de la URL («Rancheadita-Kinky» → «Rancheadita Kinky», alias → su etiqueta) con el mismo
 * helper que /api/series y el .ics. Posts inventados.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY, fakeEvent } from '$lib/server/series/fixtures.js';

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
	vi.doMock('$lib/utils', () => ({
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
 *
 * @param {Awaited<ReturnType<typeof modules>>} m
 * @param {string} term
 */
async function pageData(m, term) {
	const data = /** @type {any} */ (await m.server.load(/** @type {any} */ ({ params: { term } })));
	const page = /** @type {any} */ (
		await m.universal.load(/** @type {any} */ ({ params: { term }, data }))
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
});
