/**
 * Las categorías de contenido que pasan a la base: de qué carpeta de .md salen, qué tipo de objeto
 * son y el mapa .md ↔ objeto de cada una. La wiki no está: sus textos pasan a ser el cuerpo de las
 * etiquetas (`etiqueta`, docs/etiquetas.md), en su propio camino.
 *
 * Solo imports relativos.
 */
import { EVENT_CATEGORY, EVENT_TYPE, eventToMeta, mdToEvent } from './eventos.js';
import { MATERIAL_CATEGORY, MATERIAL_TYPE, materialToMeta, mdToMaterial } from './material.js';

/**
 * @typedef {{
 *   category: string,
 *   type: string,
 *   label: string,
 *   map: (legacySlug: string, meta: Record<string, any>, body: string) => import('./eventos.js').MappedEvent,
 *   toMeta: (object: { title: string, data: Record<string, any>, visibility: string }) => Record<string, any>
 * }} ContentCategory
 */

/** @type {Record<string, ContentCategory>} */
export const CONTENT_CATEGORIES = {
	[EVENT_CATEGORY]: {
		category: EVENT_CATEGORY,
		type: EVENT_TYPE,
		label: 'eventos',
		map: mdToEvent,
		toMeta: /** @type {ContentCategory['toMeta']} */ (eventToMeta)
	},
	[MATERIAL_CATEGORY]: {
		category: MATERIAL_CATEGORY,
		type: MATERIAL_TYPE,
		label: 'material',
		map: mdToMaterial,
		toMeta: /** @type {ContentCategory['toMeta']} */ (materialToMeta)
	}
};

/** Las categorías, en el orden en que el sitio junta los .md (como `loadMarkdownPosts`). */
export const CATEGORY_LIST = Object.values(CONTENT_CATEGORIES);

/** @param {string} type */
export const categoryOfType = (type) => CATEGORY_LIST.find((c) => c.type === type) ?? null;
