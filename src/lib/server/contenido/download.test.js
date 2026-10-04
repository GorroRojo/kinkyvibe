/**
 * «Descargar todo» arma desde la base los mismos .md del repo: la misma metadata y el mismo texto
 * (los interactivos, otra vez como el componente importado en el `<script>`). Con TODO el material
 * real del repo y los eventos reales que tienen `<script>` o `<style>` (públicos), importados a un
 * D1 de miniflare con la importación de verdad.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { splitMarkdown } from '../amigues/importer.js';
import { coreTypes } from '../objects/types/index.js';
import { normalizeBody } from './eventos.js';
import { runImport } from './importer.js';
import { contentArchiveFiles } from './download.js';
import { markdownToPost } from './markdown.js';
import { metaDiff, normalizeMeta } from './parity.js';
import { CONTENT_CATEGORIES } from './categories.js';

const metas = /** @type {Record<string, Record<string, any> | undefined>} */ (
	import.meta.glob('/src/lib/posts/{calendario,material}/*.md', { import: 'metadata', eager: true })
);
const raws = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/{calendario,material}/*.md', {
		query: '?raw',
		import: 'default',
		eager: true
	})
);

/** @param {string} path */
const partsOf = (path) => {
	const [category, file] = path.split('/').slice(-2);
	return { category, slug: file.replace(/\.md$/, '') };
};

/** Lo que se importa: todo el material y los eventos con `<script>` o `<style>`. */
const chosen = Object.keys(raws)
	.filter((p) => !partsOf(p).slug.startsWith('_') && metas[p])
	.filter((p) => partsOf(p).category === 'material' || /<(script|style)[\s>]/i.test(raws[p]));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	for (const category of Object.keys(CONTENT_CATEGORIES)) {
		const files = chosen
			.filter((p) => partsOf(p).category === category)
			.map((p) => ({ legacySlug: partsOf(p).slug, raw: raws[p], meta: metas[p] ?? null }));
		const r = await runImport(t.db, category, files, { actor: 'prueba', limit: 1000 });
		expect(r.results.filter((x) => x.action === 'error')).toEqual([]);
	}
}, 300_000);
afterAll(async () => {
	await t?.dispose();
});

describe('«Descargar todo»', () => {
	it('da los mismos .md del repo: misma metadata y mismo texto', async () => {
		const files = await contentArchiveFiles(t.db);
		const byName = new Map(files.map((f) => [f.name, f.content]));
		expect(chosen.length).toBeGreaterThan(60);
		const missing = chosen.filter(
			(p) => !byName.has(`${partsOf(p).category}/${partsOf(p).slug}.md`)
		);
		expect(missing).toEqual([]);
		/** @type {string[]} */
		const problems = [];
		for (const path of chosen) {
			const { category, slug } = partsOf(path);
			const content = byName.get(`${category}/${slug}.md`);
			if (content === undefined) {
				problems.push(`${slug}: falta`);
				continue;
			}
			if (
				normalizeBody(splitMarkdown(content).body) !== normalizeBody(splitMarkdown(raws[path]).body)
			)
				problems.push(`${slug}: el texto difiere`);
			// La metadata: el .md descargado se lee igual que el del repo.
			const textKeys = Object.entries(
				/** @type {any} */ (coreTypes.get(CONTENT_CATEGORIES[category].type)).fields
			)
				.filter(([, f]) => ['text', 'datetime', 'url'].includes(/** @type {any} */ (f).kind))
				.map(([k]) => k);
			const norm = (/** @type {Record<string, unknown>} */ m) => normalizeMeta(m, { textKeys });
			const back = markdownToPost(category, slug, content);
			const fromRepo = CONTENT_CATEGORIES[category].map(
				slug,
				/** @type {any} */ (metas[path]),
				splitMarkdown(raws[path]).body
			);
			const diff = metaDiff(
				norm(CONTENT_CATEGORIES[category].toMeta(/** @type {any} */ (back))),
				norm(CONTENT_CATEGORIES[category].toMeta(/** @type {any} */ (fromRepo)))
			);
			if (diff.length) problems.push(`${slug}: difiere ${diff.join(', ')}`);
		}
		expect(problems).toEqual([]);
		// El interactivo vuelve a la forma del repo.
		const donde = String(byName.get('material/donde-y-como-golpear-un-cuerpo.md'));
		expect(donde).toContain('<DondeGolpearUnCuerpo />');
		expect(donde).not.toContain('<kv-');
	});
});
