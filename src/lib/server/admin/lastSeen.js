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
export async function touchLastSeen(db, adminId, now = Date.now()) {
	if (!db || !validId(adminId)) return null;
	try {
		const row = await db
			.prepare('SELECT seen_at, last_at FROM admin_last_seen WHERE admin_id = ?1')
			.bind(adminId)
			.first();
		if (!row) {
			const since = now - FIRST_VISIT_WINDOW_MS;
			await db
				.prepare('INSERT INTO admin_last_seen (admin_id, seen_at, last_at) VALUES (?1, ?2, ?3)')
				.bind(adminId, since, now)
				.run();
			return { since, first: true };
		}
		const lastAt = Number(row.last_at);
		// Visita nueva: las novedades arrancan donde terminó la visita anterior.
		const since = now - lastAt > VISIT_GAP_MS ? lastAt : Number(row.seen_at);
		await db
			.prepare('UPDATE admin_last_seen SET seen_at = ?2, last_at = ?3 WHERE admin_id = ?1')
			.bind(adminId, since, now)
			.run();
		return { since, first: false };
	} catch (error) {
		logDBError('última visita del panel', error);
		return null;
	}
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
