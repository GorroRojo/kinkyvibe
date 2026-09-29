/**
 * Pure helpers for the admin "cargar evento" page (src/routes/(authed)/admin/eventos).
 *
 * Nothing in here touches the network, the filesystem or SvelteKit, so it runs the same in the
 * browser (live preview), on the server (validation before committing) and in vitest.
 */
import { parseDocument, isScalar, isSeq, Scalar } from 'yaml';

/** Argentina's UTC offset. The site writes every event date with it. */
export const AR_OFFSET = '-03:00';

/** Pass as a value to `applyFrontmatterChanges` to delete a key entirely (instead of commenting it out). */
export const REMOVE = Symbol('remove');

/** Max size for an uploaded featured image, in bytes. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const STATUS_OPTIONS = [
	{ value: 'anunciado', label: 'Anunciado', help: 'Todavía no abrió la inscripción (el link queda oculto)' },
	{ value: 'abierto', label: 'Abierto', help: 'Se puede inscribir / comprar entrada' },
	{ value: 'agotadas', label: 'Agotadas', help: 'No quedan lugares' },
	{ value: 'cancelado', label: 'Cancelado', help: 'El evento no se hace' }
];

/**
 * Starting point for "crear desde cero": the calendario part of src/lib/posts/_template.md,
 * laid out the way recent events are written (see e.g. punto-fijo-2026-09.md).
 */
export const NEW_EVENT_TEMPLATE = `---
published_date: 2023-05-16Z-03:00
#updated_date: 2023-05-16Z-03:00
title: Nombre del evento
summary: 'Un resumen corto: aparece en las listas de eventos y cuando se comparte el link'
tags:
  - español
  - KinkyVibe # etiqueta especial #
  - pago # pago | gratis | a la gorra #
  - AMBA # online | AMBA | Córdoba | Santa Cruz #
layout: calendario
category: calendario
authors:
  - KinkyVibe
# Quiénes organizan el evento
#featured: 1
# (opcional) ID de la imagen que aparece de miniatura en las listas y previews de links
#logo: 2
#force_unlisted: false
#force_unpublished: false
status: anunciado # anunciado | abierto | agotadas | cancelado #
start: 2023-06-02T20:00-03:00
end: 2023-06-02T23:00-03:00
# Fecha y hora en la que comienza y termina el evento
# formato: YYYY-MM-DDThh:mm-03:00
# !!  IMPORTANTE LA 'T' Y EL -03:00  !!
#location: Thames 240, Ciudad Autónoma de Buenos Aires
# Ubicación física donde sucede. si no está se asume online
#location_name: Nombre del lugar
#link: https://forms.gle/elmejoreventodelmundo
#link_text: Inscribirme
# Un link de acción en el evento, para inscribirse o para ir algun post original
---
`;

/* ------------------------------------------------------------------------------------------ */
/*  Markdown / frontmatter                                                                     */
/* ------------------------------------------------------------------------------------------ */

/**
 * Splits a post into its YAML frontmatter and its markdown body. Normalizes CRLF to LF.
 * @param {string} raw
 * @returns {{frontmatter: string, body: string}}
 */
export function splitMarkdown(raw) {
	const text = String(raw ?? '').replace(/\r\n?/g, '\n');
	const m = text.match(/^---[ \t]*\n([\s\S]*?)\n?---[ \t]*(?:\n|$)([\s\S]*)$/);
	if (!m) throw new Error('El archivo no empieza con un bloque de propiedades entre "---".');
	return { frontmatter: m[1], body: m[2] };
}

/**
 * @param {string} frontmatter
 * @param {string} body
 */
export function joinMarkdown(frontmatter, body) {
	return `---\n${frontmatter.replace(/\s+$/, '')}\n---\n${body ?? ''}`;
}

/** @param {string} frontmatter */
function parseFrontmatter(frontmatter) {
	const doc = parseDocument(frontmatter);
	if (doc.errors.length) {
		throw new Error('Las propiedades del evento tienen un error de formato: ' + doc.errors[0].message);
	}
	return doc;
}

/**
 * Reads the event fields the form cares about.
 * @param {string} frontmatter
 */
