/**
 * Utilidades para las pruebas de amigues y lugares (solo Node/vitest, nunca se importa desde la
 * app). Datos inventados; las fichas reales de amigues son públicas a propósito.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { saveObject } from '../objects/save.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

export const AMIGUES_DIR = path.resolve('src/lib/posts/amigues');

/**
 * Las fichas .md reales del repo, como las pide `importAmigues`.
 *
 * @returns {Promise<{ legacySlug: string, raw: string }[]>}
 */
export async function readAmigueFiles() {
	const names = (await readdir(AMIGUES_DIR)).filter((f) => f.endsWith('.md')).sort();
	return Promise.all(
		names.map(async (name) => ({
			legacySlug: name.slice(0, -3),
			raw: await readFile(path.join(AMIGUES_DIR, name), 'utf8')
		}))
	);
}

/**
 * Un perfil de prueba con saveObject() (aprobado para /amigues salvo `approved: false`).
 *
 * @param {D1Database} db
 * @param {{ title: string, kind?: 'persona' | 'grupo' | 'lugar', visibility?: 'public' | 'members' | 'hidden', data?: Record<string, unknown>, approved?: boolean, actor?: string, slug?: string }} input
 */
export async function makeProfile(
	db,
	{ title, kind = 'persona', visibility = 'public', data = {}, approved = true, actor = 'admin-de-prueba', slug }
) {
	const now = Date.now();
	return saveObject(
		db,
		{ type: 'perfil', title, slug, visibility, data: { kind, ...data } },
		{
			actor,
			now,
			also: (self) =>
				approved
					? [
							db
								.prepare(
									`INSERT INTO profile_approvals (profile_id, approved_at, approved_by)
									SELECT id, ?3, 'admin-de-prueba' FROM objects WHERE type = ?1 AND slug = ?2`
								)
								.bind(self.type, self.slug, now)
						]
					: []
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
