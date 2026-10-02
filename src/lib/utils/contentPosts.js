/**
 * Pure helpers for the panel's content editors (/admin/contenido/material, /admin/comunidad/perfiles): which
 * frontmatter fields each kind of post uses, slugs, building the file from the form and the
 * list rows. No Svelte / SvelteKit imports: runs in the browser, on the server and in vitest.
 *
 * The fields are the ones the existing posts actually use (see the templates
 * src/lib/posts/material/_post_template.md and src/lib/posts/amigues/_profile_template.md).
 * Saving only touches the keys that changed, so comments, key order and keys the form doesn't
 * know are kept (applyFrontmatterChanges).
 */
import { parseDocument } from 'yaml';
import { personasFromMd, personasToMd } from './personasList.js';
import {
	REMOVE,
	applyFrontmatterChanges,
	formatPostDate,
	isValidDate,
	joinMarkdown,
	splitMarkdown
} from './eventDraft.js';

/** Kinds of post these editors handle. */
export const CONTENT_CATEGORIES = Object.freeze(['material', 'amigues']);

/**
 * @typedef {object} ContentField
 * @prop {string} key frontmatter key
 * @prop {string} label
 * @prop {'text'|'textarea'|'url'|'email'|'tel'|'date'|'checkbox'} type
 * @prop {string} [placeholder]
 * @prop {string} [help]
 * @prop {boolean} [required]
 * @prop {boolean} [wide]
 * @prop {'contacto'} [section] fields shown in the collapsed "public contact data" section
 */

/** @type {ContentField[]} */
const COMMON = [
	{ key: 'title', label: 'Título', type: 'text', required: true, wide: true },
	{
		key: 'summary',
		label: 'Resumen corto',
		type: 'textarea',
		wide: true,
		placeholder: 'Aparece en las listas y cuando se comparte el link'
	},
	{ key: 'published_date', label: 'Publicado', type: 'date', required: true },
	{
		key: 'updated_date',
		label: 'Actualizado',
		type: 'date',
		help: 'Al editar se pone la fecha de hoy.'
	}
];

/** @type {ContentField} */
const UNLISTED = {
	key: 'force_unlisted',
	label: 'No listado (no aparece en las listas, se ve con el link)',
	type: 'checkbox',
	wide: true
};

/** @type {Record<string, ContentField[]>} */
export const CONTENT_FIELDS = Object.freeze({
	material: [
		...COMMON,
		{
			key: 'link',
			label: 'Link',
			type: 'url',
			placeholder: 'https://...',
			help: 'A la tienda, al descargable o al original.'
		},
		{
			key: 'link_text',
			label: 'Texto del botón del link',
			type: 'text',
			placeholder: 'Ir al sitio'
		},
		{
			key: 'redirect',
			label: 'Ir directo al link (la página redirecciona)',
			type: 'checkbox',
			wide: true
		},
		{ key: 'original_published_date', label: 'Fecha de publicación original', type: 'date' },
		{ key: 'access_date', label: 'Última fecha de acceso al link', type: 'date' },
		UNLISTED
	],
	amigues: [
		...COMMON,
		{
			key: 'pronoun',
			label: 'Pronombres',
			type: 'text',
			placeholder: 'https://pronombr.es/elle&el'
		},
		{ key: 'gender_identity', label: 'Género', type: 'text' },
		{ key: 'job_title', label: 'Qué hace', type: 'text', placeholder: 'Ej: Educadore BDSM' },
		{ key: 'link', label: 'Link', type: 'url', placeholder: 'https://instagram.com/...' },
		{ key: 'link_text', label: 'Texto del link', type: 'text' },
		// The same contact fields /edit/amigues/... already has. Everything here is PUBLIC.
		{ key: 'email', label: 'Mail', type: 'email', section: 'contacto' },
		{ key: 'tel', label: 'Teléfono', type: 'tel', section: 'contacto' },
		{ key: 'location', label: 'Dirección', type: 'text', section: 'contacto' },
		{ key: 'bday', label: 'Cumpleaños', type: 'date', section: 'contacto' },
		UNLISTED
	]
});

/** @param {string} category */
export function fieldsFor(category) {
	return CONTENT_FIELDS[category] ?? [];
}

/** Does the kind of post have an `authors:` list the editor shows? (profiles don't) */
export const hasAuthors = (/** @type {string} */ category) => category === 'material';

