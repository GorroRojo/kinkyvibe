/**
 * El texto (cuerpo) de un perfil guardado en la base → HTML seguro para la página pública.
 *
 * Reusa lo que ya existe:
 * - `renderPreviewHtml` (src/lib/utils/markdownPreview.js): el mismo markdown + GFM y los links
 *   `[[término]]` de la wiki que la vista previa del editor; saca los bloques `<script>`/`<style>`;
 * - `customRehype` (el mismo plugin que usa mdsvex): las menciones `@alguien` → link a su perfil;
 * - `rehypeAllowlist` (./sanitize.js): la lista corta de HTML, en el servidor.
 *
 * Las fichas viejas importan imágenes de su carpeta de medios con un bloque de mdsvex
 * (`<script>import foto from './media/<ficha>/5.webp'</script>` y después `src={foto}`): eso se
 * resuelve antes ({@link resolveMediaImports}) con las mismas URLs que usa el sitio hoy.
 */
import { rehype } from 'rehype';
import customRehype from '$lib/utils/customRehype.js';
import { renderPreviewHtml } from '$lib/utils/markdownPreview.js';
import { rehypeAllowlist } from './sanitize.js';

/** `import foto from './media/Drux/1.webp'` (también con `$lib/posts/amigues/media/...`). */
const IMPORT = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g;

/**
 * Reemplaza `{nombre}` por la URL de la imagen que el bloque de mdsvex importa con ese nombre.
 * Las expresiones que no son una imagen importada quedan como estaban (se ven como texto).
 *
 * @param {string} body
 * @param {(file: string) => string | undefined} resolveMedia nombre de archivo → URL
 * @returns {string}
 */
export function resolveMediaImports(body, resolveMedia) {
	/** @type {Map<string, string>} */
	const names = new Map();
	for (const block of body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
		for (const m of block[1].matchAll(IMPORT)) {
			const file = m[2].split('/').pop() ?? '';
			if (!/\/media\//.test(m[2])) continue;
			const url = resolveMedia(file);
			if (url) names.set(m[1], url);
		}
	}
	if (!names.size) return body;
	return body.replace(/\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (all, name) => names.get(name) ?? all);
}

/** El procesador (se arma una vez). */
const processor = rehype()
	.data('settings', { fragment: true })
	.use(rehypeAllowlist)
	.use(customRehype)
	.freeze();

/**
 * @param {string | undefined | null} body markdown (con el HTML corto que usan las fichas)
 * @param {{ resolveMedia?: (file: string) => string | undefined }} [opts]
 * @returns {Promise<string>} HTML limpio
 */
export async function renderProfileBody(body, { resolveMedia = () => undefined } = {}) {
	const text = String(body ?? '').trim();
	if (!text) return '';
	const html = renderPreviewHtml(resolveMediaImports(text, resolveMedia));
	return String(await processor.process(html));
}
