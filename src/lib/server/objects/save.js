/**
 * saveObject(): el ÚNICO camino para escribir `objects`, `edges` y `object_types`. Nada más en
 * el código hace INSERT/UPDATE/DELETE sobre esas tablas (lo verifica ./writePath.test.js).
 *
 * En un solo `db.batch` (una transacción de D1: o entra todo o nada):
 * 1. da de alta el tipo núcleo en `object_types` si hacía falta;
 * 2. inserta o actualiza el objeto, subiendo `version` en 1;
 * 3. reemplaza los edges salientes de los `kind` que se mandaron.
 *
 * Control de versión: para editar hay que mandar la `version` con la que se abrió el editor. Si
 * no coincide con la actual → VersionConflictError (409). Además, el trigger
 * `objects_version_check` (migración 0012) aborta la tanda si otro guardado se metió entre la
 * lectura y la escritura: nunca se pisa un cambio en silencio.
 *
 * Borrar es "suave" (`deleted: true`, se deshace con `deleted: false`); los edges quedan para
 * poder deshacer. La purga definitiva todavía no existe.
 *
 * Todavía faltan (fase 2, en su PR): historial de revisiones y registro en admin_audit, que van
 * en esta misma tanda.
 *
 * Solo usa imports relativos.
 */
import { ObjectError, VersionConflictError } from './errors.js';
import { checkEdgeTargets, normalizeEdges } from './edges.js';
import { OBJECT_COLUMNS, rowToObject } from './read.js';
import { coreTypes, validateData } from './types/index.js';
import { DEFAULT_VISIBILITY, VISIBILITIES } from './visibility.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */

export const TITLE_MAX = 200;
export const SLUG_MAX = 100;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * "¡Córdoba! Taller de Ecofetichismo" → "cordoba-taller-de-ecofetichismo" (igual que
 * src/lib/utils/eventDraft.js, que no se importa acá para no sumar YAML al cron).
 *
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
 * @typedef {object} SaveInput
 * @prop {number} [id] para editar; sin id, se crea
 * @prop {string} type
 * @prop {number} [version] obligatoria al editar: la versión que se estaba editando
 * @prop {string} [title] obligatorio al crear
 * @prop {string} [slug] al crear, si falta sale del título
 * @prop {Record<string, unknown>} [data] reemplaza todos los datos (validados según el tipo)
 * @prop {import('./visibility.js').Visibility} [visibility]
 * @prop {Record<string, import('./edges.js').EdgeInput[]>} [edges] reemplaza esos `kind`
 * @prop {boolean} [deleted] true = borrar (suave), false = deshacer el borrado
 */

/**
 * @typedef {object} SaveContext
 * @prop {string} actor quién guarda (hoy, el login de GitHub de le admin)
 * @prop {number} [now] ms desde epoch
 * @prop {import('./types/index.js').Registry} [registry] para tests; por defecto, los tipos núcleo
 */

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorText(error) {
	const e = /** @type {any} */ (error);
	return `${e?.message ?? ''} ${e?.cause?.message ?? ''}`;
}

/**
 * @param {D1Database} db
 * @param {SaveInput} input
 * @param {SaveContext} context
 * @returns {Promise<import('./read.js').StoredObject>}
 */
