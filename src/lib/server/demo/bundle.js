/**
 * Los archivos del repo tal como están en este deploy, para las lecturas del modo demo (ver
 * ./client.js). Solo se importa desde un `if (PREVIEW_BUILD)`, así que no entra en el bundle de
 * producción.
 *
 * Los textos se cargan de a uno cuando se piden (import.meta.glob sin eager: cada post es un
 * chunk aparte del Worker). De las imágenes solo interesan las rutas (para listar carpetas).
 */

/** @type {Record<string, () => Promise<string>>} */
const texts = /** @type {any} */ (
	import.meta.glob('/src/lib/posts/**/*.md', { query: '?raw', import: 'default' })
);

const images = import.meta.glob(
	[
		'/src/lib/posts/*/media/**/*.{jpeg,jfif,jpg,png,webp,gif,svg,avif}',
		'/src/lib/assets/*.{jpeg,jfif,jpg,png,webp,gif,svg,avif}'
	],
	{ query: '?url', import: 'default', eager: true }
);

/** @param {string} key glob key ("/src/...") → repo path ("src/...") */
const repoPath = (key) => key.slice(1);

/** @type {import('./client.js').Bundle} */
export const bundle = {
	texts: Object.fromEntries(Object.entries(texts).map(([k, load]) => [repoPath(k), load])),
	files: new Set([...Object.keys(texts), ...Object.keys(images)].map(repoPath))
};
