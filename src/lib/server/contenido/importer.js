/**
 * Importación del contenido .md (eventos; después material y wiki) a objetos en la base. Es el
 * mismo patrón que las fichas de amigues (src/lib/server/amigues/importer.js):
 *
 * - Escribe SOLO con saveObject() (docs/objetos.md). `content_sources` (de qué .md salió) y el
 *   historial (`object_revisions`) van en la misma tanda (opción `also`).
 * - **Idempotente** (se une por carpeta + nombre de archivo, `content_sources.legacy_slug`):
 *   - si el .md no cambió (mismo SHA-256), no hace nada;
 *   - si el .md cambió y el objeto no se tocó desde la última importación, lo actualiza;
 *   - si el objeto se editó en el panel (su `version` ya no es la de la importación), no lo pisa
 *     y lo informa, con qué campos difieren;
 *   - si el objeto se borró en el panel, no lo revive.
 * - **Informa** qué haría antes de hacerlo ({@link planImport}, sin escribir nada) y qué campos
 *   cambian en cada actualización.
 * - **De a tandas** ({@link runImport} con `limit`): D1 tiene un máximo de consultas por pedido,
 *   así que el panel la llama varias veces hasta que no queda nada.
 *
 * Los .md que el sitio no muestra porque su frontmatter no se puede leer (mdsvex da `metadata`
 * vacía) quedan afuera («no se puede leer»), igual que en el sitio.
 *
 * Solo imports relativos (se prueba sin Vite, contra un D1 de miniflare).
 */
import { ObjectError } from '../objects/errors.js';
import { saveObject, slugify } from '../objects/save.js';
import { coreTypes, validateData } from '../objects/types/index.js';
import { sha256, splitMarkdown } from '../amigues/importer.js';
import { CONTENT_CATEGORIES } from './categories.js';
import { dataDiff } from './parity.js';
import { reshapePersonas } from '../../utils/personasList.js';
import { revisionStatement } from './revisions.js';
import { contentEdgesOf, dehydrateContent, withContentEdges } from './relaciones.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./eventos.js').MappedEvent} Mapped */

/** @typedef {import('./categories.js').ContentCategory} ContentCategory */

// Las categorías (eventos, material) y su mapa .md → objeto viven en ./categories.js.
export { CONTENT_CATEGORIES };

/** Cuántos objetos escribe {@link runImport} como mucho por llamada (cada uno, ~3 consultas). */
export const IMPORT_CHUNK = 40;

/**
 * Un .md como lo pide la importación: el nombre del archivo sin `.md`, el texto (para el hash y el
 * cuerpo) y la metadata que da mdsvex (la que usa el sitio; `null` si no se puede leer).
 *
 * @typedef {{ legacySlug: string, raw: string, meta: Record<string, any> | null | undefined }} SourceFile
 */

/**
 * @typedef {'created' | 'updated' | 'unchanged' | 'skipped_edited' | 'skipped_deleted' | 'invalid' | 'error'} ImportAction
 */

/**
 * @typedef {{
 *   legacySlug: string,
 *   action: ImportAction,
 *   objectId: number | null,
 *   slug: string | null,
 *   title: string,
 *   changed: string[],
 *   warnings: string[],
 *   notes: string[],
 *   message?: string
 * }} ImportRow
 */

/**
 * Lo que la base ya tiene de cada .md importado de una categoría (una sola consulta).
 *
 * Lectura interna de la importación (solo admins la corren): no filtra por visibilidad porque
 * tiene que ver también lo oculto y lo borrado, para no pisarlo ni revivirlo.
 *
 * @param {D1Database} db
 * @param {string} category
 */
