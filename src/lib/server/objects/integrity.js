/**
 * Chequeo de integridad de los objetos (corre todas las noches, después del backup: ver
 * src/lib/server/scheduled.js). No arregla nada: devuelve la lista de problemas.
 *
 * - `findIntegrityProblems` es PURA: recibe las filas y el registro de tipos y devuelve los
 *   problemas. Se prueba sin base.
 * - `checkObjectsIntegrity` lee las filas de D1, llama a la pura y suma el chequeo del índice de
 *   búsqueda (FTS5 'integrity-check').
 *
 * Las foreign keys de D1 ya impiden la mayoría de estos problemas; el chequeo está por si algo
 * los esquiva (una restauración a mano, un cambio de código que deja datos viejos inválidos, una
 * escritura por fuera de saveObject).
 *
 * Solo usa imports relativos.
 */
import { coreTypes, validateData } from './types/index.js';
import { VISIBILITIES } from './visibility.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {'unknown_type' | 'type_not_registered' | 'type_origin_mismatch' | 'invalid_data'
 *   | 'invalid_visibility' | 'dangling_edge' | 'invalid_edge' | 'too_many_edges' | 'orphan'
 *   | 'fts_out_of_sync'} ProblemCode
 */

/**
 * @typedef {{ code: ProblemCode, message: string, objectId?: number, edgeId?: number, type?: string, slug?: string }} Problem
 */

/**
 * @typedef {{
 *   types: { type: string, origin: string }[],
 *   objects: { id: number, type: string, slug?: string, data: string, visibility: string, deleted_at: number | null }[],
 *   edges: { id: number, from_id: number, kind: string, to_id: number }[]
 * }} IntegritySnapshot
 */

/**
 * @param {IntegritySnapshot} snapshot
 * @param {import('./types/index.js').Registry} [registry]
 * @returns {Problem[]}
 */
