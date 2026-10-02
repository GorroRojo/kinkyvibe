/**
 * Consultas en tanda: varias consultas que no dependen entre sí van a D1 en una sola ida
 * (`db.batch`), en vez de una ida por consulta. Cada consulta es un {@link BatchQuery}: sus
 * sentencias, cómo leer lo que devuelven y qué dar si falla.
 *
 * En D1 una tanda es una transacción: si una sentencia falla (por ejemplo, porque a la base le falta
 * la tabla de una migración), se deshace toda. Entonces cada consulta se vuelve a correr sola, con
 * su propio respaldo: una consulta rota no se lleva puestas a las demás, como cuando iban sueltas.
 * Con la base sana es siempre una sola ida.
 */
import { logDBError } from './index.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('@cloudflare/workers-types').D1Result<Record<string, unknown>>} D1Result */

/**
 * Una consulta lista para ir en tanda.
 * - `statements`: las sentencias (puede no haber ninguna: entonces `read([])` da el resultado).
 * - `read`: arma el resultado con lo que devolvió cada sentencia, en el mismo orden.
 * - `fallback`: lo que da sin base o si falla (y lo loguea con `what`).
 * - `alone`: cómo correrla sola, si no alcanza con correr sus sentencias (por ejemplo, para mirar
 *   antes si la tabla existe).
 * @template T
 * @typedef {{
 *   what: string,
 *   fallback: T,
 *   statements: (db: D1Database) => D1PreparedStatement[],
 *   read: (results: D1Result[]) => T | Promise<T>,
 *   alone?: (db: D1Database) => Promise<T>
 * }} BatchQuery
 */

/**
 * Las filas que devolvió la sentencia `i`.
 * @param {D1Result[]} results
 * @param {number} [i]
 * @returns {Record<string, unknown>[]}
 */
export function rowsOf(results, i = 0) {
	return results[i]?.results ?? [];
}

/**
 * Corre una consulta sola. Sin base, o si falla, su `fallback`.
 *
 * @template T
 * @param {D1Database | null | undefined} db
 * @param {BatchQuery<T>} query
 * @returns {Promise<T>}
 */
export async function runQuery(db, query) {
	if (!db) return query.fallback;
	try {
		if (query.alone) return await query.alone(db);
		const statements = query.statements(db);
		const results =
			statements.length === 0
				? []
				: statements.length === 1
					? [await statements[0].all()]
					: await db.batch(statements);
		return await query.read(/** @type {D1Result[]} */ (results));
	} catch (error) {
		logDBError(query.what, error);
		return query.fallback;
	}
}

/**
 * Lee lo que le tocó a una consulta de la tanda.
 * @template T
 * @param {BatchQuery<T>} query
 * @param {D1Result[]} results
 * @returns {Promise<T>}
 */
async function readSafely(query, results) {
	try {
		return await query.read(results);
	} catch (error) {
		logDBError(query.what, error);
		return query.fallback;
	}
}

/**
 * Corre varias consultas en una sola ida a la base y devuelve cada resultado con su nombre. Si la
 * tanda falla, cada una sola (a la par), cada una con su respaldo.
 *
 * @template {Record<string, BatchQuery<any>>} Q
 * @param {D1Database | null | undefined} db
 * @param {Q} queries
 * @returns {Promise<{ [K in keyof Q]: Q[K] extends BatchQuery<infer T> ? T : never }>}
 */
export async function runQueries(db, queries) {
	const names = Object.keys(queries);
	const list = names.map((name) => queries[name]);
	/** @type {unknown[]} */
	let values;
	if (!db) {
		values = list.map((q) => q.fallback);
	} else {
		/** @type {D1PreparedStatement[][] | null} */
		let statements = null;
		try {
			statements = list.map((q) => q.statements(db));
		} catch {
			statements = null;
		}
		/** @type {D1Result[] | null} */
		let results = null;
		const flat = statements?.flat() ?? [];
		if (flat.length) {
			try {
				results = /** @type {D1Result[]} */ (await db.batch(flat));
			} catch {
				results = null; // cada una sola, abajo
			}
		}
		if (statements && (results || !flat.length)) {
			const sizes = statements.map((s) => s.length);
			const all = results ?? [];
			let at = 0;
			values = await Promise.all(
				list.map((q, i) => readSafely(q, all.slice(at, (at += sizes[i]))))
			);
		} else {
			values = await Promise.all(list.map((q) => runQuery(db, q)));
		}
	}
	return /** @type {any} */ (Object.fromEntries(names.map((name, i) => [name, values[i]])));
}

/**
 * Junta varias consultas en una: van en la misma tanda, pero cada parte conserva su respaldo (si
 * una falla, las otras dan lo suyo), y `join` arma el resultado con lo de todas.
 *
 * @template {BatchQuery<any>[]} P
 * @template T
 * @param {string} what
 * @param {[...P]} parts
 * @param {(values: { [K in keyof P]: P[K] extends BatchQuery<infer V> ? V : never }) => T} join
 * @returns {BatchQuery<T>}
 */
export function combineQueries(what, parts, join) {
	/** @type {number[]} */
	let sizes = [];
	const joinAny = /** @type {(values: unknown[]) => T} */ (join);
	return {
		what,
		fallback: joinAny(parts.map((p) => p.fallback)),
		statements: (db) => {
			const each = parts.map((p) => p.statements(db));
			sizes = each.map((s) => s.length);
			return each.flat();
		},
		read: async (results) => {
			let at = 0;
			return joinAny(
				await Promise.all(parts.map((p, i) => readSafely(p, results.slice(at, (at += sizes[i])))))
			);
		},
		alone: async (db) => joinAny(await Promise.all(parts.map((p) => runQuery(db, p))))
	};
}

/**
 * La misma consulta, con su resultado pasado por `fn` (también el respaldo).
 *
 * @template T, U
 * @param {BatchQuery<T>} query
 * @param {(value: T) => U} fn
 * @returns {BatchQuery<U>}
 */
export function mapQuery(query, fn) {
	return {
		what: query.what,
		fallback: fn(query.fallback),
		statements: query.statements,
		read: async (results) => fn(await query.read(results)),
		alone: async (db) => fn(await runQuery(db, query))
	};
}
