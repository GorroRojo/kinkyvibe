/**
 * El cuerpo de una publicación guardada en la base → lo que muestra su página.
 *
 * Quién escribió el texto decide cómo se muestra (decisión 0004: «una lista corta de HTML para
 * todes; superadmins pueden usar HTML libre»). Se guarda con el texto, en `data.body_html`:
 *
 * - `'libre'`: lo importado de un .md del repo y lo que guarda une superadmin. Se muestra **igual
 *   que hoy**:
 *   - si el texto es el mismo que el del .md de este deploy, la página usa el componente que
 *     mdsvex compiló de ese .md (`component: true`): es exactamente lo de siempre, con sus estilos,
 *     sus imágenes y sus componentes;
 *   - si cambió (se editó en el panel), se arma con el mismo camino que mdsvex
 *     (./freeHtml.js): HTML libre (`<style>`, `<iframe>`, `<video>`…), comillas tipográficas,
 *     anclas, menciones, wiki e índice; los `<style>` propios se aplican solo dentro del texto.
 * - cualquier otro valor (o ninguno): la lista corta de HTML, limpia en el servidor
 *   (src/lib/server/amigues/sanitize.js, el único lugar que la decide).
 */
import { mediaURL } from '$lib/utils';
import { renderProfileBody } from '$lib/server/amigues/render.js';
import { splitMarkdown } from '$lib/server/amigues/importer.js';
import { normalizeBody } from './eventos.js';
import { renderFreeBody, scopeCss } from './freeHtml.js';

/** Clase del contenedor del texto con HTML libre: sus `<style>` se aplican solo adentro. */
export const FREE_BODY_CLASS = 'kv-texto-libre';

/** Los valores de `data.body_html`. */
export const BODY_HTML = /** @type {const} */ (['libre', 'corta']);

/**
 * Los archivos que no son imágenes de las carpetas de medios (PDF, video, documentos), que el
 * material enlaza con `<a href={guia}>`: misma URL que les da el build del .md.
 * @type {Record<string, string>}
 */
const fileURLs = import.meta.glob('/src/lib/posts/*/media/*/*.{pdf,mp4,webm,odt}', {
	eager: true,
	query: '?url',
	import: 'default'
});

/** El texto de los .md de este deploy (para saber si el de la base es el mismo). */
const bundledRaws = /** @type {Record<string, () => Promise<string>>} */ (
	import.meta.glob('/src/lib/posts/{calendario,material}/*.md', {
		query: '?raw',
		import: 'default'
	})
);

/**
 * URL de un archivo de la carpeta de medios de un post (imagen, PDF, video…), o `undefined`.
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
 * El cuerpo del .md `<categoría>/<nombre>.md` de este deploy, como lo guarda la importación, o
 * `null` si no existe.
 *
 * @param {string} category
 * @param {string} name
 * @returns {Promise<string | null>}
 */
export async function bundledBody(category, name) {
	const load = bundledRaws[`/src/lib/posts/${category}/${name}.md`];
	if (!load) return null;
	try {
		return normalizeBody(splitMarkdown(await load()).body);
	} catch {
		return null;
	}
}

/**
 * @typedef {{ html: string, css: string, component: boolean }} RenderedBody
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
	if (data?.body_html === 'libre') {
		if (body && (await bundledBody(category, folder)) === normalizeBody(body)) {
			return { html: '', css: '', component: true };
		}
		const { html, css } = await renderFreeBody(body, { resolveMedia, vars });
		return { html, css: scopeCss(css, `.${FREE_BODY_CLASS}`), component: false };
	}
	return { html: await renderProfileBody(body, { resolveMedia }), css: '', component: false };
}
