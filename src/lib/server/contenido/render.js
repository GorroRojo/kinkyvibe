/**
 * El cuerpo de una publicación guardada en la base → HTML seguro para la página pública.
 *
 * Es el mismo armado que los perfiles (src/lib/server/amigues/render.js): markdown + GFM, links
 * `[[término]]` de la wiki, menciones `@alguien`, las imágenes que el .md importaba de su carpeta
 * de medios y la limpieza con la lista corta de HTML (src/lib/server/amigues/sanitize.js, el
 * único lugar que decide qué HTML pasa).
 *
 * Diferencias con lo que muestra mdsvex para el mismo .md (las informa la importación): no corre
 * el código de mdsvex (`<script>`, componentes, `{expresiones}` que no son imágenes), no aplica
 * los `<style>` propios del post, no muestra `<iframe>` y no cambia comillas rectas por tipográficas.
 */
import { mediaURL } from '$lib/utils';
import { renderProfileBody } from '$lib/server/amigues/render.js';

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

/**
 * @param {string} category
 * @param {string} folder
 * @param {string} file
 */
function anyMediaURL(category, folder, file) {
	if (!/^[\w.-]+$/.test(file) || !/^[\w.-]+$/.test(folder)) return undefined;
	return (
		mediaURL(/** @type {any} */ (category), folder, file) ??
		fileURLs[`/src/lib/posts/${category}/media/${folder}/${file}`]
	);
}

/**
 * @param {string | undefined | null} body
 * @param {'calendario' | 'material' | 'wiki'} category
 * @param {string} folder la carpeta de medios del post (el nombre del .md: `legacy_slug`)
 * @returns {Promise<string>}
 */
export function renderContentBody(body, category, folder) {
	return renderProfileBody(body, {
		// Un post puede usar imágenes de la carpeta de otro (`./media/<otro>/1.webp`).
		resolveMedia: (file, path) =>
			anyMediaURL(category, /\/media\/([\w.-]+)\//.exec(path)?.[1] ?? folder, file)
	});
}
