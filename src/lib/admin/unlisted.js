/**
 * Filas de Contenido › No listadas: lo justo para la lista del panel (como la de Eventos), sin
 * mandarle al navegador las publicaciones enteras ni dibujar las tarjetas del sitio (con su botón
 * «Comprar entradas»).
 */
import { parseEventDate } from '$lib/utils/eventDraft.js';
import { contentAdminHref, eventPanelLink } from './nav.js';

/** Nombre de cada categoría en la fila. */
export const CATEGORY_LABELS = Object.freeze(
	/** @type {Record<string, string>} */ ({
		calendario: 'Evento',
		material: 'Material',
		amigues: 'Perfil',
		wiki: 'Wiki'
	})
);

/**
 * @typedef {{
 *   path: string,
 *   slug: string,
 *   category: string,
 *   categoryLabel: string,
 *   title: string,
 *   start: string,
 *   thumb: string,
 *   draft: boolean,
 *   editHref: string | null
 * }} UnlistedRow
 */

/**
 * @param {readonly Pick<ProcessedPost, 'path' | 'meta'>[]} posts las no listadas (`sitePosts`)
 * @returns {UnlistedRow[]}
 */
export function unlistedRows(posts) {
	return posts.map((p) => {
		const meta = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (p.meta ?? {}));
		const category = String(meta.category ?? '');
		const slug = String(meta.postID ?? p.path.split('/').pop() ?? '');
		const featured = meta.featured;
		return {
			path: p.path,
			slug,
			category,
			categoryLabel: CATEGORY_LABELS[category] ?? category,
			title: String(meta.title || slug),
			start: category === 'calendario' ? siteStart(meta.start) : '',
			// `featured` ya viene como URL (processPost); un número sin resolver no sirve.
			thumb: typeof featured === 'string' && /^(\/|https?:)/.test(featured) ? featured : '',
			draft: meta.borrador === true || meta.force_unpublished === true,
			editHref: panelHref(category, slug)
		};
	});
}

/**
 * El comienzo de un evento como lo escribe el sitio ("2026-12-12T20:00" o "2026-12-12"), también
 * si el frontmatter lo leyó como fecha. '' si no tiene.
 * @param {unknown} value
 */
function siteStart(value) {
	const v = value instanceof Date || typeof value === 'string' ? value : null;
	const { date, time } = parseEventDate(v);
	return date ? (time ? `${date}T${time}` : date) : '';
}

/**
 * Dónde se edita en el panel: los eventos en su ficha (como en Eventos), Material y Perfiles en su
 * sección de Contenido o Comunidad. `null` para lo que no tiene editor en el panel.
 * @param {string} category
 * @param {string} slug
 * @returns {string | null}
 */
function panelHref(category, slug) {
	if (!slug) return null;
	if (category === 'calendario') return eventPanelLink(slug);
	if (category === 'material' || category === 'amigues') {
		return `${contentAdminHref(category)}/${encodeURIComponent(slug)}`;
	}
	return null;
}