export async function importedSources(db, category) {
	const { results } = await db
		.prepare(
			`SELECT s.object_id, s.legacy_slug, s.source_hash, s.imported_version, s.imported_at,
				s.updated_at, o.version, o.slug, o.title, o.data, o.visibility, o.deleted_at
			FROM content_sources s JOIN objects o ON o.id = s.object_id
			WHERE s.category = ?1`
		)
		.bind(category)
		.all();
	/** @type {Map<string, ImportedSource>} */
	const out = new Map();
	// Con las listas de personas y de etiquetas enteras (los perfiles y las etiquetas son edges:
	// ./relaciones.js), para comparar con lo que da el .md.
	const linked = await contentEdgesOf(
		db,
		results.map((r) => Number(r.object_id))
	);
	const type = CONTENT_CATEGORIES[category]?.type ?? '';
	for (const r of results) {
		let data = {};
		try {
			data = withContentEdges(type, JSON.parse(String(r.data)), linked.get(Number(r.object_id)));
		} catch {
			data = {};
		}
		out.set(String(r.legacy_slug), {
			objectId: Number(r.object_id),
			legacySlug: String(r.legacy_slug),
			hash: String(r.source_hash),
			importedVersion: Number(r.imported_version),
			importedAt: Number(r.imported_at),
			updatedAt: Number(r.updated_at),
			version: Number(r.version),
			slug: String(r.slug),
			title: String(r.title),
			data: /** @type {Record<string, any>} */ (data),
			visibility: String(r.visibility),
			deleted: r.deleted_at != null
		});
	}
	return out;
}

/**
 * @typedef {{
 *   objectId: number, legacySlug: string, hash: string, importedVersion: number,
 *   importedAt: number, updatedAt: number, version: number, slug: string, title: string,
 *   data: Record<string, any>, visibility: string, deleted: boolean
 * }} ImportedSource
 */

/**
 * Las direcciones (`objects.slug`) que ya usa ese tipo, para no chocar al crear.
 *
 * @param {D1Database} db
 * @param {string} type
 */
async function takenSlugs(db, type) {
	const { results } = await db.prepare('SELECT slug FROM objects WHERE type = ?1').bind(type).all();
	return new Set(results.map((r) => String(r.slug)));
}

/** ¿Es un .md de verdad? (no las plantillas `_…`). @param {string} legacySlug */
export function isImportable(legacySlug) {
	return Boolean(legacySlug) && !legacySlug.startsWith('_') && legacySlug.length <= 100;
}

/**
 * La dirección del objeto nuevo: la del .md en minúsculas (casi siempre es la misma).
 *
 * @param {string} legacySlug
 */
export function objectSlugFor(legacySlug) {
	return slugify(legacySlug.replaceAll('_', '-')).slice(0, 100).replace(/-+$/, '');
}

/** @param {ObjectError} error */
function describeObjectError(error) {
	const details = error.errors.map((e) => e.message).join(' ');
	return details ? `${error.message} ${details}` : error.message;
}

/**
 * @typedef {ImportRow & {
 *   hash: string,
 *   mapped: Mapped | null,
 *   data: Record<string, unknown> | null,
 *   source: ImportedSource | null
 * }} PlannedRow
 */

/**
 * Qué haría la importación con cada .md, sin escribir nada.
 *
 * @param {D1Database} db
 * @param {string} category
 * @param {SourceFile[]} files
 * @returns {Promise<PlannedRow[]>}
 */
