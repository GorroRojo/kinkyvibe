/**
 * Solo para pruebas (vitest; nunca lo importa la app): los textos reales de la semilla de
 * contenido (./*.json), para las pruebas que antes leían los .md de src/lib/posts (decisión 0032:
 * ya no están en el repo). Son contenido público: todo el material, las fichas de amigues, la
 * wiki y todos los eventos que se podían leer.
 */
import calendario from './calendario.json';
import material from './material.json';
import amigues from './amigues.json';
import wiki from './wiki.json';
import etiquetas from './etiquetas.json';

/** @typedef {{ legacySlug: string, raw: string, meta?: Record<string, any> | null }} SeedFile */

/** @type {Record<string, SeedFile[]>} */
const FILES = {
	calendario,
	material,
	amigues,
	wiki: wiki.map((w) => ({ legacySlug: w.name, raw: w.raw }))
};

/**
 * Las publicaciones de una categoría de la semilla (copia), ordenadas por dirección.
 * @param {'calendario' | 'material' | 'amigues' | 'wiki'} category
 * @returns {SeedFile[]}
 */
export function seedFiles(category) {
	return structuredClone(FILES[category] ?? []).sort((a, b) =>
		a.legacySlug.localeCompare(b.legacySlug)
	);
}

/**
 * El texto (el .md de antes) de una publicación de la semilla; tira si no está.
 * @param {'calendario' | 'material' | 'amigues' | 'wiki'} category
 * @param {string} slug
 */
export function seedRaw(category, slug) {
	const f = (FILES[category] ?? []).find((x) => x.legacySlug === slug);
	if (!f) throw new Error(`La semilla no tiene ${category}/${slug}`);
	return f.raw;
}

/**
 * Lo que daba `import.meta.glob('/src/lib/posts/<categoría>/*.md', { query: '?raw' })`: por ruta
 * vieja, el texto.
 * @param {'calendario' | 'material' | 'amigues' | 'wiki'} category
 * @returns {Record<string, string>}
 */
export function seedRawsByPath(category) {
	return Object.fromEntries(
		seedFiles(category).map((f) => [`/src/lib/posts/${category}/${f.legacySlug}.md`, f.raw])
	);
}

/**
 * Lo que daba `import.meta.glob('/src/lib/posts/<categoría>/*.md', { import: 'metadata' })` (la
 * metadata que daba mdsvex, guardada en la semilla para eventos, material y fichas de amigues).
 * @param {'calendario' | 'material' | 'amigues'} category
 * @returns {Record<string, Record<string, any>>}
 */
export function seedMetasByPath(category) {
	return Object.fromEntries(
		seedFiles(category).map((f) => [
			`/src/lib/posts/${category}/${f.legacySlug}.md`,
			/** @type {Record<string, any>} */ (f.meta ?? {})
		])
	);
}

/** El árbol de etiquetas de la semilla (el del viejo archivo de etiquetas), copia. */
export const seedTags = () => structuredClone(etiquetas);