/* ------------------------------------------------------------------------------------------ */
/*  Slugs                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** @param {unknown} s */
const stripAccents = (s) =>
	String(s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');

/**
 * Suggested file name for a new post from its title. Material uses kebab-case like its posts
 * ("anatomia-de-un-spanking"); profiles use the handle style of amigues ("MiPiezaAccionGrafica").
 * @param {string} title
 * @param {string} category
 */
export function suggestContentSlug(title, category) {
	const clean = stripAccents(title).replace(/[¡!¿?"'`´]/g, '');
	if (category === 'amigues') {
		return clean
			.split(/[^A-Za-z0-9]+/)
			.filter(Boolean)
			.map((w) => w[0].toUpperCase() + w.slice(1))
			.join('')
			.slice(0, 60);
	}
	return clean
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80)
		.replace(/-+$/, '');
}

/**
 * Error message for a slug, or null if it's fine. `taken` = slugs of that category that exist.
 * Profiles keep the handle style (letters of any case, digits, `.`, `_`, `-`); material, lowercase
 * kebab-case. Comparison with taken slugs ignores case (macOS/Windows checkouts would clash).
 * @param {string} slug
 * @param {string} category
 * @param {Iterable<string>} [taken]
 */
export function validateContentSlug(slug, category, taken = []) {
	if (!slug) return 'Falta la dirección de la página.';
	if (slug.length > 80) return 'La dirección es demasiado larga (máximo 80 caracteres).';
	if (slug.startsWith('_')) return 'La dirección no puede empezar con «_» (son las plantillas).';
	if (category === 'amigues') {
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) || slug.includes('..'))
			return 'La dirección solo puede tener letras sin tildes, números, puntos, guiones y guiones bajos (sin espacios).';
	} else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		return 'La dirección solo puede tener letras minúsculas sin tildes, números y guiones (sin espacios ni guiones al principio o al final).';
	}
	const lower = slug.toLowerCase();
	for (const t of taken) {
		if (String(t).toLowerCase() === lower)
			return `Ya existe una publicación con la dirección «${t}». Elegí otra.`;
	}
	return null;
}

/**
 * `slug` if free, else `slug-2`, `slug-3`… (profiles: `Slug2`, `Slug3`…).
 * @param {string} slug
 * @param {string} category
 * @param {Iterable<string>} taken
 */
export function freeContentSlug(slug, category, taken) {
	const set = new Set([...taken].map((t) => String(t).toLowerCase()));
	if (!set.has(slug.toLowerCase())) return slug;
	for (let n = 2; n < 1000; n++) {
		const next = category === 'amigues' ? `${slug}${n}` : `${slug}-${n}`;
		if (!set.has(next.toLowerCase())) return next;
	}
	return slug;
}

/* ------------------------------------------------------------------------------------------ */
/*  Form <-> file                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** @param {any} v @returns {string[]} */
const list = (v) =>
	Array.isArray(v) ? v.filter((x) => x !== null && x !== '').map(String) : v ? [String(v)] : [];

/**
 * @typedef {object} ContentForm
 * @prop {Record<string, any>} values one per field of the category (string, or boolean for checkboxes)
 * @prop {string[]} tags
 * @prop {string[]} authors
 * @prop {import('./personasList.js').MdPersona[]} [personas] `personas:` (people with another
 *   role; see ./personasList.js). Written only if it changed.
 * @prop {string} body
 * @prop {string} featured current `featured` value ('' = none)
 */

/**
 * Value of a frontmatter field as the form shows it.
 * @param {ContentField} f
 * @param {any} v
 * @returns {string|boolean}
 */
export function toInputValue(f, v) {
	if (f.type === 'checkbox') return v === true;
	if (v === undefined || v === null) return '';
	if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
	if (f.type === 'date') return String(v).slice(0, 10);
	return String(v);
}

/**
 * Value to write for a form field (null = comment the key out, like /edit does).
 * @param {ContentField} f
 * @param {string|boolean} v
 * @returns {any}
 */
export function fromInputValue(f, v) {
	if (f.type === 'checkbox') return v ? true : null;
	if (v === '' || v === undefined || v === null || v === false) return null;
	const s = String(v).trim();
	if (!s) return null;
	if (f.type === 'date') {
		if (f.key === 'bday') return s; // written as a plain date, like the existing profiles
		return isValidDate(s) ? formatPostDate(s) : s;
	}
	if (f.type === 'textarea') return s.replace(/\s*\n\s*/g, ' ');
	return s;
}

