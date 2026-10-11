/**
 * El cuerpo de una publicación guardada en la base → lo que muestra su página.
 *
 * Quién escribió el texto decide cómo se muestra (decisión 0004: «una lista corta de HTML para
 * todes; superadmins pueden usar HTML libre»). Se guarda con el texto, en `data.body_html`:
 *
 * - `'libre'`: lo que vino de los .md del repo y lo que guarda une superadmin. Se arma con el mismo
 *   camino que usaba mdsvex (./freeHtml.js): HTML libre (`<style>`, `<iframe>`, `<video>`…),
 *   comillas tipográficas, anclas, menciones, wiki e índice; los `<style>` propios se aplican solo
 *   dentro del texto. (Hasta la decisión 0032, un texto igual al de su .md se mostraba con el
 *   componente que mdsvex compilaba de ese .md; los .md ya no existen.)
 * - cualquier otro valor (o ninguno): la lista corta de HTML, limpia en el servidor
 *   (src/lib/server/amigues/sanitize.js, el único lugar que la decide).
 */
import { mediaURL } from '$lib/utils';
import { renderProfileBody } from '$lib/server/amigues/render.js';
import { renderFreeBody, scopeCss } from './freeHtml.js';
import { interactiveParts, markBody, unmark } from './interactive.js';

/** Clase del contenedor del texto con HTML libre: sus `<style>` se aplican solo adentro. */
export const FREE_BODY_CLASS = 'kv-texto-libre';

/** Los valores de `data.body_html`. */
export const BODY_HTML = /** @type {const} */ (['libre', 'corta']);

/**
 * Los archivos que no son imágenes de las carpetas de medios viejas (PDF, video, documentos), que
 * el material enlaza con `<a href={guia}>`. Todavía no están en la biblioteca: se sirven desde el
 * build, con la misma dirección de siempre.
 * @type {Record<string, string>}
 */
const fileURLs = import.meta.glob('/src/lib/posts/*/media/*/*.{pdf,mp4,webm,odt}', {
	eager: true,
	query: '?url',
	import: 'default'
});

/**
 * URL de un archivo de la carpeta de medios vieja de un post (imagen, PDF, video…), o `undefined`.
 * Las imágenes, su copia en la biblioteca ($lib/utils/legacyMedia.js); lo demás, el archivo del
 * build.
 *
 * @param {string} category
 * @param {string} folder
 * @param {string} file
 */
export function contentMediaURL(category, folder, file) {
	if (!/^[\w.-]+$/.test(file) || !/^[\w.-]+$/.test(folder)) return undefined;
	return (
		mediaURL(/** @type {any} */ (category), folder, file) ??
		fileURLs[`/src/lib/posts/${category}/media/${folder}/${file}`]
	);
}

/**
 * @typedef {{
 *   html: string,
 *   css: string,
 *   parts?: import('./interactive.js').Part[] | null
 * }} RenderedBody
 *   `parts`: solo si el texto tiene interactivos registrados (la página los muestra con
 *   $lib/components/ContentParts.svelte en lugar de `html`).
 */

/**
 * @param {{ body?: unknown, body_html?: unknown }} data los datos del objeto
 * @param {'calendario' | 'material' | 'wiki'} category
 * @param {string} folder la carpeta de medios del post (el nombre del .md: `legacy_slug`)
 * @param {{ vars?: Record<string, unknown> }} [opts] `vars`: la metadata del post (mdsvex deja usar
 *   sus campos en el texto, `{title}`)
 * @returns {Promise<RenderedBody>}
 */
export async function renderContentBody(data, category, folder, { vars = {} } = {}) {
	const body = String(data?.body ?? '');
	// Un post puede usar imágenes de la carpeta de otro (`./media/<otro>/1.webp`).
	/** @param {string} file @param {string} path */
	const resolveMedia = (file, path) =>
		contentMediaURL(category, /\/media\/([\w.-]+)\//.exec(path)?.[1] ?? folder, file);
	// Los interactivos registrados como marcas (y toda otra `<kv-…` escapada), ver ./interactive.js.
	const marked = markBody(body);
	if (data?.body_html === 'libre') {
		const { html, css } = await renderFreeBody(marked.text, { resolveMedia, vars });
		return withParts({ html, css: scopeCss(css, `.${FREE_BODY_CLASS}`) }, marked);
	}
	const html = await renderProfileBody(marked.text, { resolveMedia });
	return withParts({ html, css: '' }, marked);
}

/**
 * @param {RenderedBody} rendered
 * @param {import('./interactive.js').MarkedBody} marked
 * @returns {RenderedBody}
 */
function withParts(rendered, marked) {
	const parts = interactiveParts(rendered.html, marked);
	return { ...rendered, html: unmark(rendered.html, marked), ...(parts ? { parts } : {}) };
}
