/**
 * Solo para pruebas (vitest; nunca lo importa la app): carga eventos y material inventados en la
 * base, con la importación de verdad, para las pruebas que antes los daban como .md (el sitio lee
 * los eventos y el material solo de la base).
 */
import { stringify } from 'yaml';
import { CONTENT_CATEGORIES } from './categories.js';
import { runImport } from './importer.js';

/**
 * @typedef {{ meta: Record<string, any>, body?: string } | Record<string, any>} SeedPost
 *   un post con la forma de un `ProcessedPost` (`{ meta }`) o su metadata directa; la categoría y
 *   la dirección salen de `meta.category` (o `layout`) y `meta.postID`
 */

/**
 * Importa los posts de eventos y material (lo de otras categorías se ignora). Tira si alguno no se
 * puede importar.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {SeedPost[]} posts
 * @param {{ now?: number }} [opts]
 */
export async function seedPosts(db, posts, { now = Date.now() } = {}) {
	/** @type {Record<string, import('./importer.js').SourceFile[]>} */
	const byCategory = {};
	for (const post of posts) {
		const source = /** @type {Record<string, any>} */ (post.meta ?? post);
		const category = String(source.category ?? source.layout ?? '');
		if (!Object.hasOwn(CONTENT_CATEGORIES, category)) continue;
		const { postID, ...rest } = source;
		const meta = JSON.parse(JSON.stringify({ category, layout: category, ...rest }));
		const body = typeof post.body === 'string' ? post.body : '';
		const raw = `---\n${stringify(meta)}---\n${body}`;
		(byCategory[category] ??= []).push({ legacySlug: String(postID), raw, meta });
	}
	for (const [category, files] of Object.entries(byCategory)) {
		const r = await runImport(db, category, files, { actor: 'prueba', now, limit: 10_000 });
		const bad = r.plan.filter((x) => x.action === 'invalid' || x.action === 'error');
		const failed = r.results.filter((x) => x.action === 'error');
		if (bad.length || failed.length) {
			throw new Error(
				`No se pudieron cargar: ${[...bad, ...failed]
					.map((x) => `${x.legacySlug} (${x.message ?? x.warnings.join('; ')})`)
					.join(', ')}`
			);
		}
	}
}
