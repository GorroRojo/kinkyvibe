/**
 * Material: del frontmatter de un .md de material a un objeto `material` y de vuelta. Es el mismo
 * patrón que los eventos (./eventos.js): funciones puras, el mapa único entre los dos mundos.
 *
 * Los posts que usan un componente interactivo de Svelte (`<HumanBody … />`) no se importan: en la
 * base no se puede correr código (decisión 0004: los interactivos son componentes registrados en
 * código, un paso aparte). Siguen saliendo de su .md.
 *
 * Solo imports relativos.
 */
import { asText, asTextList } from '../../utils/text.js';
import { freeHtmlNotes, normalizeBody } from './eventos.js';

/** @typedef {import('../objects/read.js').StoredObject} StoredObject */

export const MATERIAL_CATEGORY = 'material';
export const MATERIAL_TYPE = 'material';

const TEXT_KEYS = /** @type {const} */ ([
	'summary',
	'featured',
	'link',
	'link_text',
	'published_date',
	'updated_date',
	'original_published_date',
	'access_date'
]);

const MAPPED_KEYS = new Set([
	...TEXT_KEYS,
	'title',
	'tags',
	'authors',
	'force_unlisted',
	'force_unpublished',
	'redirect'
]);

/** @param {unknown} v */
const isTrue = (v) =>
	v === true || ['true', 'yes', '1', 'sí', 'si'].includes(asText(v).toLowerCase());

/** @param {unknown} v */
const isEmpty = (v) =>
	v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Un componente de Svelte en el texto (`<HumanBody`, `<DondeGolpearUnCuerpo />`). */
const COMPONENT = /<[A-Z][A-Za-z0-9]*[\s/>]/;

/**
 * Convierte la metadata de un post de material (la que da mdsvex) y su cuerpo en lo que se
 * guarda. Mapa: `title` → título; `force_unlisted: true` → `unlisted`; `force_unpublished: true` →
 * visibilidad oculta; `tags`, `authors` → listas; los campos de texto con el mismo nombre; el
 * cuerpo → `body`; lo demás → `extra`, tal cual.
 *
 * @param {string} legacySlug
 * @param {Record<string, unknown>} meta
 * @param {string} body
 * @returns {import('./eventos.js').MappedEvent}
 */
export function mdToMaterial(legacySlug, meta, body) {
	/** @type {string[]} */
	const warnings = [];
	/** @type {Record<string, unknown>} */
	const data = {};
	for (const key of TEXT_KEYS) {
		const value = asText(meta[key]);
		if (value) data[key] = value;
	}
	const tags = asTextList(meta.tags);
	if (tags.length) data.tags = tags;
	const authors = asTextList(meta.authors);
	if (authors.length) data.authors = authors;
	if (isTrue(meta.force_unlisted)) data.unlisted = true;
	if (isTrue(meta.redirect)) data.redirect = true;
	const text = normalizeBody(body);
	if (text) data.body = text;

	/** @type {Record<string, unknown>} */
	const extra = {};
	for (const [key, value] of Object.entries(meta)) {
		if (isEmpty(value) || MAPPED_KEYS.has(key)) continue;
		if ((key === 'layout' || key === 'category') && value === MATERIAL_CATEGORY) continue;
		extra[key] = value;
	}
	if (Object.keys(extra).length) data.extra = extra;

	return {
		legacySlug,
		title: asText(meta.title) || legacySlug,
		data,
		visibility: isTrue(meta.force_unpublished) ? 'hidden' : 'public',
		warnings,
		notes: freeHtmlNotes(text),
		...(COMPONENT.test(text)
			? {
					error:
						'Usa un componente interactivo: en la base todavía no se puede mostrar. Sigue saliendo de su .md.'
				}
			: {})
	};
}

/**
 * La metadata que esperan las páginas (la forma de los .md), armada desde un objeto `material`.
 *
 * @param {Pick<StoredObject, 'title' | 'data' | 'visibility'>} object
 * @returns {Record<string, any>}
 */
export function materialToMeta(object) {
	const d = object.data ?? {};
	/** @type {Record<string, any>} */
	const meta = {
		...(d.extra && typeof d.extra === 'object' ? d.extra : {}),
		title: object.title,
		summary: d.summary ?? '',
		tags: [...(d.tags ?? [])],
		layout: MATERIAL_CATEGORY,
		category: MATERIAL_CATEGORY,
		authors: [...(d.authors ?? [])]
	};
	for (const key of TEXT_KEYS) {
		if (key === 'summary') continue;
		if (d[key] !== undefined) meta[key] = d[key];
	}
	if (d.unlisted) meta.force_unlisted = true;
	if (d.redirect) meta.redirect = true;
	if (object.visibility === 'hidden') meta.force_unpublished = true;
	return meta;
}