export async function planImport(db, category, files) {
	const cat = CONTENT_CATEGORIES[category];
	if (!cat) throw new Error(`Categoría que no se importa: ${category}`);
	const def = /** @type {import('../objects/types/index.js').CoreType} */ (coreTypes.get(cat.type));
	const [sources, slugs] = await Promise.all([
		importedSources(db, category),
		takenSlugs(db, cat.type)
	]);
	/** @type {Set<string>} */
	const claimed = new Set();
	const sorted = [...files]
		.filter((f) => isImportable(f.legacySlug))
		.sort((a, b) => a.legacySlug.localeCompare(b.legacySlug));
	/** @type {PlannedRow[]} */
	const rows = [];
	for (const file of sorted) {
		const source = sources.get(file.legacySlug) ?? null;
		const hash = await sha256(file.raw);
		/** @type {PlannedRow} */
		const base = {
			legacySlug: file.legacySlug,
			action: 'unchanged',
			objectId: source?.objectId ?? null,
			slug: source?.slug ?? null,
			title: source?.title ?? file.legacySlug,
			changed: [],
			warnings: [],
			notes: [],
			hash,
			mapped: null,
			data: null,
			source
		};
		if (!file.meta) {
			rows.push({
				...base,
				action: 'invalid',
				message: 'El frontmatter tiene un error de formato: el sitio tampoco lo muestra.'
			});
			continue;
		}
		let body = '';
		try {
			body = splitMarkdown(file.raw).body;
		} catch {
			body = '';
		}
		const mapped = cat.map(file.legacySlug, file.meta, body);
		// Lo que viene del repo cuenta como HTML libre de superadmin (decisión 0004): se muestra
		// igual que hoy (./render.js).
		if (mapped.data.body) mapped.data = { ...mapped.data, body_html: 'libre' };
		const validated = validateData(def, mapped.data);
		const row = {
			...base,
			title: mapped.title,
			warnings: mapped.warnings,
			notes: mapped.notes ?? [],
			mapped
		};
		if (mapped.error && !source) {
			rows.push({ ...row, action: 'error', message: mapped.error });
			continue;
		}
		if (!validated.ok) {
			rows.push({
				...row,
				action: 'error',
				message: `Revisá el .md: ${validated.errors.map((e) => e.message).join('; ')}`
			});
			continue;
		}
		row.data = validated.data;
		if (source) {
			const changed = [
				...(source.title !== mapped.title ? ['title'] : []),
				...(source.visibility !== mapped.visibility ? ['visibility'] : []),
				// Lo importado con la forma de antes de «Personas en una sola sección» (`authors` +
				// `extra.personas`) se compara como si ya tuviera la lista única: es lo mismo.
				...dataDiff(reshapePersonas(source.data, cat.category), validated.data)
			];
			if (source.deleted) rows.push({ ...row, action: 'skipped_deleted', changed });
			else if (source.hash === hash) rows.push({ ...row, action: 'unchanged', changed });
			else if (source.version !== source.importedVersion)
				rows.push({ ...row, action: 'skipped_edited', changed });
			else rows.push({ ...row, action: 'updated', changed });
			continue;
		}
		const slug = objectSlugFor(file.legacySlug);
		if (!slug || slugs.has(slug) || claimed.has(slug)) {
			rows.push({
				...row,
				action: 'error',
				slug: slug || null,
				message: slug
					? `Ya hay un ${def.label.toLowerCase()} en la base con la dirección «${slug}».`
					: 'No se puede armar una dirección para este archivo.'
			});
			continue;
		}
		claimed.add(slug);
		rows.push({ ...row, action: 'created', slug });
	}
	return rows;
}

/**
 * Lo que se muestra de una fila (sin los datos internos).
 *
 * @param {PlannedRow} row
 * @returns {ImportRow}
 */
export function publicRow(row) {
	// eslint-disable-next-line no-unused-vars
	const { hash, mapped, data, source, ...rest } = row;
	return rest;
}

/**
 * Importa (o actualiza) hasta `limit` .md de una categoría. Nunca tira por un archivo: cada uno
 * informa su resultado. Devuelve las filas escritas (o con error al escribir) y cuántas quedan.
 *
 * @param {D1Database} db
 * @param {string} category
 * @param {SourceFile[]} files
 * @param {{ actor: string, now?: number, limit?: number }} opts
 * @returns {Promise<{ results: ImportRow[], remaining: number, plan: ImportRow[] }>}
 */
export async function runImport(
	db,
	category,
	files,
	{ actor, now = Date.now(), limit = IMPORT_CHUNK }
) {
	const cat = CONTENT_CATEGORIES[category];
	const plan = await planImport(db, category, files);
	const todo = plan.filter((r) => r.action === 'created' || r.action === 'updated');
	/** @type {ImportRow[]} */
	const results = [];
	for (const row of todo.slice(0, Math.max(0, limit))) {
		try {
			results.push(await writeRow(db, cat, category, row, { actor, now }));
		} catch (error) {
			results.push({
				...publicRow(row),
				action: 'error',
				message: error instanceof ObjectError ? describeObjectError(error) : String(error)
			});
		}
	}
	return {
		results,
		remaining: Math.max(0, todo.length - results.length),
		plan: plan.map(publicRow)
	};
}

