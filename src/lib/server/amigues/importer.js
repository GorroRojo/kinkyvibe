/**
 * Importación de las fichas de amigues (src/lib/posts/amigues/*.md) a perfiles en la base.
 *
 * - Escribe SOLO con saveObject() (docs/objetos.md); las tablas de apoyo (`profile_sources`,
 *   `profile_approvals`, migración 0017) van en la misma tanda (opción `also`).
 * - **Idempotente**: cada ficha queda unida a su perfil por la dirección vieja
 *   (`profile_sources.legacy_slug`). Volver a correrla no duplica nada:
 *   - si el .md no cambió (mismo SHA-256), no hace nada;
 *   - si el .md cambió y el perfil no se tocó desde la última importación, lo actualiza;
 *   - si el perfil se editó en el panel (su `version` ya no es la de la importación), no lo pisa
 *     y lo informa;
 *   - si el perfil se borró en el panel, no lo revive.
 * - Fiel: cada campo del frontmatter va a un campo del perfil con el mismo nombre (ver
 *   {@link mdToProfile}); el resumen va a `bio` y el cuerpo a `body`, tal cual.
 * - Clasifica cada ficha como persona, grupo o lugar ("a confirmar", ver classify.js).
 * - Los perfiles importados nacen aprobados para /amigues (ya eran públicos).
 *
 * Corre en el Worker (Panel → Contenido → Amigues → Importar, para las bases remotas), en el
 * script `scripts/import-amigues.js` (base local) y en los tests. Por eso usa solo imports
 * relativos y `yaml` (nada de `$lib` ni de Vite).
 */
import YAML from 'yaml';
import { ObjectError } from '../objects/errors.js';
import { saveObject, slugify } from '../objects/save.js';
import { approveNewStatement } from './approvals.js';
import { classifyAmigue } from './classify.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./classify.js').SuggestedKind} SuggestedKind */

export const PROFILE_TYPE = 'perfil';
/** Quién figura como autore de lo que escribe el script de Node. */
export const SCRIPT_ACTOR = 'importacion-amigues';
/** `profile_approvals.approved_by` de los perfiles importados. */
export const IMPORT_APPROVER = 'importacion';

/**
 * Campos de texto que pasan tal cual (mismo nombre en el frontmatter y en el perfil).
 * `pronoun` y `link` se tratan aparte.
 */
const TEXT_FIELDS = /** @type {const} */ ([
	'link_text',
	'featured',
	'photo',
	'logo',
	'email',
	'tel',
	'bday',
	'gender_identity',
	'job_title',
	'published_date',
	'updated_date'
]);

/** Claves del frontmatter que no son datos del perfil (todas las fichas dicen lo mismo). */
const IGNORED_KEYS = new Set(['layout', 'category', 'force_unpublished', 'force_unlisted']);

/** Claves que el importador entiende. */
const KNOWN_KEYS = new Set([
	...TEXT_FIELDS,
	'title',
	'summary',
	'pronoun',
	'link',
	'tags',
	'authors',
	'location',
	...IGNORED_KEYS
]);

/**
 * Separa el frontmatter del cuerpo. El frontmatter va entre la primera línea `---` y la
 * siguiente.
 *
 * @param {string} raw
 * @returns {{ frontmatter: string, body: string }}
 */
export function splitMarkdown(raw) {
	const text = raw.replace(/\r\n?/g, '\n');
	const m = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
	if (!m) return { frontmatter: '', body: text };
	return { frontmatter: m[1], body: text.slice(m[0].length) };
}

/**
 * El cuerpo como se guarda: sin las líneas vacías del principio ni los espacios del final.
 *
 * @param {string} body
 */
export function normalizeBody(body) {
	return body.replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
}

/**
 * Lee el frontmatter como texto (esquema "failsafe" de YAML: todo valor es texto, así un
 * teléfono "+56…" o una fecha "2024-01-11Z-03:00" quedan exactamente como se escribieron).
 *
 * @param {string} frontmatter
 * @returns {Record<string, unknown>}
 */
