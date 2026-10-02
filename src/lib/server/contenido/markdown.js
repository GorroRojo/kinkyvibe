/**
 * Un objeto de contenido (`evento`, `material`) como texto .md (frontmatter + cuerpo) y de vuelta.
 *
 * El editor del panel (y la agenda, importar la planilla, las etiquetas…) trabajan sobre el texto
 * de un .md. Con el interruptor `contenido_db` prendido, el texto de un post de la base se arma con
 * {@link postToMarkdown} y lo que el editor guarda se lee con {@link markdownToPost}: así esas
 * pantallas no cambian (ver ./repo.js).
 *
 * Funciones puras. Solo imports relativos.
 */
import { parse, stringify } from 'yaml';
import { CONTENT_CATEGORIES } from './categories.js';
import { EVENT_CATEGORY } from './eventos.js';

/** El orden de las claves (el de los .md de hoy, como las plantillas `_….md`). */
const KEY_ORDER = [
	'published_date',
	'updated_date',
	'title',
	'summary',
	'tags',
	'layout',
	'category',
	'authors',
	'featured',
	'logo',
	'force_unlisted',
	'force_unpublished',
	'status',
	'start',
	'end',
	'location',
	'location_name',
	'location_map',
	'link',
	'link_text',
	'redirect',
	'original_published_date',
	'access_date'
];

/** @param {string} category */
function categoryOf(category) {
	const cat = CONTENT_CATEGORIES[category];
	if (!cat) throw new Error(`Categoría que no está en la base: ${category}`);
	return cat;
}

/**
 * @param {string} category
 * @param {Pick<import('../objects/read.js').StoredObject, 'title' | 'data' | 'visibility'>} object
 * @returns {string}
 */
export function postToMarkdown(category, object) {
	const meta = categoryOf(category).toMeta(object);
	/** @type {Record<string, unknown>} */
	const ordered = {};
	for (const key of KEY_ORDER) if (meta[key] !== undefined) ordered[key] = meta[key];
	for (const [key, value] of Object.entries(meta)) if (!(key in ordered)) ordered[key] = value;
	const frontmatter = stringify(ordered, { lineWidth: 0 }).trimEnd();
	const body = String(object.data?.body ?? '');
	return `---\n${frontmatter}\n---\n${body ? `\n${body}\n` : ''}`;
}

/**
 * Separa frontmatter y cuerpo (el frontmatter entre la primera línea `---` y la siguiente).
 *
 * @param {string} raw
 */
function split(raw) {
	const text = String(raw ?? '').replace(/\r\n?/g, '\n');
	const m = text.match(/^---[ \t]*\n([\s\S]*?)\n?---[ \t]*(?:\n|$)([\s\S]*)$/);
	if (!m) throw new Error('El texto no empieza con un bloque de propiedades entre "---".');
	return { frontmatter: m[1], body: m[2] };
}

/**
 * Lee el texto de un post como lo guarda la base. Tira (en castellano) si el frontmatter no se
 * puede leer.
 *
 * @param {string} category
 * @param {string} legacySlug
 * @param {string} raw
 * @returns {import('./eventos.js').MappedEvent}
 */
export function markdownToPost(category, legacySlug, raw) {
	const cat = categoryOf(category);
	const { frontmatter, body } = split(raw);
	let meta;
	try {
		meta = parse(frontmatter) ?? {};
	} catch (e) {
		throw new Error(
			'Las propiedades tienen un error de formato: ' +
				String(/** @type {Error} */ (e).message).split('\n')[0]
		);
	}
	if (typeof meta !== 'object' || Array.isArray(meta)) {
		throw new Error('Las propiedades tienen que ser una lista de «clave: valor».');
	}
	// Como mdsvex: la metadata pasa por JSON (las fechas quedan como texto).
	return cat.map(legacySlug, JSON.parse(JSON.stringify(meta)), body);
}

/** @param {Parameters<typeof postToMarkdown>[1]} object */
export const eventToMarkdown = (object) => postToMarkdown(EVENT_CATEGORY, object);

/** @param {string} legacySlug @param {string} raw */
export const markdownToEvent = (legacySlug, raw) => markdownToPost(EVENT_CATEGORY, legacySlug, raw);