/**
 * @param {D1Database} db
 * @param {ContentCategory} cat
 * @param {string} category
 * @param {PlannedRow} row
 * @param {{ actor: string, now: number }} opts
 * @returns {Promise<ImportRow>}
 */
async function writeRow(db, cat, category, row, { actor, now }) {
	const mapped = /** @type {Mapped} */ (row.mapped);
	// Los perfiles de `personas` y las etiquetas van como edges, no en `data` (./relaciones.js).
	const { data, edges } = await dehydrateContent(
		db,
		category,
		/** @type {Record<string, unknown>} */ (row.data)
	);
	if (row.action === 'updated') {
		const source = /** @type {ImportedSource} */ (row.source);
		const saved = await saveObject(
			db,
			{
				id: source.objectId,
				type: cat.type,
				version: source.version,
				title: mapped.title,
				data,
				edges,
				visibility: mapped.visibility
			},
			{
				actor,
				now,
				also: (self) => [
					db
						.prepare(
							`UPDATE content_sources SET source_hash = ?2, imported_version = ?3, updated_at = ?4
							WHERE object_id = ?1`
						)
						.bind(source.objectId, row.hash, source.version + 1, now),
					revisionStatement(db, self, 'import')
				]
			}
		);
		return { ...publicRow(row), objectId: saved.id, slug: saved.slug };
	}
	const saved = await saveObject(
		db,
		{
			type: cat.type,
			title: mapped.title,
			slug: /** @type {string} */ (row.slug),
			data,
			edges: { ...edges, ...(await legacyVenueEdge(db, category, row.legacySlug)) },
			visibility: mapped.visibility
		},
		{
			actor,
			now,
			also: (self) => [
				db
					.prepare(
						`INSERT INTO content_sources (object_id, category, legacy_slug, source_hash,
							imported_version, imported_at, updated_at)
						SELECT id, ?3, ?4, ?5, 1, ?6, ?6 FROM objects WHERE type = ?1 AND slug = ?2`
					)
					.bind(self.type, self.slug, category, row.legacySlug, row.hash, now),
				revisionStatement(db, self, 'import')
			]
		}
	);
	return { ...publicRow(row), objectId: saved.id, slug: saved.slug };
}

/**
 * El lugar que un evento tenía en la tabla vieja `event_venues` (antes de que «sucede en» fuera un
 * edge), para el evento que se importa recién ahora: la migración 0035 pasó a edges los vínculos
 * de los eventos que ya estaban en la base; los de los que todavía eran solo .md se pasan acá, al
 * crearlos. Es la única lectura que queda de esa tabla (ya nadie la escribe). Solo si el lugar
 * sigue vivo y es un lugar.
 *
 * @param {D1Database} db
 * @param {string} category
 * @param {string} legacySlug
 * @returns {Promise<{ lugar?: { to: number, data: { privacy: string } | null }[] }>}
 */
async function legacyVenueEdge(db, category, legacySlug) {
	if (category !== 'calendario') return {};
	let row;
	try {
		row = await db
			.prepare(
				`SELECT ev.venue_id, ev.privacy FROM event_venues ev
				JOIN objects o ON o.id = ev.venue_id AND o.type = 'perfil' AND o.deleted_at IS NULL
					AND json_extract(o.data, '$.kind') = 'lugar'
				WHERE ev.event_slug = ?1`
			)
			.bind(legacySlug)
			.first();
	} catch {
		return {}; // una base sin la tabla vieja
	}
	if (!row) return {};
	const privacy = typeof row.privacy === 'string' ? row.privacy : null;
	return { lugar: [{ to: Number(row.venue_id), data: privacy ? { privacy } : null }] };
}

/**
 * Cuántas filas de cada acción.
 *
 * @param {{ action: ImportAction }[]} rows
 */
export function summarizeImport(rows) {
	/** @type {Record<ImportAction, number>} */
	const counts = {
		created: 0,
		updated: 0,
		unchanged: 0,
		skipped_edited: 0,
		skipped_deleted: 0,
		invalid: 0,
		error: 0
	};
	for (const r of rows) counts[r.action]++;
	return counts;
}
