/**
 * Solo para pruebas (vitest; nunca lo importa la app): carga eventos y material inventados en la
 * base, con la importación de verdad, para las pruebas que antes los daban como .md (el sitio lee
 * los eventos y el material solo de la base).
 */
import { parse, stringify } from 'yaml';
import { CONTENT_CATEGORIES } from './categories.js';
import { runImport } from './importer.js';
import { splitMarkdown } from '../amigues/importer.js';

/** Los .md inventados de ./fixtures, como texto. */
const fixtureRaws = /** @type {Record<string, string>} */ (
	import.meta.glob('./fixtures/*/*.md', { query: '?raw', import: 'default', eager: true })
);

/**
 * La metadata del frontmatter de un .md (YAML), o `null` si no se puede leer (como hacía mdsvex,
 * que daba `metadata` vacía y el sitio no lo mostraba).
 *
 * @param {string} raw
 * @returns {Record<string, any> | null}
 */
export function frontmatterMeta(raw) {
	try {
		const { frontmatter } = splitMarkdown(raw);
		if (!frontmatter.trim()) return null;
		const meta = parse(frontmatter);
		return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : null;
	} catch {
		return null;
	}
}

/**
 * Lo que daba `import.meta.glob(…, { import: 'metadata' })` de mdsvex sobre unos .md (ya no hay
 * mdsvex): por ruta, la metadata del frontmatter, o `undefined` si no se puede leer.
 *
 * @param {Record<string, string>} raws por ruta, el texto (`import.meta.glob(…, { query: '?raw' })`)
 * @returns {Record<string, Record<string, any> | undefined>}
 */
export function metasOf(raws) {
	return Object.fromEntries(
		Object.entries(raws).map(([path, raw]) => [path, frontmatterMeta(raw) ?? undefined])
	);
}

/**
 * Los .md inventados de ./fixtures/<categoría>, como los pide la importación (`legacySlug`, texto y
 * metadata), ordenados.
 *
 * @param {string} category
 * @returns {import('./importer.js').SourceFile[]}
 */
export function fixtureFiles(category) {
	return Object.keys(fixtureRaws)
		.filter((path) => path.split('/').slice(-2)[0] === category)
		.sort()
		.map((path) => ({
			legacySlug: /** @type {string} */ (path.split('/').pop()).replace(/\.md$/, ''),
			raw: fixtureRaws[path],
			meta: frontmatterMeta(fixtureRaws[path])
		}));
}

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
