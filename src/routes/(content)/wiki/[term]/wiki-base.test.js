/**
 * «Solo base», paso 2: la Kinkipedia sale de la base. `/wiki/<término>` muestra el texto de la wiki
 * de la etiqueta (importado del .md o editado en el panel), armado en cada pedido (ya no se
 * prerenderiza); el glosario y el sitemap lo leen de las etiquetas. Un .md de la wiki que la base
 * no tiene no se muestra. D1 de miniflare; etiquetas y textos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { importTags } from '$lib/server/etiquetas/importer.js';

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
afterEach(() => {
	vi.resetModules();
});

const WIKI = `---
title: Término Inventado
wiki: termino inventado
summary: Un resumen de prueba.
tags:
  - otra inventada
layout: wiki
category: wiki
authors:
  - Alguien Inventade
---

## Qué es

Un texto de prueba que enlaza [[otra inventada]].
`;

async function seed() {
	await importTags(
		t.db,
		{
			rawTags: [
				{ id: 'root', children: ['termino inventado', 'otra inventada', 'BDSM'] },
				{ id: 'termino inventado' },
				{ id: 'otra inventada', description: 'Una etiqueta de prueba.' },
				{ id: 'BDSM' }
			],
			wikiFiles: [{ name: 'termino-inventado', raw: WIKI }]
		},
		{ actor: 'prueba' }
	);
}

/** Las rutas, recién cargadas (el árbol de etiquetas se lee de nuevo). */
async function modules() {
	vi.resetModules();
	const source = await import('$lib/server/etiquetas/source.js');
	source.clearTagSourceCache();
	return {
		server: await import('./+page.server.js'),
		universal: await import('./+page.js'),
		layout: await import('../../../+layout.server.js'),
		index: await import('../+page.server.js'),
		sitemap: await import('../../sitemap.xml/+server.js')
	};
}

/** @param {Awaited<ReturnType<typeof modules>>} m @param {string} term */
async function page(m, term) {
	const data = /** @type {any} */ (
		await m.server.load(/** @type {any} */ ({ params: { term }, platform: t.platform }))
	);
	return /** @type {any} */ (
		await m.universal.load(
			/** @type {any} */ ({ params: { term }, data, parent: async () => ({ siteTags: null }) })
		)
	);
}

