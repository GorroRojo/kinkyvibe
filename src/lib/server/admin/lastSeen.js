/**
 * "Desde tu última visita" (Inicio del panel): cuándo miró cada admin por última vez (tabla
 * `admin_last_seen`, migración 0007).
 *
 * - `touchLastSeen` se llama al abrir el Inicio: devuelve desde cuándo mostrar novedades y anota
 *   la visita. Recargar la página no borra las novedades: una visita nueva empieza recién después
 *   de {@link VISIT_GAP_MS} sin abrir el Inicio.
 * - `markSeen` ("Marcar como visto") pone el corte en ahora.
 *
 * Nunca tira error: sin base de datos (o sin la tabla) devuelve `null` y el Inicio no muestra la
 * sección.
 */
import { logDBError } from '$lib/server/db';
import { rowsOf, runQuery } from '$lib/server/db/batch.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Cuánto tiempo sin abrir el Inicio hace falta para que cuente como una visita nueva. */
export const VISIT_GAP_MS = 30 * 60 * 1000;
/** Primera visita: se muestran las novedades de los últimos 7 días. */
export const FIRST_VISIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** @param {unknown} id */
const validId = (id) => typeof id === 'number' && Number.isSafeInteger(id);

/**
 * Anota que le admin abrió el Inicio y devuelve desde cuándo mostrarle novedades.
 *
 * @param {D1Database | null | undefined} db
 * @param {number | undefined} adminId id numérico de GitHub
 * @param {number} [now]
 * @returns {Promise<{ since: number, first: boolean } | null>}
 */
export function touchLastSeen(db, adminId, now = Date.now()) {
	return runQuery(db, touchLastSeenQuery(adminId, now));
}

/**
 * {@link touchLastSeen} para correr en una tanda (`runQueries`): una sola ida a la base. Lee la
 * fila y la anota en la misma tanda; la nueva fila se calcula en SQL igual que `since`.
 *
 * @param {number | undefined} adminId id numérico de GitHub
 * @param {number} now
 * @returns {import('$lib/server/db/batch.js').BatchQuery<{ since: number, first: boolean } | null>}
 */
export function touchLastSeenQuery(adminId, now) {
	const valid = validId(adminId);
	return {
		what: 'última visita del panel',
		fallback: null,
		statements: (db) =>
			valid
				? [
						db
							.prepare('SELECT seen_at, last_at FROM admin_last_seen WHERE admin_id = ?1')
							.bind(adminId),
						// Sin fila: las novedades de los últimos 7 días. Visita nueva (más de VISIT_GAP_MS
						// sin abrir el Inicio): arrancan donde terminó la anterior. Si no, siguen igual.
						db
							.prepare(
								`INSERT INTO admin_last_seen (admin_id, seen_at, last_at) VALUES (?1, ?2, ?3)
								ON CONFLICT (admin_id) DO UPDATE SET
									seen_at = CASE WHEN ?3 - admin_last_seen.last_at > ?4
										THEN admin_last_seen.last_at ELSE admin_last_seen.seen_at END,
									last_at = ?3`
							)
							.bind(adminId, now - FIRST_VISIT_WINDOW_MS, now, VISIT_GAP_MS)
					]
				: [],
		read: (results) => {
			if (!valid) return null;
			const row = rowsOf(results)[0];
			if (!row) return { since: now - FIRST_VISIT_WINDOW_MS, first: true };
			const lastAt = Number(row.last_at);
			// Visita nueva: las novedades arrancan donde terminó la visita anterior.
			const since = now - lastAt > VISIT_GAP_MS ? lastAt : Number(row.seen_at);
			return { since, first: false };
		}
	};
}

/**
 * "Marcar como visto": las novedades empiezan de nuevo desde ahora.
 *
 * @param {D1Database | null | undefined} db
 * @param {number | undefined} adminId
 * @param {number} [now]
 * @returns {Promise<boolean>}
 */
export async function markSeen(db, adminId, now = Date.now()) {
	if (!db || !validId(adminId)) return false;
	try {
		await db
			.prepare(
				`INSERT INTO admin_last_seen (admin_id, seen_at, last_at) VALUES (?1, ?2, ?2)
				ON CONFLICT (admin_id) DO UPDATE SET seen_at = ?2, last_at = ?2`
			)
			.bind(adminId, now)
			.run();
		return true;
	} catch (error) {
		logDBError('marcar como visto', error);
		return false;
	}
}