export async function saveObject(db, input, { actor, now = Date.now(), registry = coreTypes }) {
	if (!actor || typeof actor !== 'string') throw new ObjectError('invalid', 'Falta quién guarda.');
	const def = registry.get(input?.type);
	if (!def) throw new ObjectError('unknown_type', `No existe el tipo de objeto «${input?.type}».`);

	const isNew = input.id === undefined || input.id === null;
	/** @type {import('./read.js').StoredObject | null} */
	let current = null;
	if (!isNew) {
		if (!Number.isSafeInteger(input.id)) throw new ObjectError('invalid', 'Id inválido.');
		const row = await db
			.prepare(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1`)
			.bind(input.id)
			.first();
		if (!row) throw new ObjectError('not_found', 'Ese objeto ya no existe.', { status: 404 });
		current = rowToObject(row);
		if (current.type !== def.type) {
			throw new ObjectError('invalid', 'Todavía no se puede cambiar el tipo de un objeto.');
		}
		if (!Number.isSafeInteger(input.version)) {
			throw new ObjectError('invalid', 'Falta la versión que estabas editando.');
		}
		if (input.version !== current.version) {
			throw new VersionConflictError(
				current.id,
				/** @type {number} */ (input.version),
				current.version
			);
		}
	}

	/** @type {import('./fields.js').FieldError[]} */
	const errors = [];
	const title = String(input.title ?? current?.title ?? '').trim();
	if (!title) errors.push({ path: 'title', message: 'Falta el título.' });
	else if (title.length > TITLE_MAX) {
		errors.push({ path: 'title', message: `El título es demasiado largo (máximo ${TITLE_MAX}).` });
	}
	const slug = String(input.slug ?? current?.slug ?? slugify(title)).trim();
	if (!slug) errors.push({ path: 'slug', message: 'Falta la dirección de la página.' });
	else if (slug.length > SLUG_MAX || !SLUG.test(slug)) {
		errors.push({
			path: 'slug',
			message:
				'La dirección solo puede tener letras minúsculas sin tildes, números y guiones (máximo 100).'
		});
	}
	const visibility = input.visibility ?? current?.visibility ?? DEFAULT_VISIBILITY;
	if (!VISIBILITIES.includes(visibility)) {
		errors.push({ path: 'visibility', message: 'Visibilidad inválida.' });
	}
	const validated = validateData(def, input.data ?? current?.data ?? {});
	if (!validated.ok) errors.push(...validated.errors);
	if (errors.length || !validated.ok) {
		throw new ObjectError('invalid', 'Revisá los datos marcados.', { errors });
	}

	const edges = normalizeEdges(def, input.edges, current?.id ?? null);
	await checkEdgeTargets(db, def, edges);

	const data = JSON.stringify(validated.data);
	const searchText = def.searchText?.(validated.data) ?? '';
	const deletedAt =
		input.deleted === undefined
			? (current?.deleted_at ?? null)
			: input.deleted
				? (current?.deleted_at ?? now)
				: null;
	if (isNew && deletedAt !== null) throw new ObjectError('invalid', 'No se crea algo borrado.');

	/** @type {D1PreparedStatement[]} */
	const batch = [
		db
			.prepare(
				"INSERT INTO object_types (type, origin, created_at) VALUES (?1, 'core', ?2) ON CONFLICT (type) DO NOTHING"
			)
			.bind(def.type, now)
	];
	const objectIndex = batch.length;
	if (isNew) {
		batch.push(
			db
				.prepare(
					`INSERT INTO objects (type, slug, title, data, search_text, visibility, version,
					 created_at, created_by, updated_at, updated_by)
					 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?7, ?8) RETURNING id`
				)
				.bind(def.type, slug, title, data, searchText, visibility, now, actor)
		);
	} else {
		const c = /** @type {import('./read.js').StoredObject} */ (current);
		// version = la que se editó + 1: si otro guardado ya la subió, el trigger aborta la tanda.
		batch.push(
			db
				.prepare(
					`UPDATE objects SET slug = ?2, title = ?3, data = ?4, search_text = ?5, visibility = ?6,
					 version = ?7, updated_at = ?8, updated_by = ?9, deleted_at = ?10 WHERE id = ?1 RETURNING id`
				)
				.bind(c.id, slug, title, data, searchText, visibility, c.version + 1, now, actor, deletedAt)
		);
	}

	// El id del objeto nuevo todavía no se conoce: se busca por (type, slug), que es único.
	const selfId = isNew ? '(SELECT id FROM objects WHERE type = ?1 AND slug = ?2)' : '?1';
	const selfBind = isNew ? [def.type, slug] : [/** @type {number} */ (current?.id), null];
	for (const [kind, list] of edges) {
		batch.push(
			db
				.prepare(
					`DELETE FROM edges WHERE from_id = ${selfId} AND kind = ?3
					 AND to_id NOT IN (SELECT value FROM json_each(?4))`
				)
				.bind(...selfBind, kind, JSON.stringify(list.map((e) => e.to)))
		);
		for (const edge of list) {
			batch.push(
				db
					.prepare(
						`INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
						 VALUES (${selfId}, ?3, ?4, ?5, ?6, ?7, ?8)
						 ON CONFLICT (from_id, kind, to_id) DO UPDATE SET position = excluded.position, data = excluded.data`
					)
					.bind(...selfBind, kind, edge.to, edge.position, edge.data, now, actor)
			);
		}
	}

	let results;
	try {
		results = await db.batch(batch);
	} catch (error) {
		const text = errorText(error);
		if (text.includes('objects_version_conflict')) {
			const row = await db
				.prepare('SELECT version FROM objects WHERE id = ?1')
				.bind(current?.id ?? 0)
				.first();
			throw new VersionConflictError(
				/** @type {number} */ (current?.id),
				/** @type {number} */ (input.version),
				row ? Number(row.version) : null,
				error
			);
		}
		if (text.includes('UNIQUE constraint failed: objects.type, objects.slug')) {
			throw new ObjectError(
				'slug_taken',
				`Ya hay un ${def.label.toLowerCase()} con esa dirección.`,
				{
					status: 409,
					errors: [{ path: 'slug', message: 'Esa dirección ya está usada.' }],
					cause: error
				}
			);
		}
		if (text.includes('FOREIGN KEY constraint failed')) {
			throw new ObjectError(
				'invalid_reference',
				'Una de las relaciones apunta a algo que ya no existe.',
				{
					cause: error
				}
			);
		}
		throw error;
	}

	// RETURNING y no meta.changes: D1 cuenta también lo que escriben los triggers (FTS).
	const returned = /** @type {any} */ (results[objectIndex].results?.[0]);
	if (!returned) throw new ObjectError('not_found', 'Ese objeto ya no existe.', { status: 404 });
	const id = Number(returned.id);
	const saved = await db
		.prepare(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1`)
		.bind(id)
		.first();
	if (!saved) throw new ObjectError('not_found', 'Ese objeto ya no existe.', { status: 404 });
	return rowToObject(saved);
}
