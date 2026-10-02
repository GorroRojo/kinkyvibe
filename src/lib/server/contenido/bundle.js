/**
 * Los .md de este deploy, como los pide la importación (src/lib/server/contenido/importer.js):
 * el texto (para el hash y el cuerpo) y la metadata que da mdsvex (la misma que usa el sitio, así
 * la importación lee el frontmatter exactamente igual que las páginas).
 *
 * Es la forma de importar en las bases remotas (preview o producción) desde el panel, sin tocar
 * la terminal, como `bundledAmigueFiles()` (src/lib/server/amigues/review.js).
 */

/** @type {Record<string, () => Promise<Record<string, any> | undefined>>} */
const eventMetas = import.meta.glob('/src/lib/posts/calendario/*.md', { import: 'metadata' });
/** @type {Record<string, () => Promise<string>>} */
const eventRaws = /** @type {any} */ (
	import.meta.glob('/src/lib/posts/calendario/*.md', { query: '?raw', import: 'default' })
);

/** @type {Record<string, () => Promise<Record<string, any> | undefined>>} */
const materialMetas = import.meta.glob('/src/lib/posts/material/*.md', { import: 'metadata' });
/** @type {Record<string, () => Promise<string>>} */
const materialRaws = /** @type {any} */ (
	import.meta.glob('/src/lib/posts/material/*.md', { query: '?raw', import: 'default' })
);

/** @type {Record<string, { metas: typeof eventMetas, raws: typeof eventRaws }>} */
const BY_CATEGORY = {
	calendario: { metas: eventMetas, raws: eventRaws },
	material: { metas: materialMetas, raws: materialRaws }
};

/**
 * @param {string} category
 * @returns {Promise<import('./importer.js').SourceFile[]>}
 */
export async function bundledSourceFiles(category) {
	const globs = BY_CATEGORY[category];
	if (!globs) return [];
	const out = [];
	for (const [path, loadRaw] of Object.entries(globs.raws)) {
		const legacySlug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
		/** @type {Record<string, any> | null} */
		let meta = null;
		try {
			meta = (await globs.metas[path]?.()) ?? null;
		} catch {
			meta = null;
		}
		out.push({ legacySlug, raw: await loadRaw(), meta });
	}
	return out;
}
