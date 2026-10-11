/**
 * La lista de roles (B7): los fijos del código (FIXED_ROLES en src/lib/utils/personas.js) más los
 * que agregan les admins desde el panel (tabla `persona_roles`, migración 0018). Solo admins
 * agregan o sacan roles (lo controlan las rutas con requireAdmin); los fijos no se sacan.
 *
 * Sacar un rol no toca los .md que lo usan: las páginas lo siguen mostrando como está escrito y
 * el editor avisa al guardar esa publicación (ver validatePersonas). Sacar es un borrado suave
 * (`deleted_at`, migración 0049; decisión 0033): «Recuperar» de Actividad lo vuelve a poner en la
 * lista (src/lib/server/admin/deletions.js), y agregarlo de nuevo con el mismo nombre también.
 */
import { logDBError } from '$lib/server/db';
import { roleDeletionPath, softDeletionStatement } from '$lib/server/admin/deletions.js';
import {
	FIXED_ROLES,
	MAX_CUSTOM_ROLES,
	cleanRole,
	findRole,
	mergeRoles
} from '$lib/utils/personas.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Los roles agregados desde el panel (sin los sacados), en el orden en que se agregaron.
 *
 * @param {D1Database} db
 * @returns {Promise<{ name: string, createdAt: number, createdBy: string }[]>}
 */
export async function listCustomRoles(db) {
	const { results } = await db
		.prepare(
			'SELECT name, created_at, created_by FROM persona_roles WHERE deleted_at IS NULL ORDER BY created_at, name'
		)
		.all();
	return results.map((r) => ({
		name: String(r.name),
		createdAt: Number(r.created_at),
		createdBy: String(r.created_by)
	}));
}

/**
 * Todos los roles (fijos primero). Sin base, sin la migración o con un error: solo los fijos.
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<string[]>}
 */
export async function listRoles(db) {
	if (!db) return [...FIXED_ROLES];
	try {
		return mergeRoles((await listCustomRoles(db)).map((r) => r.name));
	} catch (error) {
		logDBError('roles de personas', error);
		return [...FIXED_ROLES];
	}
}

/**
 * Agrega un rol. No repite uno que ya existe (fijo o del panel, sin importar mayúsculas). Uno que
 * se había sacado vuelve (con su nombre de antes) y su borrado sale de «Recuperar».
 *
 * @param {D1Database} db
 * @param {unknown} raw
 * @param {{ by: string, now?: number }} opts
 * @returns {Promise<{ ok: true, name: string } | { ok: false, status: number, message: string }>}
 */
export async function addRole(db, raw, { by, now = Date.now() }) {
	const name = cleanRole(raw);
	if (!name) {
		return {
			ok: false,
			status: 400,
			message: 'Escribí un rol de 2 a 40 letras (letras, números, espacios y guiones).'
		};
	}
	const custom = await listCustomRoles(db);
	if (findRole(mergeRoles(custom.map((r) => r.name)), name)) {
		return { ok: false, status: 409, message: `«${name}» ya está en la lista: elegilo de ahí.` };
	}
	if (custom.length >= MAX_CUSTOM_ROLES) {
		return { ok: false, status: 400, message: `Hasta ${MAX_CUSTOM_ROLES} roles agregados.` };
	}
	const [res, , stored] = await db.batch([
		db
			.prepare(
				`INSERT INTO persona_roles (name, created_at, created_by) VALUES (?1, ?2, ?3)
				ON CONFLICT (name) DO UPDATE SET deleted_at = NULL, created_at = excluded.created_at,
					created_by = excluded.created_by
				WHERE persona_roles.deleted_at IS NOT NULL`
			)
			.bind(name, now, by),
		// Si volvió uno sacado, su borrado ya no está para recuperar.
		db
			.prepare(
				`UPDATE panel_deletions SET status = 'recuperado', restored_at = ?2, restored_by = ?3
				WHERE status = 'borrado' AND path = 'rol:' || (SELECT name FROM persona_roles WHERE name = ?1)
					AND changes() > 0`
			)
			.bind(name, now, by),
		db.prepare('SELECT name FROM persona_roles WHERE name = ?1').bind(name)
	]);
	if (!res.meta.changes)
		return { ok: false, status: 409, message: `«${name}» ya está en la lista: elegilo de ahí.` };
	const row = /** @type {{ name?: unknown } | undefined} */ (stored.results[0]);
	return { ok: true, name: String(row?.name ?? name) };
}

/**
 * Saca (borrado suave) un rol agregado desde el panel, con su fila de `panel_deletions` en la
 * MISMA tanda para «Recuperar» en Actividad. Los fijos no se sacan.
 *
 * @param {D1Database} db
 * @param {unknown} raw
 * @param {{ by?: string, now?: number }} [opts]
 * @returns {Promise<{ ok: true, name: string } | { ok: false, status: number, message: string }>}
 */
export async function removeRole(db, raw, { by = 'panel', now = Date.now() } = {}) {
	const name = cleanRole(raw);
	if (name && findRole(FIXED_ROLES, name)) {
		return { ok: false, status: 400, message: 'Los roles fijos no se pueden sacar.' };
	}
	// El nombre como está guardado (la columna no distingue mayúsculas), para «Recuperar».
	const row = name
		? await db
				.prepare('SELECT name FROM persona_roles WHERE name = ?1 AND deleted_at IS NULL')
				.bind(name)
				.first()
		: null;
	const results = row
		? await db.batch([
				db
					.prepare(
						'UPDATE persona_roles SET deleted_at = ?2 WHERE name = ?1 AND deleted_at IS NULL'
					)
					.bind(row.name, now),
				await softDeletionStatement(
					db,
					{
						kind: 'calendario',
						slug: '',
						title: String(row.name),
						path: roleDeletionPath(String(row.name)),
						object: String(row.name)
					},
					{ login: by, now }
				)
			])
		: null;
	if (!name || !results?.[0]?.meta.changes)
		return { ok: false, status: 404, message: 'Ese rol no está en la lista.' };
	return { ok: true, name };
}