/**
 * Reads a post into the form. Throws (in Spanish) when the frontmatter can't be read.
 * @param {string} category
 * @param {string} raw
 * @returns {ContentForm}
 */
export function readContentForm(category, raw) {
	const { frontmatter, body } = splitMarkdown(raw);
	const doc = parseDocument(frontmatter);
	if (doc.errors.length) {
		throw new Error('Las propiedades tienen un error de formato: ' + doc.errors[0].message);
	}
	/** @type {Record<string, any>} */
	const meta = doc.toJS() ?? {};
	/** @type {Record<string, string|boolean>} */
	const values = {};
	for (const f of fieldsFor(category)) values[f.key] = toInputValue(f, meta[f.key]);
	return {
		values,
		tags: list(meta.tags),
		authors: list(meta.authors).filter((a) => a.trim()),
		personas: hasAuthors(category)
			? personasToMd(personasFromMd([], meta.personas, category), category).personas
			: [],
		body,
		featured: meta.featured === undefined || meta.featured === null ? '' : String(meta.featured)
	};
}

/**
 * Builds the file for the form, starting from `baseRaw` (the file being edited, the post being
 * duplicated or the template). Only keys that differ from `initial` are written, so a save
 * without changes gives back the same text (except `updated_date`, see opts).
 * @param {string} category
 * @param {string} baseRaw
 * @param {ContentForm} initial the form as read from baseRaw
 * @param {ContentForm} form
 * @param {{featured?: string|number|null, touchUpdated?: string, forceKeys?: string[]}} [opts]
 *   featured: new `featured` to write (null = comment it out); touchUpdated: YYYY-MM-DD to set as `updated_date`;
 *   forceKeys: fields to write even if unchanged (e.g. a new post's published_date)
 */
export function buildContentMarkdown(category, baseRaw, initial, form, opts = {}) {
	const { frontmatter } = splitMarkdown(baseRaw);
	/** @type {Record<string, any>} */
	const changes = {};
	const force = new Set(opts.forceKeys ?? []);
	for (const f of fieldsFor(category)) {
		const now = form.values[f.key];
		if (now !== initial.values[f.key] || force.has(f.key)) changes[f.key] = fromInputValue(f, now);
	}
	if (opts.touchUpdated && isValidDate(opts.touchUpdated))
		changes.updated_date = formatPostDate(opts.touchUpdated);
	const tags = form.tags.map((t) => t.trim()).filter(Boolean);
	if (tags.join('\n') !== initial.tags.join('\n') || force.has('tags')) changes.tags = tags;
	if (hasAuthors(category)) {
		const authors = form.authors.map((a) => a.trim()).filter(Boolean);
		if (authors.join('\n') !== initial.authors.join('\n') || force.has('authors'))
			changes.authors = authors.length ? authors : REMOVE;
		const before = initial.personas ?? [];
		const now = form.personas ?? before;
		if (JSON.stringify(now) !== JSON.stringify(before))
			changes.personas = now.length ? now : REMOVE;
	}
	if (opts.featured === null) {
		if (initial.featured) changes.featured = null; // e.g. a copy: the image is the original's
	} else if (opts.featured !== undefined && opts.featured !== '') {
		changes.featured = /^\d+$/.test(String(opts.featured))
			? Number(opts.featured)
			: String(opts.featured);
	}
	return joinMarkdown(applyFrontmatterChanges(frontmatter, changes), form.body);
}

/**
 * Problems that block saving, in Spanish.
 * @param {string} category
 * @param {ContentForm} form
 */
