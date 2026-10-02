/**
 * Un objeto `evento` como texto .md (frontmatter + cuerpo) y de vuelta.
 *
 * El editor del panel (y la agenda, importar la planilla, las etiquetas…) trabajan sobre el texto
 * de un .md. Con el interruptor `contenido_db` prendido, el texto de un evento de la base se arma
 * con {@link eventToMarkdown} y lo que el editor guarda se lee con {@link markdownToEvent}: así
 * esas pantallas no cambian (ver ./repo.js).
 *
 * Funciones puras. Solo imports relativos.
 */
import { parse, stringify } from 'yaml';
import { eventToMeta, mdToEvent } from './eventos.js';

/** El orden de las claves (el de los .md de hoy, src/lib/posts/calendario/_event_template.md). */
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
	'redirect'
];

/**
 * @param {Pick<import('../objects/read.js').StoredObject, 'title' | 'data' | 'visibility'>} object
 * @returns {string}
 */
export function eventToMarkdown(object) {
	const meta = eventToMeta(object);
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
 * Lee el texto de un evento como lo guarda la base. Tira (en castellano) si el frontmatter no se
 * puede leer.
 *
 * @param {string} legacySlug
 * @param {string} raw
 * @returns {import('./eventos.js').MappedEvent}
 */
export function markdownToEvent(legacySlug, raw) {
	const { frontmatter, body } = split(raw);
	let meta;
	try {
		meta = parse(frontmatter) ?? {};
	} catch (e) {
		throw new Error(
			'Las propiedades del evento tienen un error de formato: ' +
				String(/** @type {Error} */ (e).message).split('\n')[0]
		);
	}
	if (typeof meta !== 'object' || Array.isArray(meta)) {
		throw new Error('Las propiedades del evento tienen que ser una lista de «clave: valor».');
	}
	// Como mdsvex: la metadata pasa por JSON (las fechas quedan como texto).
	return mdToEvent(legacySlug, JSON.parse(JSON.stringify(meta)), body);
}