export function readEventFields(frontmatter) {
	const data = parseFrontmatter(frontmatter).toJS() ?? {};
	/** @param {any} v */
	const str = (v) => (v === undefined || v === null ? '' : String(v));
	/** @param {any} v */
	const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
	return {
		title: str(data.title),
		summary: str(data.summary),
		status: str(data.status),
		start: str(data.start),
		end: str(data.end),
		location: str(data.location),
		location_name: str(data.location_name),
		link: str(data.link),
		link_text: str(data.link_text),
		featured: str(data.featured),
		force_unlisted: data.force_unlisted === true,
		category: str(data.category),
		tags: list(data.tags),
		authors: list(data.authors)
	};
}

/** @param {string} key */
const escapeRe = (key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turns `#key: value` / `# key: value` back into `key: value` (first top-level occurrence), so
 * that setting a key the source had commented out keeps it in its original place, next to its
 * explanatory comments. Only done when the result is still valid YAML.
 * @param {string} text
 * @param {string} key
 */
function uncommentKey(text, key) {
	const re = new RegExp(`^#[ \\t]?(${escapeRe(key)}:(?:[ \\t].*)?)$`, 'm');
	if (!re.test(text)) return text;
	const candidate = text.replace(re, '$1');
	const doc = parseDocument(candidate);
	return doc.errors.length ? text : candidate;
}

/**
 * Comments out a top-level key in serialized YAML, including its continuation lines
 * (folded strings, list items).
 * @param {string} text
 * @param {string} key
 */
function commentOutKey(text, key) {
	const lines = text.split('\n');
	const start = lines.findIndex((l) => l.startsWith(key + ':'));
	if (start === -1) return text;
	let end = start + 1;
	while (end < lines.length && /^[ \t]+\S/.test(lines[end])) end++;
	for (let i = start; i < end; i++) lines[i] = '#' + lines[i];
	return lines.join('\n');
}

/**
 * Applies changes to a frontmatter block, preserving comments, key order and formatting of
 * everything that isn't touched.
 *
 * Values: `undefined` = leave as is; `null` or `''` = comment the key out (`#key: old value`);
 * `REMOVE` = delete the key; arrays replace lists (unchanged items keep their inline comments);
 * anything else sets the value (a commented-out key is re-activated in place, a missing key is
 * appended at the end).
 *
 * @param {string} frontmatter
 * @param {Record<string, any>} changes
 * @returns {string}
 */
export function applyFrontmatterChanges(frontmatter, changes) {
	let text = frontmatter.replace(/\r\n?/g, '\n');
	let doc = parseFrontmatter(text);
	const entries = Object.entries(changes).filter(([, v]) => v !== undefined);

	// Re-activate commented keys that are about to receive a value.
	let reparse = false;
	for (const [key, value] of entries) {
		if (value !== null && value !== '' && value !== REMOVE && !doc.has(key)) {
			const next = uncommentKey(text, key);
			if (next !== text) {
				text = next;
				reparse = true;
			}
		}
	}
	if (reparse) doc = parseFrontmatter(text);
	// @ts-ignore empty frontmatter
	if (doc.contents === null) doc.contents = doc.createNode({});

	/** @type {string[]} */
	const toComment = [];
	for (const [key, value] of entries) {
		if (value === REMOVE) {
			doc.delete(key);
		} else if (value === null || value === '') {
			if (doc.has(key)) toComment.push(key);
		} else if (Array.isArray(value)) {
			setList(doc, key, value);
		} else {
			const node = doc.get(key, true);
			if (isScalar(node)) {
				// Keeps the node's quoting style and inline comment (`status: x # a | b | c #`).
				node.value = value;
				if (node.type === Scalar.PLAIN || node.type === undefined) {
					// Let the serializer pick quotes if the new value needs them.
					node.type = undefined;
				}
			} else {
				doc.set(key, value);
			}
		}
	}
	let out = doc.toString();
	for (const key of toComment) out = commentOutKey(out, key);
	return out.replace(/\s+$/, '') + '\n';
}

/**
 * @param {import('yaml').Document} doc
 * @param {string} key
 * @param {any[]} values
 */
function setList(doc, key, values) {
	const node = doc.get(key, true);
	if (!isSeq(node)) {
		doc.set(key, doc.createNode(values));
		return;
	}
	const pool = [...node.items];
	node.items = values.map((v) => {
		const i = pool.findIndex((item) => isScalar(item) && String(item.value) === String(v));
		if (i >= 0) return pool.splice(i, 1)[0];
		return doc.createNode(v);
	});
}

/* ------------------------------------------------------------------------------------------ */
/*  Dates                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/**
 * `2026-09-12T20:00-03:00` → `{date: '2026-09-12', time: '20:00'}`. The wall-clock time is kept
 * as written (no timezone conversion). Also accepts Date objects (as parsed by some YAML libs),
 * which are converted to Argentina's wall-clock time.
 * @param {string|Date|undefined|null} value
 */
export function parseEventDate(value) {
	if (value instanceof Date && !isNaN(value.getTime())) {
		const local = new Date(value.getTime() - 3 * 3600 * 1000).toISOString();
		return { date: local.slice(0, 10), time: local.slice(11, 16) };
	}
	const m = String(value ?? '')
		.trim()
		.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
	if (!m) return { date: '', time: '' };
	return { date: m[1], time: m[2] ? `${m[2].padStart(2, '0')}:${m[3]}` : '' };
}

/** @param {string} date */
export function isValidDate(date) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
	if (!m) return false;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** @param {string} time */
export function isValidTime(time) {
	return /^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '');
}