export function contentProblems(category, form) {
	/** @type {string[]} */
	const out = [];
	for (const f of fieldsFor(category)) {
		const v = form.values[f.key];
		if (f.required && (v === '' || v === undefined || v === false)) out.push(`Falta «${f.label}».`);
		if (f.type === 'date' && typeof v === 'string' && v && !isValidDate(v))
			out.push(`«${f.label}» no es una fecha válida.`);
		if (f.type === 'url' && typeof v === 'string' && v.trim() && !/^https?:\/\/\S+$/.test(v.trim()))
			out.push(`«${f.label}» tiene que empezar con https://`);
		if (f.type === 'email' && typeof v === 'string' && v.trim() && !/^\S+@\S+\.\S+$/.test(v.trim()))
			out.push(`«${f.label}» no parece un mail.`);
	}
	if (!form.tags.filter((t) => t.trim()).length) out.push('Poné al menos una etiqueta.');
	// The material page lists its authors (and needs the list): every material post has one.
	if (hasAuthors(category) && !form.authors.filter((x) => x.trim()).length)
		out.push('Poné al menos une autore.');
	if (
		category === 'material' &&
		form.values.redirect === true &&
		!String(form.values.link ?? '').trim()
	)
		out.push('Para ir directo al link hace falta el link.');
	return out;
}

/**
 * The form for a copy of a post: same content, title marked as a copy, published today, not
 * updated, and without its image (images live in the original's media folder).
 * @param {string} category
 * @param {ContentForm} form
 * @param {string} today YYYY-MM-DD
 * @returns {ContentForm}
 */
export function duplicateContentForm(category, form, today) {
	const values = { ...form.values };
	values.title = `${values.title || ''} (copia)`.trim();
	if ('published_date' in values) values.published_date = today;
	if ('updated_date' in values) values.updated_date = '';
	if (category === 'amigues') {
		// Never carry someone's contact data into another profile.
		for (const f of fieldsFor(category)) if (f.section === 'contacto') values[f.key] = '';
	}
	return { ...form, values, featured: '' };
}

/**
 * Turns `force_unlisted` on or off in a post changing only that line, so the commit is one line
 * (`force_unlisted: true` <-> `#force_unlisted: true`). A post without the key gets it before the
 * closing `---`.
 * @param {string} raw
 * @param {boolean} unlisted
 */
export function setUnlistedFlag(raw, unlisted) {
	splitMarkdown(raw); // throws a readable error when there is no frontmatter
	const lines = raw.split(/(?<=\n)/);
	const end = lines.findIndex((l, i) => i > 0 && /^---[ \t]*(\r?\n)?$/.test(l));
	const re = /^(#[ \t]*)?force_unlisted:[ \t]*([^#\r\n]*?)([ \t]+#[^\r\n]*)?[ \t]*(\r?\n)?$/;
	let active = -1;
	let commented = -1;
	for (let i = 1; i < end; i++) {
		const m = re.exec(lines[i]);
		if (!m) continue;
		if (m[1] === undefined) active = i;
		else if (commented === -1) commented = i;
	}
	const eol = /\r\n$/.test(lines[0]) ? '\r\n' : '\n';
	if (unlisted) {
		if (active !== -1) {
			const m = /** @type {RegExpExecArray} */ (re.exec(lines[active]));
			if (m[2].trim() === 'true') return raw;
			lines[active] = `force_unlisted: true${m[3] ?? ''}${m[4] ?? ''}`;
		} else if (commented !== -1) {
			const m = /** @type {RegExpExecArray} */ (re.exec(lines[commented]));
			lines[commented] = `force_unlisted: true${m[3] ?? ''}${m[4] ?? ''}`;
		} else {
			lines.splice(end, 0, `force_unlisted: true${eol}`);
		}
	} else if (active !== -1) {
		lines[active] = '#' + lines[active];
	}
	return lines.join('');
}

/* ------------------------------------------------------------------------------------------ */
/*  List                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} ContentRow
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} summary
 * @prop {string[]} tags
 * @prop {string[]} authors
 * @prop {string} published YYYY-MM-DD or ''
 * @prop {string} updated YYYY-MM-DD or ''
 * @prop {boolean} unlisted
 * @prop {boolean} unpublished
 * @prop {string} link
 * @prop {string} [thumb]
 */

/** @param {any} v */
function dateOnly(v) {
	if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
	const m = String(v ?? '').match(/^\d{4}-\d{2}-\d{2}/);
	return m ? m[0] : '';
}

/**
 * One row of the list from a post's metadata.
 * @param {string} slug
 * @param {any} meta
 * @param {string} [thumb]
 * @returns {ContentRow}
 */
export function contentRow(slug, meta, thumb) {
	return {
		slug,
		title: String(meta?.title ?? slug),
		summary: String(meta?.summary ?? ''),
		tags: list(meta?.tags),
		authors: list(meta?.authors).filter((a) => a.trim()),
		published: dateOnly(meta?.published_date),
		updated: dateOnly(meta?.updated_date),
		unlisted: meta?.force_unlisted === true,
		unpublished: meta?.force_unpublished === true,
		link: typeof meta?.link === 'string' ? meta.link : '',
		...(thumb ? { thumb } : {})
	};
}

/** @param {unknown} s */
const norm = (s) => stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Filters the list: free text (title, slug, summary, authors, tags; accents don't matter),
 * tags (all must be present, compared by canonical id through `canon`) and a state.
 * @param {ContentRow[]} rows
 * @param {{q?: string, tags?: string[], state?: ''|'listadas'|'no-listadas'|'sin-imagen', canon?: (t: string) => string}} f
 */
export function filterContentRows(rows, { q = '', tags = [], state = '', canon = (t) => t } = {}) {
	const words = norm(q).split(' ').filter(Boolean);
	const wanted = tags.map(canon);
	return rows.filter((r) => {
		if (state === 'listadas' && (r.unlisted || r.unpublished)) return false;
		if (state === 'no-listadas' && !r.unlisted && !r.unpublished) return false;
		if (state === 'sin-imagen' && r.thumb) return false;
		if (wanted.length) {
			const have = new Set(r.tags.map(canon));
			if (!wanted.every((t) => have.has(t))) return false;
		}
		if (words.length) {
			const hay = norm([r.title, r.slug, r.summary, ...r.authors, ...r.tags].join(' '));
			if (!words.every((w) => hay.includes(w))) return false;
		}
		return true;
	});
}

/**
 * Most used tags of a list (canonical), for the filter chips.
 * @param {ContentRow[]} rows
 * @param {(t: string) => string} [canon]
 * @param {number} [limit]
 */
export function topTags(rows, canon = (t) => t, limit = 14) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const r of rows)
		for (const t of new Set(r.tags.map(canon))) counts.set(t, (counts.get(t) ?? 0) + 1);
	return [...counts]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
		.slice(0, limit)
		.map(([id, count]) => ({ id, count }));
}