export function parseFrontmatter(frontmatter) {
	if (!frontmatter.trim()) return {};
	const parsed = YAML.parse(frontmatter, { schema: 'failsafe' });
	return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/** @param {unknown} v @returns {string[]} */
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : str(v) ? [str(v)] : []);

/** @param {unknown} v */
const truthy = (v) => ['true', 'yes', '1', 'sí', 'si'].includes(str(v).toLowerCase());

/**
 * @typedef {{
 *   legacySlug: string,
 *   title: string,
 *   data: Record<string, unknown>,
 *   visibility: 'public' | 'hidden',
 *   suggested: SuggestedKind,
 *   reasons: string[],
 *   warnings: string[],
 *   meta: Record<string, unknown>,
 *   body: string
 * }} MappedProfile
 */

/**
 * Convierte una ficha .md en lo que se guarda: título, datos del perfil y visibilidad.
 *
 * Mapa de campos (frontmatter → perfil): `title` → título; `summary` → `bio`; el cuerpo →
 * `body`; `pronoun` → `pronouns_url` si es un link (pronombr.es) o `pronouns` si es texto;
 * `link` → `links[0]`; `tags`, `authors` → listas; `force_unlisted: true` → `unlisted`;
 * `force_unpublished: true` → visibilidad oculta; `location` → `address` (solo lugares); el resto
 * (`link_text`, `featured`, `photo`, `logo`, `email`, `tel`, `bday`, `gender_identity`,
 * `job_title`, `published_date`, `updated_date`) con el mismo nombre, como texto.
 *
 * @param {string} legacySlug el nombre del archivo sin `.md`
 * @param {string} raw el contenido del archivo
 * @param {{ kind?: SuggestedKind }} [opts] `kind` para no reclasificar (al actualizar)
 * @returns {MappedProfile}
 */