describe('/wiki/<término> desde la base', () => {
	it('muestra el texto de la wiki de la etiqueta, armado en el servidor', async () => {
		await seed();
		const m = await modules();
		expect(m.universal.prerender).toBe(false);
		const data = await page(m, 'termino-inventado');
		expect(data.meta).toMatchObject({
			title: 'Término Inventado',
			wiki: 'termino inventado',
			summary: 'Un resumen de prueba.',
			authors: ['Alguien Inventade'],
			category: 'wiki',
			postID: 'termino-inventado'
		});
		expect(data.html).toContain('Qué es');
		expect(data.html).toContain('Un texto de prueba');
		// El link de la wiki, como lo armaba mdsvex.
		expect(data.html).toMatch(/href="\/wiki\/otra-inventada"/);
		// No hay componente compilado de un .md: el texto viene armado.
		expect(data.content).toBeUndefined();
	});

	it('«X min de lectura»: del texto de la base, solo si es largo (idea de JorgeT10, PR #46)', async () => {
		await seed();
		const m = await modules();
		// El texto de prueba es corto: no se muestra.
		expect((await page(m, 'termino-inventado')).readingMinutes).toBe(0);
		expect((await page(m, 'termino-inventado')).readingWords).toBe(0);
		const long = Array.from({ length: 420 }, (_, i) => `palabra${i}`).join(' ');
		await importTags(
			t.db,
			{
				rawTags: [
					{ id: 'root', children: ['termino inventado', 'otra inventada', 'BDSM'] },
					{ id: 'termino inventado' },
					{ id: 'otra inventada', description: 'Una etiqueta de prueba.' },
					{ id: 'BDSM' }
				],
				wikiFiles: [{ name: 'termino-inventado', raw: WIKI.replace('Un texto de prueba', long) }]
			},
			{ actor: 'prueba' }
		);
		const m2 = await modules();
		const data = await page(m2, 'termino-inventado');
		// 420 palabras + «Qué es» + «que enlaza otra inventada» = 426 → 3 min.
		expect(data.readingMinutes).toBe(3);
		expect(data.readingWords).toBe(426);
	});

	it('cómo se muestra el texto: libre si está guardado así; sin valor, la lista corta', async () => {
		await importTags(
			t.db,
			{
				rawTags: [{ id: 'root', children: ['termino inventado'] }, { id: 'termino inventado' }],
				wikiFiles: [
					{
						name: 'termino-inventado',
						raw: WIKI.replace(
							'Un texto de prueba',
							'<span style="color: darkred" tabindex="1">Un texto de prueba</span>'
						)
					}
				]
			},
			{ actor: 'prueba' }
		);
		const tagData = async () =>
			JSON.parse(
				String(
					await t.db
						.prepare(
							"SELECT data FROM objects WHERE type = 'etiqueta' AND json_extract(data, '$.key') = 'termino inventado'"
						)
						.first('data')
				)
			);
		// Lo importado queda guardado como HTML libre y se ve tal cual.
		expect((await tagData()).wiki_body_html).toBe('libre');
		const libre = await page(await modules(), 'termino-inventado');
		expect(libre.html).toContain('style="color: darkred"');

		// Sin valor guardado: la lista corta (se va el `style`, queda el texto).
		await t.db
			.prepare(
				"UPDATE objects SET data = json_remove(data, '$.wiki_body_html'), version = version + 1 WHERE type = 'etiqueta' AND json_extract(data, '$.key') = 'termino inventado'"
			)
			.run();
		expect((await tagData()).wiki_body_html).toBeUndefined();
		const corta = await page(await modules(), 'termino-inventado');
		expect(corta.html).toContain('Un texto de prueba');
		expect(corta.html).not.toContain('style=');
		expect(corta.html).not.toContain('tabindex');
	});

	it('el glosario y el sitemap leen las páginas de la base', async () => {
		await seed();
		const m = await modules();
		// El glosario (/wiki y cada /wiki/<término>) recibe las páginas con su propia página; el
		// layout raíz ya no las manda en todas las páginas.
		const index = /** @type {any} */ (
			await m.index.load(/** @type {any} */ ({ platform: t.platform }))
		);
		expect(index.wiki.map((/** @type {any} */ p) => p.path)).toEqual(['/wiki/termino-inventado']);
		const term = await page(m, 'termino-inventado');
		expect(term.wiki.map((/** @type {any} */ p) => p.path)).toEqual(['/wiki/termino-inventado']);
		const layout = /** @type {any} */ (
			await m.layout.load(/** @type {any} */ ({ locals: {}, platform: t.platform }))
		);
		expect(layout.wiki).toBeUndefined();
		const xml = await (await m.sitemap.GET(/** @type {any} */ ({ platform: t.platform }))).text();
		expect(xml).toContain('<loc>https://kinkyvibe.ar/wiki/termino-inventado</loc>');
		// Un .md de la wiki del repo que la base no tiene no aparece.
		expect(xml).not.toContain('/wiki/BDSM</loc>');
	});

	it('un .md de la wiki que la base no tiene no se muestra: la página muestra la etiqueta', async () => {
		await seed();
		const m = await modules();
		// src/lib/posts/wiki/BDSM.md está en el repo, pero la etiqueta no tiene texto de la wiki.
		const data = await page(m, 'BDSM');
		expect(data.meta).toBeUndefined();
		expect(data.html).toBeUndefined();
		expect(data.tag?.id).toBe('BDSM');
	});

	it('sin base: no hay páginas de la wiki', async () => {
		const m = await modules();
		const none = /** @type {any} */ ({ env: {} });
		const data = /** @type {any} */ (
			await m.server.load(/** @type {any} */ ({ params: { term: 'BDSM' }, platform: none }))
		);
		expect(data.meta).toBeUndefined();
		expect(data.wiki).toEqual([]);
		const index = /** @type {any} */ (await m.index.load(/** @type {any} */ ({ platform: none })));
		expect(index.wiki).toEqual([]);
	});
});