/* ------------------------------------------------------------------------------------------ */
/*  Quick tag chips                                                                            */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} QuickTagGroup
 * @prop {string} label
 * @prop {string[]} tags canonical ids
 * @prop {boolean} single only one of the group at a time
 */

/**
 * The "lo básico" rows of chips above the tag picker, from the tag tree (so a new city or
 * format added in hardcodedTags.js shows up here).
 * @param {string} category
 * @param {{get: (id: string) => any}} tm the tag manager (siteTags())
 * @returns {QuickTagGroup[]}
 */
export function quickTagGroups(category, tm) {
	/** @param {string} id @returns {string[]} */
	const kids = (id) => tm.get(id)?.children ?? [];
	const groups =
		category === 'material'
			? [
					{ label: 'Idioma', tags: kids('idioma'), single: true },
					{ label: 'Precio', tags: kids('precio'), single: true },
					{ label: 'Tipo', tags: kids('tipo de material'), single: false },
					{ label: 'Formato', tags: kids('formato de material'), single: false },
					{ label: 'De KinkyVibe', tags: ['KinkyVibe'], single: false }
				]
			: [
					{ label: 'Idioma', tags: kids('idioma'), single: false },
					{ label: 'Tipo de perfil', tags: kids('tipo de perfil'), single: true },
					{ label: 'Servicio', tags: kids('servicio'), single: false },
					{
						label: 'Dónde',
						tags: [
							'Online',
							...kids('Argentina'),
							...kids('Presencial').filter((t) => t !== 'Argentina')
						],
						single: false
					}
				];
	return groups.filter((g) => g.tags.length);
}

/**
 * Turns a quick chip on or off. In a `single` group, turning one on turns the others off.
 * Tags are compared by canonical id (`canon`), so "espanol" counts as "español".
 * @param {string[]} tags as written
 * @param {string} tag canonical id of the chip
 * @param {QuickTagGroup} group
 * @param {(t: string) => string} [canon]
 */
export function toggleQuickTag(tags, tag, group, canon = (t) => t) {
	const has = tags.some((t) => canon(t) === tag);
	if (has) return tags.filter((t) => canon(t) !== tag);
	const rest = group.single ? tags.filter((t) => !group.tags.includes(canon(t))) : tags;
	return [...rest, tag];
}