/**
 * `('2026-10-10', '20:00')` → `2026-10-10T20:00-03:00`
 * @param {string} date YYYY-MM-DD
 * @param {string} time hh:mm
 */
export function formatEventDate(date, time) {
	if (!isValidDate(date)) throw new Error(`Fecha inválida: "${date}"`);
	if (!isValidTime(time)) throw new Error(`Hora inválida: "${time}"`);
	return `${date}T${time}${AR_OFFSET}`;
}

/**
 * `2026-09-29` → `2026-09-29Z-03:00` (the format used by published_date / updated_date).
 * @param {string} date
 */
export function formatPostDate(date) {
	if (!isValidDate(date)) throw new Error(`Fecha inválida: "${date}"`);
	return `${date}Z${AR_OFFSET}`;
}

/**
 * Today's date in Argentina, YYYY-MM-DD.
 * @param {Date} [now]
 */
export function todayInArgentina(now = new Date()) {
	return new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * @param {string} date YYYY-MM-DD
 * @param {number} days
 */
export function addDays(date, days) {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Whole days from a to b (both YYYY-MM-DD).
 * @param {string} a
 * @param {string} b
 */
export function daysBetween(a, b) {
	/** @param {string} s */
	const t = (s) => {
		const [y, m, d] = s.split('-').map(Number);
		return Date.UTC(y, m - 1, d);
	};
	return Math.round((t(b) - t(a)) / 86400000);
}

/**
 * Checks start/end (already in site format). Returns an error message in Spanish, or null.
 * @param {string} start
 * @param {string} [end]
 */
export function validateSchedule(start, end) {
	if (!start) return 'Falta la fecha y hora de inicio.';
	if (!end) return null;
	if (end <= start) return 'El evento tiene que terminar después de empezar.';
	return null;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre'
];

/** @param {string} date YYYY-MM-DD */
export function describeDate(date) {
	if (!isValidDate(date)) return '';
	const [y, m, d] = date.split('-').map(Number);
	const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return `${WEEKDAYS[wd]} ${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
}

/**
 * Human description of an event schedule, e.g.
 * "sábado 12 de septiembre de 2026, de 20:00 a 01:30 (del domingo 13 de septiembre de 2026)".
 * @param {string} start site-format date
 * @param {string} [end]
 */
export function describeSchedule(start, end) {
	const s = parseEventDate(start);
	if (!s.date) return '';
	let out = describeDate(s.date);
	if (s.time) out += `, ${end ? 'de' : 'a las'} ${s.time}`;
	const e = parseEventDate(end);
	if (e.date) {
		out += ` a ${e.time || '?'}`;
		if (e.date !== s.date) out += ` (del ${describeDate(e.date)})`;
	}
	return out;
}

/* ------------------------------------------------------------------------------------------ */
/*  Slugs                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** @type {Record<string, number>} */
const MONTH_WORDS = {
	enero: 1,
	ene: 1,
	febrero: 2,
	feb: 2,
	marzo: 3,
	mar: 3,
	abril: 4,
	abr: 4,
	mayo: 5,
	junio: 6,
	jun: 6,
	julio: 7,
	jul: 7,
	agosto: 8,
	ago: 8,
	septiembre: 9,
	setiembre: 9,
	sept: 9,
	sep: 9,
	set: 9,
	octubre: 10,
	oct: 10,
	noviembre: 11,
	nov: 11,
	diciembre: 12,
	dic: 12
};

/**
 * Replaces the last match of `re` (global) in `str`.
 * @param {string} str
 * @param {RegExp} re
 * @param {string} replacement
 */
function replaceLast(str, re, replacement) {
	const matches = [...str.matchAll(re)];
	if (!matches.length) return null;
	const m = matches[matches.length - 1];
	const index = /** @type {number} */ (m.index);
	return str.slice(0, index) + replacement + str.slice(index + m[0].length);
}

/**
 * Proposes the slug for a copy of an event happening on `startDate`:
 * - `picantearla-2026-08` → `picantearla-2026-10`
 * - `taller-ecofetichismo-2026-09-cordoba` → `taller-ecofetichismo-2026-10-cordoba` (suffix kept)
 * - old style `cine-para-sucixs-sep-2023` → `cine-para-sucixs-2026-10`
 * - `festival-24-7-2023` → `festival-24-7-2026-10`
 * - no date at all (`cine-para-sucixs`) → `cine-para-sucixs-2026-10`
 * @param {string} sourceSlug
 * @param {string} startDate YYYY-MM-DD (or anything starting with it)
 */
export function deriveSlug(sourceSlug, startDate) {
	const ym = String(startDate ?? '').slice(0, 7);
	if (!/^\d{4}-\d{2}$/.test(ym)) return sourceSlug;
	const words = Object.keys(MONTH_WORDS).join('|');
	return (
		replaceLast(sourceSlug, /-(?:19|20)\d{2}-(?:0[1-9]|1[0-2])(?=-|$)/g, '-' + ym) ??
		replaceLast(sourceSlug, new RegExp(`-(?:${words})-(?:19|20)\\d{2}(?=-|$)`, 'g'), '-' + ym) ??
		replaceLast(sourceSlug, /-(?:19|20)\d{2}(?=-|$)/g, '-' + ym) ??
		`${sourceSlug}-${ym}`
	);
}

/**
 * "¡Córdoba! Taller de Ecofetichismo" → "cordoba-taller-de-ecofetichismo"
 * @param {string} text
 */
export function slugify(text) {
	return String(text ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80)
		.replace(/-+$/, '');
}

/**
 * Returns an error message in Spanish, or null if the slug is OK.
 * @param {string} slug
 * @param {Iterable<string>|((slug: string) => boolean)} [taken]
 */
export function validateSlug(slug, taken) {
	if (!slug) return 'Falta la dirección de la página.';
	if (slug.length > 100) return 'La dirección es demasiado larga (máximo 100 caracteres).';
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
		return 'La dirección solo puede tener letras minúsculas sin tildes, números y guiones (sin espacios ni guiones al principio o al final).';
	if (taken && isTaken(slug, taken)) return 'Ya existe un evento con esa dirección.';
	return null;
}

/**
 * @param {string} slug
 * @param {Iterable<string>|((slug: string) => boolean)} taken
 */
function isTaken(slug, taken) {
	if (typeof taken === 'function') return taken(slug);
	for (const t of taken) if (t === slug) return true;
	return false;
}

/**
 * `slug` if free, else `slug-2`, `slug-3`...
 * @param {string} slug
 * @param {Iterable<string>|((slug: string) => boolean)} taken
 */
export function uniqueSlug(slug, taken) {
	if (!isTaken(slug, taken)) return slug;
	for (let i = 2; ; i++) {
		const candidate = `${slug}-${i}`;
		if (!isTaken(candidate, taken)) return candidate;
	}
}

/* ------------------------------------------------------------------------------------------ */
/*  Images                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/**
 * Detects jpg / png / webp from the file's first bytes (don't trust the browser's MIME type).
 * @param {Uint8Array} bytes
 * @returns {'jpg'|'png'|'webp'|null}
 */
export function detectImageType(bytes) {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
	if (
		bytes.length >= 8 &&
		[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
	)
		return 'png';
	if (
		bytes.length >= 12 &&
		String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
		String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
	)
		return 'webp';
	return null;
}

/** @param {string|number|undefined|null} featured */
export function isNumericFeatured(featured) {
	return /^\d+$/.test(String(featured ?? '').trim());
}

/* ------------------------------------------------------------------------------------------ */
/*  Putting it together                                                                        */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} EventForm
 * @prop {string} title
 * @prop {string} summary
 * @prop {string} status
 * @prop {string} startDate
 * @prop {string} startTime
 * @prop {boolean} hasEnd
 * @prop {string} endDate
 * @prop {string} endTime
 * @prop {string} location
 * @prop {string} location_name
 * @prop {string} link
 * @prop {string} link_text
 * @prop {string} tags comma separated
 * @prop {string} authors comma separated
 * @prop {'keep'|'upload'|'none'} featuredMode
 * @prop {string} [uploadExt] extension of the uploaded image, when featuredMode is 'upload'
 * @prop {string} body
 * @prop {string} publishedDate YYYY-MM-DD
 * @prop {boolean} [unlisted]
 */

/** @param {string} s */
export const splitList = (s) =>
	String(s ?? '')
		.split(',')
		.map((x) => x.trim())
		.filter(Boolean);

/**
 * Builds the new event's markdown from the source file (a previous event or NEW_EVENT_TEMPLATE)
 * and the form values.
 * @param {string} sourceRaw
 * @param {EventForm} form
 * @returns {string}
 */
export function buildEventMarkdown(sourceRaw, form) {
	const { frontmatter } = splitMarkdown(sourceRaw);
	const start = formatEventDate(form.startDate, form.startTime);
	const end = form.hasEnd ? formatEventDate(form.endDate, form.endTime) : null;
	const scheduleError = validateSchedule(start, end ?? undefined);
	if (scheduleError) throw new Error(scheduleError);
	if (!form.title?.trim()) throw new Error('Falta el título.');

	const source = readEventFields(frontmatter);
	/** @type {Record<string, any>} */
	const changes = {
		published_date: formatPostDate(form.publishedDate),
		updated_date: REMOVE,
		title: form.title.trim(),
		summary: form.summary.replace(/\s*\n\s*/g, ' ').trim(),
		status: form.status || null,
		start,
		end,
		location: form.location.trim(),
		location_name: form.location_name.trim(),
		link: form.link.trim(),
		link_text: form.link_text.trim(),
		category: 'calendario',
		layout: 'calendario',
		force_unlisted: form.unlisted ? true : source.force_unlisted ? null : undefined
	};
	const tags = splitList(form.tags);
	if (tags.join('\n') !== source.tags.join('\n')) changes.tags = tags;
	const authors = splitList(form.authors);
	if (authors.join('\n') !== source.authors.join('\n')) changes.authors = authors;
	if (form.featuredMode === 'upload') changes.featured = 1;
	else if (form.featuredMode === 'none') changes.featured = null;

	const fm = applyFrontmatterChanges(frontmatter, changes);
	let body = String(form.body ?? '').replace(/\r\n?/g, '\n');
	if (body.trim() && !body.endsWith('\n')) body += '\n';
	return joinMarkdown(fm, body);
}

/**
 * Initial form values from a source file.
 * @param {string} sourceRaw
 * @param {{ today: string, fromTemplate?: boolean }} opts
 * @returns {EventForm}
 */
export function formFromSource(sourceRaw, { today, fromTemplate = false }) {
	const { frontmatter, body } = splitMarkdown(sourceRaw);
	const f = readEventFields(frontmatter);
	const s = parseEventDate(f.start);
	const e = parseEventDate(f.end);
	return {
		title: fromTemplate ? '' : f.title,
		summary: fromTemplate ? '' : f.summary,
		status: f.status || 'anunciado',
		startDate: fromTemplate ? '' : s.date,
		startTime: s.time || '20:00',
		hasEnd: fromTemplate || Boolean(e.date),
		endDate: fromTemplate ? '' : e.date,
		endTime: e.time || '23:00',
		location: fromTemplate ? '' : f.location,
		location_name: fromTemplate ? '' : f.location_name,
		link: fromTemplate ? '' : f.link,
		link_text: f.link_text || (fromTemplate ? 'Inscribirme' : ''),
		tags: f.tags.join(', '),
		authors: f.authors.join(', '),
		featuredMode: f.featured ? 'keep' : 'none',
		body: fromTemplate ? '' : body,
		publishedDate: today,
		unlisted: false
	};
}
