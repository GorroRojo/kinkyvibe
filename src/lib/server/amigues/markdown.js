/**
 * Un perfil de la base como ficha .md de amigues (la vuelta de `mdToProfile`, ./importer.js), con
 * la misma metadata y el mismo texto que las fichas del repo (`src/lib/posts/amigues/<ficha>.md`).
 *
 * Lo usan «Descargar todo» (src/lib/server/contenido/download.js) y el cliente del repo
 * (src/lib/server/contenido/fichas.js): lo que todavía trabaja con el texto de un .md (renombrar
 * etiquetas) lee y guarda el perfil en la base.
 *
 * Lo que un perfil tiene y las fichas del repo no (el tipo, todos los links, los datos de un lugar,
 * si un proyecto muestra sus integrantes) va con su propio nombre (`kind`, `links`, `area`…), y
 * `mdToProfile` lo vuelve a leer: importar un .md descargado deja el mismo perfil.
 *
 * Funciones puras. Solo imports relativos.
 */
import YAML from 'yaml';
import { asText as str, asTextList as strList } from '../../utils/text.js';
import { profileKindOf } from '../objects/types/perfil.js';

/** El orden de las claves (el de las fichas del repo y su plantilla `_profile_template.md`). */
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
	'force_unlisted',
	'force_unpublished',
	'pronoun',
	'link',
	'link_text',
	'logo',
	'photo',
	'email',
	'location',
	'tel',
	'job_title',
	'gender_identity',
	'bday'
];

/** Imágenes de la ficha vieja: un número de archivo se escribe como número (como en el repo). */
const IMAGE_KEYS = ['featured', 'logo', 'photo'];

/** Texto que pasa tal cual (mismo nombre en la ficha y en el perfil). */
const SAME_NAME = [
	'published_date',
	'updated_date',
	'link_text',
	'email',
	'tel',
	'job_title',
	'gender_identity',
	'bday'
];

/** Datos de un lugar que no tienen nombre en las fichas del repo. */
const VENUE_EXTRA = [
	'area',
	'city',
	'lat',
	'lng',
	'accessibility',
	'how_to_get_there',
	'venue_privacy'
];

/**
 * La metadata de la ficha de un perfil (lo que iría en su frontmatter).
 *
 * @param {Pick<import('../objects/read.js').StoredObject, 'title' | 'data' | 'visibility'>} object
 * @returns {Record<string, unknown>}
 */
export function profileToMeta(object) {
	const d = object.data ?? {};
	const kind = profileKindOf(d);
	/** @type {Record<string, unknown>} */
	const meta = {};
	for (const key of SAME_NAME) {
		const v = str(d[key]);
		if (v) meta[key] = v;
	}
	meta.title = object.title;
	meta.summary = str(d.bio);
	const tags = strList(d.tags);
	if (tags.length) meta.tags = tags;
	meta.layout = 'amigues';
	meta.category = 'amigues';
	const authors = strList(d.authors);
	if (authors.length) meta.authors = authors;
	for (const key of IMAGE_KEYS) {
		const v = str(d[key]);
		if (v) meta[key] = /^\d{1,9}$/.test(v) ? Number(v) : v;
	}
	if (d.unlisted === true) meta.force_unlisted = true;
	if (object.visibility === 'hidden') meta.force_unpublished = true;
	const pronoun = str(d.pronouns_url) || str(d.pronouns);
	if (pronoun) meta.pronoun = pronoun;
	const links = strList(d.links);
	if (links.length) meta.link = links[0];
	if (kind === 'lugar' && str(d.address)) meta.location = str(d.address);

	// Lo que las fichas del repo no tienen.
	/** @type {Record<string, unknown>} */
	const ordered = {};
	for (const key of KEY_ORDER) if (meta[key] !== undefined) ordered[key] = meta[key];
	ordered.kind = kind;
	if (links.length > 1) ordered.links = links;
	if (kind === 'proyecto' && typeof d.show_members === 'boolean') {
		ordered.show_members = d.show_members;
	}
	if (kind === 'lugar') {
		for (const key of VENUE_EXTRA) {
			if (d[key] !== undefined && d[key] !== '') ordered[key] = d[key];
		}
	}
	return ordered;
}

/**
 * El perfil como ficha .md: frontmatter y el texto de su página tal cual.
 *
 * @param {Pick<import('../objects/read.js').StoredObject, 'title' | 'data' | 'visibility'>} object
 * @returns {string}
 */
export function profileToMarkdown(object) {
	const frontmatter = YAML.stringify(profileToMeta(object), { lineWidth: 0 }).trimEnd();
	const body = String(object.data?.body ?? '').trimEnd();
	return `---\n${frontmatter}\n---\n${body ? `\n${body}\n` : ''}`;
}
