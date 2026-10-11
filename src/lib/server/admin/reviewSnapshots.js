/**
 * «Para revisar»: la última revisión de lo que no se puede contar barato en cada página del panel
 * (`review_snapshots`, migración 0047). Hoy, solo la lista para revisar del importador de
 * contenido (Contenido → En la base): esa página la guarda cada vez que la calcula, y la fila de
 * «Para revisar» (tarjeta del Inicio y contador del menú) lee lo guardado. Ver docs/panel.md.
 *
 * Nunca rompe: sin base o sin la tabla, no se guarda nada y la fila no aparece.
 */
import { rowsOf } from '$lib/server/db/batch.js';
import { logDBError } from '$lib/server/db';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Las fuentes que se guardan (la clave de la fila). */
export const REVIEW_SNAPSHOT_SOURCES = /** @type {const} */ (['importacion']);

/** @typedef {(typeof REVIEW_SNAPSHOT_SOURCES)[number]} ReviewSnapshotSource */

/**
 * @typedef {{ count: number, detail: Record<string, number>, computedAt: number }} ReviewSnapshot
 */

/**
 * Guarda lo que encontró la última revisión de una fuente (pisa la anterior).
 *
 * @param {D1Database | null | undefined} db
 * @param {ReviewSnapshotSource} source
 * @param {{ count: number, detail?: Record<string, number> }} value
 * @param {{ by: string, now?: number }} meta
 * @returns {Promise<boolean>} si se guardó
 */
export async function saveReviewSnapshot(
	db,
	source,
	{ count, detail = {} },
	{ by, now = Date.now() }
) {
	if (!db) return false;
	try {
		await db
			.prepare(
				`INSERT INTO review_snapshots (source, count, detail, computed_at, computed_by)
				VALUES (?1, ?2, ?3, ?4, ?5)
				ON CONFLICT (source) DO UPDATE SET count = ?2, detail = ?3, computed_at = ?4,
					computed_by = ?5`
			)
			.bind(source, Math.max(0, Math.trunc(count) || 0), JSON.stringify(numbersOf(detail)), now, by)
			.run();
		return true;
	} catch (error) {
		// Sin la migración 0047: la fila de «Para revisar» todavía no existe.
		logDBError(`para revisar: guardar ${source}`, error);
		return false;
	}
}

/** Solo los números del detalle (nada más se guarda). @param {Record<string, unknown>} detail */
function numbersOf(detail) {
	/** @type {Record<string, number>} */
	const out = {};
	for (const [k, v] of Object.entries(detail ?? {})) {
		const n = Number(v);
		if (Number.isFinite(n)) out[k] = n;
	}
	return out;
}

/**
 * La última revisión de una fuente, para una tanda (`runQueries`); `null` si no hay (o sin la
 * tabla).
 *
 * @param {ReviewSnapshotSource} source
 * @returns {import('$lib/server/db/batch.js').BatchQuery<ReviewSnapshot | null>}
 */
export function reviewSnapshotQuery(source) {
	return {
		what: `para revisar: ${source}`,
		fallback: null,
		statements: (db) => [
			db
				.prepare('SELECT count, detail, computed_at FROM review_snapshots WHERE source = ?1')
				.bind(source)
		],
		read: (results) => snapshotFromRow(rowsOf(results)[0])
	};
}

/**
 * @param {Record<string, unknown> | undefined} row
 * @returns {ReviewSnapshot | null}
 */
export function snapshotFromRow(row) {
	if (!row) return null;
	/** @type {Record<string, number>} */
	let detail = {};
	try {
		detail = numbersOf(JSON.parse(String(row.detail ?? '{}')));
	} catch {
		detail = {};
	}
	return {
		count: Number(row.count ?? 0) || 0,
		detail,
		computedAt: Number(row.computed_at ?? 0)
	};
}
