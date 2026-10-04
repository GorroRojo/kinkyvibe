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
 * @param {{ title: string, kind?: 'persona' | 'proyecto' | 'lugar', visibility?: 'public' | 'members' | 'hidden', data?: Record<string, unknown>, approved?: boolean, actor?: string, slug?: string }} input
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

/** Dirección de objeto válida (la de saveObject). */
const OBJECT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Dirección de evento válida (la de los .md; ver `isEventSlug` en ./venues.js). */
const EVENT_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * Un evento de prueba en la base con esa dirección (la de su página), si todavía no está: «sucede
 * en» y las personas son edges del evento, así que el evento tiene que estar en la base. Una
 * dirección que no entra en `objects.slug` (mayúsculas, puntos…) va como la de un .md importado
 * (`content_sources.legacy_slug`). Una dirección inválida no crea nada (devuelve `null`).
 * `anySlug`: también una dirección inválida (para probar que no se muestra), como la de un .md.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {{ data?: Record<string, unknown>, title?: string, visibility?: 'public' | 'hidden', anySlug?: boolean }} [opts]
 * @returns {Promise<number | null>} el id del evento
 */
export async function makeEvent(
	db,
	slug,
	{ data = {}, title, visibility = 'public', anySlug = false } = {}
) {
	if (typeof slug !== 'string' || !(anySlug || EVENT_SLUG.test(slug))) return null;
	const existing = await db
		.prepare(
			`SELECT o.id FROM objects o
			LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = 'calendario'
			WHERE o.type = 'evento' AND (s.legacy_slug = ?1 OR (s.legacy_slug IS NULL AND o.slug = ?1))`
		)
		.bind(slug)
		.first();
	if (existing) return Number(existing.id);
	const legacy = !OBJECT_SLUG.test(slug);
	const objectSlug = legacy
		? `${
				slug
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-+|-+$/g, '') || 'evento'
			}-md`
		: slug;
	const now = Date.now();
	const saved = await saveObject(
		db,
		{
			type: 'evento',
			slug: objectSlug,
			title: title ?? `Evento ${slug}`,
			visibility,
			data: { start: '2026-11-01T20:00-03:00', ...data }
		},
		{
			actor: 'admin-de-prueba',
			now,
			also: (self) =>
				legacy
					? [
							db
								.prepare(
									`INSERT INTO content_sources (object_id, category, legacy_slug, source_hash,
										imported_version, imported_at, updated_at)
									SELECT id, 'calendario', ?3, ?4, 1, ?5, ?5 FROM objects WHERE type = ?1 AND slug = ?2`
								)
								.bind(self.type, self.slug, slug, '0'.repeat(64), now)
						]
					: []
		}
	);
	return saved.id;
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
