/**
 * La lista de roles (B7): los fijos del código (FIXED_ROLES en src/lib/utils/personas.js) más los
 * que agregan les admins desde el panel (tabla `persona_roles`, migración 0018). Solo admins
 * agregan o sacan roles (lo controlan las rutas con requireAdmin); los fijos no se sacan.
 *
 * Sacar un rol no toca los .md que lo usan: las páginas lo siguen mostrando como está escrito y
 * el editor avisa al guardar esa publicación (ver validatePersonas).
 */
import { logDBError } from '$lib/server/db';
import {
	FIXED_ROLES,
	MAX_CUSTOM_ROLES,
	cleanRole,
	findRole,
	mergeRoles
} from '$lib/utils/personas.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Los roles agregados desde el panel, en el orden en que se agregaron.
 *
 * @param {D1Database} db
 * @returns {Promise<{ name: string, createdAt: number, createdBy: string }[]>}
 */
export async function listCustomRoles(db) {
	const { results } = await db
		.prepare('SELECT name, created_at, created_by FROM persona_roles ORDER BY created_at, name')
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
 * Agrega un rol. No repite uno que ya existe (fijo o del panel, sin importar mayúsculas).
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
		return { ok: false, status: 409, message: `«${name}» ya está en la lista.` };
	}
	if (custom.length >= MAX_CUSTOM_ROLES) {
		return { ok: false, status: 400, message: `Hasta ${MAX_CUSTOM_ROLES} roles agregados.` };
	}
	const res = await db
		.prepare(
			'INSERT OR IGNORE INTO persona_roles (name, created_at, created_by) VALUES (?1, ?2, ?3)'
		)
		.bind(name, now, by)
		.run();
	if (!res.meta.changes)
		return { ok: false, status: 409, message: `«${name}» ya está en la lista.` };
	return { ok: true, name };
}

/**
 * Saca un rol agregado desde el panel. Los fijos no se sacan.
 *
 * @param {D1Database} db
 * @param {unknown} raw
 * @returns {Promise<{ ok: true, name: string } | { ok: false, status: number, message: string }>}
 */
export async function removeRole(db, raw) {
	const name = cleanRole(raw);
	if (name && findRole(FIXED_ROLES, name)) {
		return { ok: false, status: 400, message: 'Los roles fijos no se pueden sacar.' };
	}
	const res = name
		? await db.prepare('DELETE FROM persona_roles WHERE name = ?1').bind(name).run()
		: null;
	if (!res?.meta.changes)
		return { ok: false, status: 404, message: 'Ese rol no está en la lista.' };
	return { ok: true, name };
}
