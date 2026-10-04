/**
 * Material: del frontmatter de un .md de material a un objeto `material` y de vuelta. Es el mismo
 * patrón que los eventos (./eventos.js): funciones puras, el mapa único entre los dos mundos.
 *
 * Los interactivos (decisión 0004) se guardan como etiquetas del registro
 * (`<kv-donde-golpear-un-cuerpo></kv-donde-golpear-un-cuerpo>`, ../../utils/interactivos.js): la
 * forma de los .md (el componente importado en su `<script>`) se convierte al importar. Un post
 * que usa un componente de Svelte que no está registrado no se importa (en la base no se puede
 * correr código).
 *
 * Solo imports relativos.
 */
import { asText, asTextList } from '../../utils/text.js';
import {
	hasPersonaItems,
	personasForData,
	personasFromData,
	personasToMd
} from '../../utils/personasList.js';
import { toRegisteredTags } from '../../utils/interactivos.js';
import { freeHtmlNotes, normalizeBody } from './eventos.js';
import { stripHtmlComments } from '../../utils/htmlStrip.js';

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
	'personas',
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
 * ¿El texto usa un componente de Svelte que no es un interactivo registrado? Lo que está dentro
 * de un comentario HTML no cuenta (no se muestra: `juego-de-peleas` tiene uno comentado).
 * @param {string} text el texto ya con las etiquetas del registro
 */
export function usesUnregisteredComponent(text) {
	return COMPONENT.test(stripHtmlComments(text));
}

/**
 * Convierte la metadata de un post de material (la que da mdsvex) y su cuerpo en lo que se
 * guarda. Mapa: `title` → título; `force_unlisted: true` → `unlisted`; `force_unpublished: true` →
 * visibilidad oculta; `tags` → lista; `authors` y `personas` → la lista única `personas`
 * (`[{ profile?, name?, role }]`, ../../utils/personasList.js); los campos de texto con el mismo nombre; el
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
	// Quienes organizan o escriben (`authors:`) y las demás personas (`personas:`), en una sola
	// lista (../../utils/personasList.js).
	const people = personasForData(asTextList(meta.authors), meta.personas, MATERIAL_CATEGORY);
	if (people.items.length) data.personas = people.items;
	warnings.push(...people.warnings);
	if (isTrue(meta.force_unlisted)) data.unlisted = true;
	if (isTrue(meta.redirect)) data.redirect = true;
	const text = normalizeBody(toRegisteredTags(body));
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
		...(usesUnregisteredComponent(text)
			? {
					error:
						'Usa un componente de Svelte que no es un interactivo registrado: en la base no se puede mostrar (ver src/lib/utils/interactivos.js).'
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
	// La lista única vuelve a `authors` y `personas`, como los .md. Lo guardado con la forma de
	// antes (`authors` + `extra.personas`) ya está arriba, tal cual.
	if (hasPersonaItems(d)) {
		const md = personasToMd(personasFromData(d, MATERIAL_CATEGORY), MATERIAL_CATEGORY);
		meta.authors = md.authors;
		if (md.personas.length) meta.personas = md.personas;
	}
	return meta;
}
