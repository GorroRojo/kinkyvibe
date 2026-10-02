/**
 * Lo que importa el panel: el archivo de etiquetas y los textos de la wiki de ESTE deploy (como
 * las fichas de amigues, `bundledAmigueFiles`). Usa Vite (import.meta.glob): solo para el Worker.
 */
import hardcodedTags from '$lib/utils/hardcodedTags.js';

const wikiRaw = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/wiki/*.md', { query: '?raw', import: 'default', eager: true })
);

/** @returns {{ rawTags: Record<string, unknown>[], wikiFiles: { name: string, raw: string }[] }} */
export function bundledTagSource() {
	return {
		// Copia sin las funciones que tagsFactory les agrega a las entradas.
		rawTags: JSON.parse(JSON.stringify(hardcodedTags)),
		wikiFiles: Object.entries(wikiRaw).map(([p, raw]) => ({
			name: p.slice(p.lastIndexOf('/') + 1, -3),
			raw
		}))
	};
}
