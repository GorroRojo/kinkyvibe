/**
 * Utilidades para las pruebas de amigues y lugares (solo Node/vitest, nunca se importa desde la
 * app). Datos inventados; las fichas reales de amigues son públicas a propósito.
 */
import { saveObject } from '../objects/save.js';
import { approveNewStatement } from './approvals.js';

export { AMIGUES_DIR, readAmigueFiles } from './files.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Un perfil de prueba con saveObject() (aprobado para /amigues salvo `approved: false`).
 *
 * @param {D1Database} db
 * @param {{ title: string, kind?: 'persona' | 'grupo' | 'lugar', visibility?: 'public' | 'members' | 'hidden', data?: Record<string, unknown>, approved?: boolean, actor?: string, slug?: string }} input
 */
export async function makeProfile(
	db,
	{
		title,
		kind = 'persona',
		visibility = 'public',
		data = {},
		approved = true,
		actor = 'admin-de-prueba',
		slug
	}
) {
	const now = Date.now();
	return saveObject(
		db,
		{ type: 'perfil', title, slug, visibility, data: { kind, ...data } },
		{
			actor,
			now,
			also: (self) => (approved ? [approveNewStatement(db, self, 'admin-de-prueba', now)] : [])
		}
	);
}

/**
 * Una cuenta verificada (por defecto con el permiso "puede tener perfiles").
 *
 * @param {D1Database} db
 * @param {string} name
 * @param {{ profiles?: boolean }} [opts]
 */
export async function makeAccount(db, name, { profiles = true } = {}) {
	const id = crypto.randomUUID();
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO accounts (id, email, email_verified_at, created_at, updated_at, can_have_profiles)
			VALUES (?1, ?2, ?3, ?3, ?3, ?4)`
		)
		.bind(id, `${name}@example.com`, now, profiles ? 1 : 0)
		.run();
	return { id, email: `${name}@example.com` };
}

/**
 * Hace a una cuenta dueñe (o manager) de un perfil.
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @param {string} accountId
 * @param {'owner' | 'manager'} [role]
 */
export async function addManager(db, profileId, accountId, role = 'owner') {
	await db
		.prepare(
			'INSERT INTO profile_managers (profile_id, account_id, role, created_at) VALUES (?1, ?2, ?3, ?4)'
		)
		.bind(profileId, accountId, role, Date.now())
		.run();
}