export function findIntegrityProblems({ types, objects, edges }, registry = coreTypes) {
	/** @type {Problem[]} */
	const problems = [];
	const typeRows = new Map(types.map((t) => [t.type, t.origin]));

	// Tipos: los 'core' de la tabla tienen que existir en código, y un tipo del panel no puede
	// llamarse igual que uno núcleo.
	for (const [type, origin] of typeRows) {
		if (origin === 'core' && !registry.get(type)) {
			problems.push({
				code: 'type_origin_mismatch',
				type,
				message: `El tipo núcleo «${type}» ya no existe en el código.`
			});
		}
		if (origin !== 'core' && registry.get(type)) {
			problems.push({
				code: 'type_origin_mismatch',
				type,
				message: `«${type}» es un tipo núcleo pero figura como ${origin}.`
			});
		}
	}

	/** @type {Map<number, IntegritySnapshot['objects'][number]>} */
	const byId = new Map();
	for (const o of objects) {
		byId.set(o.id, o);
		if (!typeRows.has(o.type)) {
			problems.push({
				code: 'type_not_registered',
				objectId: o.id,
				type: o.type,
				message: `El objeto ${o.id} es de un tipo que no está en object_types («${o.type}»).`
			});
		}
		const def = registry.get(o.type);
		if (!def) {
			// Tipos del panel: todavía no existen; cuando lleguen se validan acá.
			if (typeRows.get(o.type) !== 'panel') {
				problems.push({
					code: 'unknown_type',
					objectId: o.id,
					type: o.type,
					message: `El objeto ${o.id} es de un tipo desconocido («${o.type}»).`
				});
			}
		} else {
			let data;
			try {
				data = JSON.parse(o.data);
			} catch {
				data = undefined;
			}
			const result = data === undefined ? null : validateData(def, data);
			if (!result || !result.ok) {
				const detail =
					result && !result.ok
						? result.errors.map((e) => e.path || e.message).join(', ')
						: 'JSON roto';
				problems.push({
					code: 'invalid_data',
					objectId: o.id,
					type: o.type,
					message: `El objeto ${o.id} tiene datos inválidos para «${o.type}» (${detail}).`
				});
			}
		}
		if (!VISIBILITIES.includes(/** @type {any} */ (o.visibility))) {
			problems.push({
				code: 'invalid_visibility',
				objectId: o.id,
				message: `El objeto ${o.id} tiene una visibilidad desconocida («${o.visibility}»).`
			});
		}
	}

	/** @type {Map<string, number>} cantidad de edges por "from_id kind" */
	const counts = new Map();
	for (const e of edges) {
		const from = byId.get(e.from_id);
		const to = byId.get(e.to_id);
		if (!from || !to) {
			problems.push({
				code: 'dangling_edge',
				edgeId: e.id,
				message: `El edge ${e.id} (${e.kind}) apunta a un objeto que no existe (${!from ? e.from_id : e.to_id}).`
			});
			continue;
		}
		const key = `${e.from_id} ${e.kind}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
		const def = registry.get(from.type);
		if (!def) continue; // tipo desconocido: ya reportado
		const edgeDef = def.edges?.[e.kind];
		if (!edgeDef) {
			problems.push({
				code: 'invalid_edge',
				edgeId: e.id,
				objectId: from.id,
				message: `El edge ${e.id}: «${from.type}» no tiene la relación «${e.kind}».`
			});
		} else if (!edgeDef.to.includes(to.type)) {
			problems.push({
				code: 'invalid_edge',
				edgeId: e.id,
				objectId: from.id,
				message: `El edge ${e.id} (${e.kind}) apunta a un «${to.type}»; tiene que ser ${edgeDef.to.join(' o ')}.`
			});
		}
	}

	for (const o of objects) {
		const def = registry.get(o.type);
		for (const [kind, edgeDef] of Object.entries(def?.edges ?? {})) {
			const n = counts.get(`${o.id} ${kind}`) ?? 0;
			if (edgeDef.max !== undefined && n > edgeDef.max) {
				problems.push({
					code: 'too_many_edges',
					objectId: o.id,
					message: `El objeto ${o.id} tiene ${n} «${kind}» (máximo ${edgeDef.max}).`
				});
			}
			if (edgeDef.required && n === 0 && o.deleted_at == null) {
				problems.push({
					code: 'orphan',
					objectId: o.id,
					message: `El objeto ${o.id} («${o.type}») no tiene «${kind}» y es obligatorio.`
				});
			}
		}
	}
	// El slug ayuda a encontrar el objeto desde el panel.
	for (const p of problems) {
		const slug = p.objectId === undefined ? undefined : byId.get(p.objectId)?.slug;
		if (slug) p.slug = slug;
	}
	return problems;
}

/** Filas por consulta al leer. */
const PAGE = 1000;

/**
 * @param {D1Database} db
 * @param {string} sql sin LIMIT; ordenada por id
 */
async function readAll(db, sql) {
	/** @type {Record<string, unknown>[]} */
	const out = [];
	for (let offset = 0; ; offset += PAGE) {
		const { results } = await db.prepare(`${sql} LIMIT ${PAGE} OFFSET ${offset}`).all();
		out.push(...results);
		if (results.length < PAGE) return out;
	}
}

/**
 * Lee la base y devuelve los problemas. Carga todos los objetos en memoria: alcanza para miles;
 * si pasan de ~20.000, pasar los chequeos de edges a SQL (ver docs/objetos.md).
 *
 * @param {D1Database} db
 * @param {{ registry?: import('./types/index.js').Registry }} [options]
 * @returns {Promise<Problem[]>}
 */
export async function checkObjectsIntegrity(db, { registry = coreTypes } = {}) {
	const [types, objects, edges] = await Promise.all([
		readAll(db, 'SELECT type, origin FROM object_types ORDER BY type'),
		readAll(db, 'SELECT id, type, slug, data, visibility, deleted_at FROM objects ORDER BY id'),
		readAll(db, 'SELECT id, from_id, kind, to_id FROM edges ORDER BY id')
	]);
	const problems = findIntegrityProblems(
		/** @type {IntegritySnapshot} */ (/** @type {unknown} */ ({ types, objects, edges })),
		registry
	);
	try {
		// Compara el índice con `objects` (contenido externo). Si no coinciden, SQLite tira
		// SQLITE_CORRUPT_VTAB; se arregla con INSERT INTO objects_fts(objects_fts) VALUES('rebuild').
		await db
			.prepare("INSERT INTO objects_fts (objects_fts, rank) VALUES ('integrity-check', 1)")
			.run();
	} catch (error) {
		problems.push({
			code: 'fts_out_of_sync',
			message: `El índice de búsqueda no coincide con los objetos: ${/** @type {any} */ (error)?.message ?? error}`
		});
	}
	return problems;
}

/**
 * ¿Ya está la migración 0012? (El cron corre aunque producción todavía no la tenga.)
 *
 * @param {D1Database} db
 */
export function hasObjectsSchema(db) {
	return hasTable(db, 'objects');
}

/** Corridas que se guardan en `integrity_runs` (las más viejas se borran). */
export const KEEP_RUNS = 30;
/** Problemas que se guardan por corrida (el total va en `problem_count`). */
export const STORED_PROBLEMS = 50;

/**
 * @typedef {{ code: ProblemCode, objectId?: number, edgeId?: number, type?: string, slug?: string }} StoredProblem
 */

/**
 * @typedef {{ ranAt: number, count: number, problems: StoredProblem[] }} IntegrityRun
 */

/**
 * @param {D1Database} db
 * @param {string} name
 */
async function hasTable(db, name) {
	const row = await db
		.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?1")
		.bind(name)
		.first();
	return Boolean(row);
}

/**
 * Guarda el resultado de una corrida (también si no hubo problemas: así el panel sabe que la
 * última salió bien) y borra las viejas. Solo códigos, ids, tipo y slug: nada de datos.
 *
 * @param {D1Database} db
 * @param {Problem[]} problems
 * @param {number} [now]
 */
export async function recordIntegrityRun(db, problems, now = Date.now()) {
	/** @type {StoredProblem[]} */
	const stored = problems.slice(0, STORED_PROBLEMS).map((p) => {
		/** @type {StoredProblem} */
		const out = { code: p.code };
		if (p.objectId !== undefined) out.objectId = p.objectId;
		if (p.edgeId !== undefined) out.edgeId = p.edgeId;
		if (p.type !== undefined) out.type = p.type;
		if (p.slug !== undefined) out.slug = p.slug;
		return out;
	});
	await db.batch([
		db
			.prepare('INSERT INTO integrity_runs (ran_at, problem_count, problems) VALUES (?1, ?2, ?3)')
			.bind(now, problems.length, JSON.stringify(stored)),
		db
			.prepare(
				'DELETE FROM integrity_runs WHERE id NOT IN (SELECT id FROM integrity_runs ORDER BY id DESC LIMIT ?1)'
			)
			.bind(KEEP_RUNS)
	]);
}

/**
 * La última corrida guardada, o null si no hay ninguna o la base todavía no tiene la migración
 * 0012 (no tira error por la tabla que falta).
 *
 * @param {D1Database} db
 * @returns {Promise<IntegrityRun | null>}
 */
export async function lastIntegrityRun(db) {
	if (!(await hasTable(db, 'integrity_runs'))) return null;
	return integrityRunFromRow(await db.prepare(LAST_INTEGRITY_RUN_SQL).first());
}

/** La última corrida (sin mirar si existe la tabla: para una tanda, ver {@link lastIntegrityRun}). */
export const LAST_INTEGRITY_RUN_SQL =
	'SELECT ran_at, problem_count, problems FROM integrity_runs ORDER BY id DESC LIMIT 1';

/**
 * @param {Record<string, unknown> | null | undefined} row lo que devolvió {@link LAST_INTEGRITY_RUN_SQL}
 * @returns {IntegrityRun | null}
 */
export function integrityRunFromRow(row) {
	if (!row) return null;
	/** @type {StoredProblem[]} */
	let problems = [];
	try {
		const parsed = JSON.parse(String(row.problems));
		if (Array.isArray(parsed)) problems = parsed;
	} catch {
		problems = [];
	}
	return { ranAt: Number(row.ran_at), count: Number(row.problem_count), problems };
}