export function mdToProfile(legacySlug, raw, { kind } = {}) {
	const { frontmatter, body } = splitMarkdown(raw);
	const meta = parseFrontmatter(frontmatter);
	const classified = classifyAmigue(meta, legacySlug);
	const suggested = classified.kind;
	const finalKind = kind ?? suggested;
	/** @type {string[]} */
	const warnings = [];
	for (const key of Object.keys(meta)) {
		if (!KNOWN_KEYS.has(key)) warnings.push(`campo desconocido «${key}» (no se importa)`);
	}

	/** @type {Record<string, unknown>} */
	const data = { kind: finalKind };
	const summary = str(meta.summary);
	if (summary) data.bio = summary;
	const text = normalizeBody(body);
	if (text) data.body = text;
	const pronoun = str(meta.pronoun);
	if (/^https?:\/\//i.test(pronoun)) data.pronouns_url = pronoun;
	else if (pronoun) data.pronouns = pronoun;
	const link = str(meta.link);
	if (link) data.links = [link];
	for (const key of TEXT_FIELDS) {
		const value = str(meta[key]);
		if (value) data[key] = value;
	}
	const tags = strList(meta.tags);
	if (tags.length) data.tags = tags;
	const authors = strList(meta.authors);
	if (authors.length) data.authors = authors;
	if (truthy(meta.force_unlisted)) data.unlisted = true;
	const location = str(meta.location);
	if (location) {
		if (finalKind === 'lugar') data.address = location;
		else warnings.push('tiene dirección (location) pero no es un lugar: no se importa');
	}

	return {
		legacySlug,
		title: str(meta.title) || legacySlug,
		data,
		visibility: truthy(meta.force_unpublished) ? 'hidden' : 'public',
		suggested,
		reasons: classified.reasons,
		warnings,
		meta,
		body: text
	};
}

/**
 * SHA-256 (hex) de un texto.
 *
 * @param {string} text
 */
export async function sha256(text) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ¿Es una ficha de verdad? (no las plantillas `_…`).
 *
 * @param {string} legacySlug
 */
export function isImportable(legacySlug) {
	return Boolean(legacySlug) && !legacySlug.startsWith('_') && legacySlug.length <= 100;
}

/**
 * @typedef {'created' | 'updated' | 'unchanged' | 'skipped_edited' | 'skipped_deleted' | 'error'} ImportAction
 */

/**
 * @typedef {{
 *   legacySlug: string, action: ImportAction, profileId: number | null, slug: string | null,
 *   title: string, kind: SuggestedKind, reasons: string[], warnings: string[], message?: string
 * }} ImportResult
 */

/**
 * La fila de `profile_sources` de una ficha, con el estado del perfil.
 *
 * @param {D1Database} db
 * @param {string} legacySlug
 */
async function sourceOf(db, legacySlug) {
	const row = await db
		.prepare(
			`SELECT s.profile_id, s.source_hash, s.imported_version, o.version, o.slug, o.deleted_at,
				o.data FROM profile_sources s JOIN objects o ON o.id = s.profile_id
			WHERE s.legacy_slug = ?1`
		)
		.bind(legacySlug)
		.first();
	if (!row) return null;
	let data = {};
	try {
		data = JSON.parse(String(row.data));
	} catch {
		data = {};
	}
	return {
		profileId: Number(row.profile_id),
		hash: String(row.source_hash),
		importedVersion: Number(row.imported_version),
		version: Number(row.version),
		slug: String(row.slug),
		deleted: row.deleted_at != null,
		data: /** @type {Record<string, unknown>} */ (data)
	};
}

/**
 * Importa (o actualiza) las fichas. Nunca tira por una ficha: cada una informa su resultado.
 *
 * @param {D1Database} db
 * @param {{ legacySlug: string, raw: string }[]} files
 * @param {{ actor: string, now?: number, dryRun?: boolean }} opts
 * @returns {Promise<ImportResult[]>}
 */
export async function importAmigues(db, files, { actor, now = Date.now(), dryRun = false }) {
	/** @type {ImportResult[]} */
	const results = [];
	const sorted = [...files]
		.filter((f) => isImportable(f.legacySlug))
		.sort((a, b) => a.legacySlug.localeCompare(b.legacySlug));
	for (const file of sorted) {
		try {
			results.push(await importOne(db, file, { actor, now, dryRun }));
		} catch (error) {
			const mapped = safeMap(file);
			results.push({
				legacySlug: file.legacySlug,
				action: 'error',
				profileId: null,
				slug: null,
				title: mapped?.title ?? file.legacySlug,
				kind: mapped?.suggested ?? 'persona',
				reasons: mapped?.reasons ?? [],
				warnings: mapped?.warnings ?? [],
				message: error instanceof ObjectError ? describeObjectError(error) : String(error)
			});
		}
	}
	return results;
}

/** @param {{ legacySlug: string, raw: string }} file */
function safeMap(file) {
	try {
		return mdToProfile(file.legacySlug, file.raw);
	} catch {
		return null;
	}
}

/** @param {ObjectError} error */
function describeObjectError(error) {
	const details = error.errors.map((e) => e.message).join(' ');
	return details ? `${error.message} ${details}` : error.message;
}

/**
 * @param {D1Database} db
 * @param {{ legacySlug: string, raw: string }} file
 * @param {{ actor: string, now: number, dryRun: boolean }} opts
 * @returns {Promise<ImportResult>}
 */
async function importOne(db, { legacySlug, raw }, { actor, now, dryRun }) {
	const hash = await sha256(raw);
	const source = await sourceOf(db, legacySlug);
	const currentKind = /** @type {SuggestedKind | undefined} */ (
		source && ['persona', 'grupo', 'lugar'].includes(String(source.data.kind))
			? source.data.kind
			: undefined
	);
	// Al actualizar se respeta el tipo que ya tiene (pudo confirmarlo o cambiarlo une admin).
	const mapped = mdToProfile(legacySlug, raw, { kind: currentKind });
	/** @type {Omit<ImportResult, 'action'>} */
	const base = {
		legacySlug,
		profileId: source?.profileId ?? null,
		slug: source?.slug ?? null,
		title: mapped.title,
		kind: /** @type {SuggestedKind} */ (mapped.data.kind),
		reasons: mapped.reasons,
		warnings: mapped.warnings
	};

	if (source) {
		if (source.deleted) return { ...base, action: 'skipped_deleted' };
		if (source.hash === hash) return { ...base, action: 'unchanged' };
		if (source.version !== source.importedVersion) return { ...base, action: 'skipped_edited' };
		if (dryRun) return { ...base, action: 'updated' };
		const saved = await saveObject(
			db,
			{
				id: source.profileId,
				type: PROFILE_TYPE,
				version: source.version,
				title: mapped.title,
				data: keepPanelOnly(mapped.data, source.data)
			},
			{
				actor,
				now,
				also: () => [
					db
						.prepare(
							`UPDATE profile_sources SET source_hash = ?2, imported_version = ?3, updated_at = ?4
							WHERE profile_id = ?1`
						)
						.bind(source.profileId, hash, source.version + 1, now)
				]
			}
		);
		return { ...base, action: 'updated', slug: saved.slug };
	}

	if (dryRun) return { ...base, action: 'created', slug: slugify(legacySlug) || null };
	const saved = await createImported(db, mapped, { actor, now, hash });
	return { ...base, action: 'created', profileId: saved.id, slug: saved.slug };
}

/**
 * Lo que tiene el perfil y la ficha no maneja (por ejemplo, `show_members` de un grupo o los
 * campos de un lugar cargados en el panel) se conserva al actualizar.
 *
 * @param {Record<string, unknown>} fromFile
 * @param {Record<string, unknown>} current
 */
function keepPanelOnly(fromFile, current) {
	/** @type {Record<string, unknown>} */
	const out = { ...fromFile };
	for (const key of [
		'show_members',
		'avatar',
		'area',
		'city',
		'lat',
		'lng',
		'accessibility',
		'how_to_get_there',
		'venue_privacy'
	]) {
		if (current[key] !== undefined && out[key] === undefined) out[key] = current[key];
	}
	if (out.kind === 'lugar' && out.address === undefined && current.address !== undefined) {
		out.address = current.address;
	}
	return out;
}

/**
 * Crea el perfil de una ficha. Si la dirección nueva (la vieja pasada a minúsculas y guiones) ya
 * la usa otro perfil, prueba con el sufijo "-amigue".
 *
 * @param {D1Database} db
 * @param {MappedProfile} mapped
 * @param {{ actor: string, now: number, hash: string }} opts
 */
async function createImported(db, mapped, { actor, now, hash }) {
	const base = slugify(mapped.legacySlug) || 'amigue';
	const reason = mapped.reasons.join('; ').slice(0, 500);
	for (const slug of [base, `${base.slice(0, 90)}-amigue`]) {
		try {
			return await saveObject(
				db,
				{
					type: PROFILE_TYPE,
					title: mapped.title,
					slug,
					data: mapped.data,
					visibility: mapped.visibility
				},
				{
					actor,
					now,
					also: (self) => [
						db
							.prepare(
								`INSERT INTO profile_sources (profile_id, legacy_slug, source_hash, imported_version,
									suggested_kind, kind_reason, imported_at, updated_at)
								SELECT id, ?3, ?4, 1, ?5, ?6, ?7, ?7 FROM objects WHERE type = ?1 AND slug = ?2`
							)
							.bind(self.type, self.slug, mapped.legacySlug, hash, mapped.suggested, reason, now),
						approveNewStatement(db, self, IMPORT_APPROVER, now)
					]
				}
			);
		} catch (error) {
			if (error instanceof ObjectError && error.code === 'slug_taken') continue;
			throw error;
		}
	}
	throw new ObjectError('slug_taken', `No hay una dirección libre para «${mapped.legacySlug}».`, {
		status: 409
	});
}

/**
 * Resumen de una corrida, para el panel y el script.
 *
 * @param {ImportResult[]} results
 */
export function summarizeImport(results) {
	/** @type {Record<ImportAction, number>} */
	const counts = {
		created: 0,
		updated: 0,
		unchanged: 0,
		skipped_edited: 0,
		skipped_deleted: 0,
		error: 0
	};
	for (const r of results) counts[r.action]++;
	return counts;
}
