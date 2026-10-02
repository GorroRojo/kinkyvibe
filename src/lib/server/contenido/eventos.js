/**
 * Eventos: del frontmatter de un .md de calendario a un objeto `evento` y de vuelta.
 *
 * Es el mapa único entre los dos mundos, en funciones puras (sin base ni SvelteKit):
 * - {@link mdToEvent}: lo que guarda la importación (src/lib/server/contenido/importer.js);
 * - {@link eventToMeta}: la «metadata» que las páginas esperan (la misma forma que da mdsvex), así
 *   las páginas, listas, el .ics y la búsqueda no cambian según de dónde venga el evento.
 *
 * La prueba de paridad (eventos.test.js, parity.test.js) verifica que
 * `eventToMeta(mdToEvent(meta)) ≈ meta` para cada evento real del repo (ver
 * {@link import('./parity.js').normalizeMeta} para qué cuenta como igual).
 *
 * Solo imports relativos.
 */
import { asText, asTextList } from '../../utils/text.js';
import evento from '../objects/types/evento.js';

/** @typedef {import('../objects/read.js').StoredObject} StoredObject */

export const EVENT_CATEGORY = 'calendario';
export const EVENT_TYPE = 'evento';

/** Campos de texto del tipo que se copian con el mismo nombre. */
const TEXT_KEYS = /** @type {const} */ ([
	'summary',
	'status',
	'start',
	'end',
	'link',
	'link_text',
	'featured',
	'logo',
	'location',
	'location_name',
	'location_map',
	'published_date',
	'updated_date'
]);

/** Claves del frontmatter que se traducen a otra cosa (no van a `extra`). */
const MAPPED_KEYS = new Set([
	...TEXT_KEYS,
	'title',
	'tags',
	'authors',
	'force_unlisted',
	'force_unpublished',
	'redirect',
	'layout',
	'category'
]);

/** @param {unknown} v */
const isTrue = (v) =>
	v === true || ['true', 'yes', '1', 'sí', 'si'].includes(asText(v).toLowerCase());

/** @param {unknown} v */
const isEmpty = (v) =>
	v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const DATETIME_PARTS = /^(\d{4})-(\d{2})-(\d{2})(T.*)$/;

/**
 * El mismo día y hora, un día después, con la misma zona escrita («…-17T01:00-03:00» →
 * «…-18T01:00-03:00»).
 *
 * @param {string} value
 */
export function nextDay(value) {
	const m = DATETIME_PARTS.exec(value);
	if (!m) return value;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
	return `${d.toISOString().slice(0, 10)}${m[4]}`;
}

/** Día (AAAA-MM-DD) en hora de Argentina (UTC-3, sin horario de verano). */
const argentinaDay = (/** @type {number} */ ms) =>
	new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * @typedef {{
 *   legacySlug: string,
 *   title: string,
 *   data: Record<string, unknown>,
 *   visibility: 'public' | 'hidden',
 *   warnings: string[],
 *   error?: string
 *   notes?: string[]
 * }} MappedEvent
 */

/**
 * Convierte la metadata de un evento (la que da mdsvex, tal como la usa el sitio) y su cuerpo en lo
 * que se guarda.
 *
 * Mapa: `title` → título; `force_unlisted: true` → `unlisted`; `force_unpublished: true` →
 * visibilidad oculta; `tags`, `authors` → listas; los campos de texto con el mismo nombre; el
 * cuerpo → `body`; todo lo demás (entradas, colores del carrusel…) → `extra`, tal cual.
 *
 * Un fin anterior al inicio el mismo día (una fiesta de 21 a 1) es el día siguiente, como lo lee
 * el sitio (`eventEnd` en src/lib/utils/dates.js): se guarda ya corregido, con un aviso.
 *
 * @param {string} legacySlug el nombre del archivo sin `.md`
 * @param {Record<string, unknown>} meta
 * @param {string} body el markdown después del frontmatter
 * @returns {MappedEvent}
 */
export function mdToEvent(legacySlug, meta, body) {
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
		if (isEmpty(value)) continue;
		if ((key === 'layout' || key === 'category') && value === EVENT_CATEGORY) continue;
		if (MAPPED_KEYS.has(key) && key !== 'layout' && key !== 'category') continue;
		extra[key] = value;
	}
	if (Object.keys(extra).length) data.extra = extra;

	const start = Date.parse(String(data.start ?? ''));
	const end = Date.parse(String(data.end ?? ''));
	if (!Number.isNaN(start) && !Number.isNaN(end) && end < start) {
		if (argentinaDay(start) === argentinaDay(end)) {
			data.end = nextDay(String(data.end));
			warnings.push(
				`termina antes de empezar el mismo día: se guarda que termina al día siguiente (${data.end})`
			);
		}
	}
	return {
		legacySlug,
		title: asText(meta.title) || legacySlug,
		data,
		visibility: isTrue(meta.force_unpublished) ? 'hidden' : 'public',
		warnings,
		notes: freeHtmlNotes(text)
	};
}

/**
 * Nota informativa (no es un problema) si el texto usa HTML fuera de la lista corta: se muestra
 * igual que hoy, porque lo importado del repo cuenta como HTML libre de superadmin (decisión 0004,
 * `body_html: 'libre'`, ver ./render.js).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function freeHtmlNotes(text) {
	const used = [
		[/<script[\s>]/i, '<script>'],
		[/<style[\s>]/i, '<style>'],
		[/<iframe[\s>]/i, '<iframe>'],
		[/<(video|audio)[\s>]/i, '<video>']
	]
		.filter(([re]) => /** @type {RegExp} */ (re).test(text))
		.map(([, name]) => name);
	return used.length ? [`usa HTML libre (${used.join(', ')}): se muestra igual que hoy`] : [];
}

/**
 * El cuerpo como se guarda: sin las líneas vacías del principio ni los espacios del final (igual
 * que las fichas de amigues).
 *
 * @param {string} body
 */
export function normalizeBody(body) {
	return String(body ?? '')
		.replace(/\r\n?/g, '\n')
		.replace(/^(?:[ \t]*\n)+/, '')
		.trimEnd();
}

/**
 * La metadata que esperan las páginas (la forma de los .md), armada desde un objeto `evento`.
 * `postID` y lo que depende del deploy (URLs de imágenes, etiquetas canónicas) lo agrega quien
 * arma el post (src/lib/server/contenido/posts.js), igual que con los .md.
 *
 * @param {Pick<StoredObject, 'title' | 'data' | 'visibility'>} object
 * @returns {Record<string, any>}
 */
export function eventToMeta(object) {
	const d = object.data ?? {};
	/** @type {Record<string, any>} */
	const meta = {
		...(d.extra && typeof d.extra === 'object' ? d.extra : {}),
		title: object.title,
		summary: d.summary ?? '',
		tags: [...(d.tags ?? [])],
		layout: EVENT_CATEGORY,
		category: EVENT_CATEGORY,
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

/** Los campos del tipo, para quien necesite saber sus clases (la comparación de paridad). */
export const EVENT_FIELDS = evento.fields;
