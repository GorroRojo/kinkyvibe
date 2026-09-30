/**
 * Perfiles de las cuentas (cuentas parte 2, decisión A2): una cuenta, varios perfiles.
 *
 * - Perfiles de **persona**: separados entre sí y NO vinculados de forma visible. Nada de lo
 *   público ni de lo que ve otra cuenta dice que dos perfiles son de la misma cuenta.
 * - Perfiles de **grupo**: los gestionan varias cuentas. Mostrar integrantes es opcional por
 *   grupo (`show_members`); quienes gestionan NUNCA se muestran.
 *
 * Los perfiles son objetos `perfil` (src/lib/server/objects/types/perfil.js) y se escriben SOLO
 * con saveObject(). Quién gestiona qué va en `profile_managers` (migración 0014): las cuentas no
 * son objetos, así que no puede ser un edge. Integrantes de un grupo: edges `es_integrante_de`
 * desde el perfil de la persona hacia el del grupo, con `data.aceptado`.
 *
 * Reglas que hace cumplir este archivo (las páginas no deciden nada):
 * - solo quien gestiona un perfil lo ve en Mi rincón y lo edita; para cualquier otra cuenta el
 *   perfil "no existe" (mismo mensaje que si no existiera);
 * - un perfil de persona tiene una sola cuenta (su dueñe); un grupo, al menos une dueñe: nadie
 *   se va ni pierde la propiedad si es le última (sentencias condicionales, sin carreras);
 * - las invitaciones a gestionar van por mail y nunca dicen si ese mail tiene cuenta;
 * - para ser integrante de un grupo, la persona lo pide desde su perfil y el grupo lo acepta:
 *   nadie aparece en un grupo sin haberlo pedido.
 *
 * Las lecturas de "gestión" (mis perfiles, un perfil que gestiono) leen `objects` unidas a
 * `profile_managers`: la condición de acceso es esa unión, no la visibilidad (quien gestiona
 * un grupo oculto lo tiene que poder editar). Todo lo demás (lo que ve el público u otra
 * cuenta) pasa por el helper de visibilidad de los objetos.
 */
import {
	ANON,
	ObjectError,
	VersionConflictError,
	getEdges,
	getObject,
	saveObject,
	slugify
} from '$lib/server/objects/index.js';
import { OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { PROFILE_KINDS } from '$lib/server/objects/types/perfil.js';
import { emailHash, getAccount, normalizeEmail } from './accounts.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */
/** @typedef {import('$lib/server/objects/visibility.js').Visibility} Visibility */
/** @typedef {'owner' | 'manager'} ManagerRole */
/** @typedef {'persona' | 'grupo'} ProfileKind */

/**
 * @typedef {{ ok: false, status: number, message: string, errors?: Record<string, string> }} Failure
 */

export const PROFILE_TYPE = 'perfil';
export const MEMBER_EDGE = 'es_integrante_de';
/** Perfiles (vivos) que puede gestionar una cuenta. */
export const MAX_PROFILES_PER_ACCOUNT = 20;
/** Invitaciones pendientes por perfil. */
export const MAX_PENDING_INVITES = 20;
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const MESSAGES = Object.freeze({
	notFound: 'No encontramos ese perfil.',
	groupNotFound: 'No encontramos ese grupo. Revisá la dirección.',
	conflict:
		'Alguien lo cambió mientras tanto, así que no guardamos tus cambios. Abajo está la versión nueva; revisala y volvé a guardar.',
	onlyOwner: 'Eso lo puede hacer solo quien es dueñe del perfil.',
	onlyGroups: 'Eso es solo para perfiles de grupo.',
	onlyPersonas: 'Eso es solo para perfiles de persona.',
	lastOwner:
		'Sos la única persona dueña. Antes de irte, hacé dueñe a otra persona que lo gestione, o borrá el perfil.',
	lastOwnerOther: 'Tiene que quedar al menos una persona dueña.',
	personaLeave: 'Un perfil de persona no se deja: si no lo querés más, borralo.',
	tooManyProfiles: `Llegaste al máximo de ${MAX_PROFILES_PER_ACCOUNT} perfiles.`,
	tooManyInvites: `Hay demasiadas invitaciones pendientes (máximo ${MAX_PENDING_INVITES}). Cancelá alguna.`,
	badKind: 'Elegí si el perfil es de una persona o de un grupo.',
	badEmail: 'Revisá el mail: no parece una dirección válida.',
	invited:
		'Listo. Cuando esa persona entre a Mi rincón con ese mail, va a ver la invitación en Perfiles (vence en 14 días). Avisale.',
	inviteGone: 'Esa invitación ya no está: puede que haya vencido o que la hayan cancelado.',
	notManager: 'Esa persona ya no gestiona este perfil.',
	invalid: 'Revisá los datos marcados.'
});

/**
 * Cómo figura una cuenta como autora de un objeto (`created_by`, `updated_by`). Con prefijo para
 * que nunca se confunda con el login de GitHub de une admin (que no puede tener «:»). Esos
 * campos solo los ven les admins (src/lib/server/objects/read.js, `forViewer`).
 *
 * @param {string} accountId
 */
export function accountActor(accountId) {
	return `cuenta:${accountId}`;
}

/**
 * Quién mira, para las lecturas de objetos, cuando mira una cuenta del público.
 *
 * @param {string} accountId
 * @returns {Viewer}
 */
export function memberViewer(accountId) {
	return { role: 'member', id: accountActor(accountId) };
}

/**
 * @param {number} status
 * @param {string} message
 * @param {Record<string, string>} [errors]
 * @returns {Failure}
 */
function failure(status, message, errors) {
	return errors ? { ok: false, status, message, errors } : { ok: false, status, message };
}

/**
 * Traduce los errores de saveObject a lo que muestra la página.
 *
 * @param {unknown} error
 * @returns {Failure}
 */
function saveFailure(error) {
	if (error instanceof VersionConflictError) return failure(409, MESSAGES.conflict);
	if (error instanceof ObjectError) {
		/** @type {Record<string, string>} */
		const errors = {};
		for (const e of error.errors) errors[e.path.split('.')[0] || 'form'] ??= e.message;
		if (error.code === 'not_found') return failure(404, MESSAGES.notFound);
		return failure(error.status === 409 ? 409 : 400, error.message, errors);
	}
	throw error;
}

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value : '');

/**
 * Los links como los escribe la persona (uno por línea o una lista).
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function parseLinks(value) {
	const list = Array.isArray(value) ? value : text(value).split(/\r?\n/);
	return list.map((l) => text(l).trim()).filter(Boolean);
}

/**
 * @typedef {object} ProfileInput lo que se puede editar desde Mi rincón
 * @prop {string} [title] el nombre (no hay "nombre para mostrar" aparte, E1)
 * @prop {string} [bio]
 * @prop {string} [pronouns]
 * @prop {string | string[]} [links]
 * @prop {string} [visibility]
 * @prop {boolean} [show_members] solo grupos
 */

/**
 * `data` de un perfil a partir de lo que se editó. `kind` y `avatar` no se editan acá: quedan
 * como estaban.
 *
 * @param {ProfileKind} kind
 * @param {ProfileInput} input
 * @param {Record<string, unknown>} [current]
 */
function profileData(kind, input, current = {}) {
	/** @type {Record<string, unknown>} */
	const data = {
		kind,
		bio: text(input.bio),
		pronouns: text(input.pronouns),
		links: parseLinks(input.links)
	};
	if (current.avatar !== undefined) data.avatar = current.avatar;
	if (kind === 'grupo') data.show_members = input.show_members === true;
	return data;
}

/**
 * @typedef {{
 *   id: number, slug: string, title: string, kind: ProfileKind, visibility: Visibility,
 *   version: number, role: ManagerRole
 * }} MyProfile
 */

/**
 * @param {Record<string, unknown>} row fila de objects + `role`
 * @returns {MyProfile}
 */
function toMyProfile(row) {
	const o = rowToObject(row);
	return {
		id: o.id,
		slug: o.slug,
		title: o.title,
		kind: o.data.kind === 'grupo' ? 'grupo' : 'persona',
		visibility: o.visibility,
		version: o.version,
		role: row.role === 'owner' ? 'owner' : 'manager'
	};
}

const MANAGED_COLUMNS = OBJECT_COLUMNS.split(', ')
	.map((c) => `o.${c}`)
	.join(', ');

/**
 * Los perfiles que gestiona una cuenta (lectura de gestión: la condición es `profile_managers`).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<MyProfile[]>}
 */
export async function listMyProfiles(db, accountId) {
	const { results } = await db
		.prepare(
			`SELECT ${MANAGED_COLUMNS}, pm.role AS role FROM profile_managers pm
			JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ?1 AND o.type = ?2 AND o.deleted_at IS NULL
			ORDER BY o.title COLLATE NOCASE, o.id`
		)
		.bind(accountId, PROFILE_TYPE)
		.all();
	return results.map(toMyProfile);
}

/**
 * Un perfil que la cuenta gestiona, con su rol, o `null` (no existe, está borrado o no lo
 * gestiona: para la página es lo mismo).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @returns {Promise<{ profile: StoredObject, kind: ProfileKind, role: ManagerRole } | null>}
 */
export async function getManagedProfile(db, accountId, slug) {
	if (typeof slug !== 'string' || !slug) return null;
	const row = await db
		.prepare(
			`SELECT ${MANAGED_COLUMNS}, pm.role AS role FROM profile_managers pm
			JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ?1 AND o.type = ?2 AND o.slug = ?3 AND o.deleted_at IS NULL`
		)
		.bind(accountId, PROFILE_TYPE, slug)
		.first();
	if (!row) return null;
	const profile = rowToObject(row);
	return {
		profile,
		kind: profile.data.kind === 'grupo' ? 'grupo' : 'persona',
		role: row.role === 'owner' ? 'owner' : 'manager'
	};
}

/**
 * Cuántos perfiles vivos gestiona una cuenta (propios y de grupos).
 *
 * @param {D1Database} db
 * @param {string} accountId
 */
async function countMyProfiles(db, accountId) {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM profile_managers pm JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ?1 AND o.deleted_at IS NULL`
		)
		.bind(accountId)
		.first();
	return Number(row?.n ?? 0);
}

/**
 * Crea un perfil y deja a la cuenta como dueñe, en la misma tanda de saveObject(). Si la
 * dirección (sale del nombre) ya está usada, prueba con -2, -3…: así no se entera nadie de que
 * existe otro perfil (quizás oculto) con ese nombre.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {ProfileInput & { kind?: unknown }} input
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, profile: StoredObject } | Failure>}
 */
export async function createProfile(db, accountId, input, { now = Date.now() } = {}) {
	const kind = /** @type {ProfileKind} */ (input.kind);
	if (!PROFILE_KINDS.includes(kind))
		return failure(400, MESSAGES.badKind, { kind: MESSAGES.badKind });
	if (!(await getAccount(db, accountId))) return failure(404, MESSAGES.notFound);
	if ((await countMyProfiles(db, accountId)) >= MAX_PROFILES_PER_ACCOUNT) {
		return failure(400, MESSAGES.tooManyProfiles);
	}
	const title = text(input.title).trim();
	const base = slugify(title) || 'perfil';
	const data = profileData(kind, input);
	for (let attempt = 1; attempt <= 6; attempt++) {
		const slug =
			attempt === 1
				? base
				: attempt < 6
					? `${base.slice(0, 90)}-${attempt}`
					: `${base.slice(0, 80)}-${crypto.randomUUID().slice(0, 8)}`;
		try {
			const profile = await saveObject(
				db,
				{
					type: PROFILE_TYPE,
					title,
					slug,
					data,
					visibility: /** @type {Visibility} */ (input.visibility || undefined)
				},
				{
					actor: accountActor(accountId),
					now,
					also: (self) => [
						db
							.prepare(
								`INSERT INTO profile_managers (profile_id, account_id, role, created_at)
								SELECT id, ?1, 'owner', ?2 FROM objects WHERE type = ?3 AND slug = ?4`
							)
							.bind(accountId, now, self.type, self.slug)
					]
				}
			);
			return { ok: true, profile };
		} catch (error) {
			if (error instanceof ObjectError && error.code === 'slug_taken') continue;
			return saveFailure(error);
		}
	}
	return failure(409, 'No pudimos armar una dirección para ese nombre. Probá con otro.');
}

/**
 * Edita un perfil que la cuenta gestiona. `version` es la que se abrió en la página: si alguien
 * guardó en el medio, no se guarda nada y vuelve `MESSAGES.conflict` (409).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {ProfileInput & { version: number }} input
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, profile: StoredObject } | Failure>}
 */
export async function updateProfile(db, accountId, slug, input, { now = Date.now() } = {}) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	const { profile, kind } = managed;
	try {
		const saved = await saveObject(
			db,
			{
				id: profile.id,
				type: PROFILE_TYPE,
				version: input.version,
				title: text(input.title).trim(),
				data: profileData(kind, input, profile.data),
				visibility: /** @type {Visibility} */ (input.visibility || profile.visibility)
			},
			{ actor: accountActor(accountId), now }
		);
		return { ok: true, profile: saved };
	} catch (error) {
		return saveFailure(error);
	}
}

/**
 * Borra (suave, se puede deshacer desde la base) un perfil. Solo dueñes. Las filas de
 * `profile_managers` y los edges quedan, para poder deshacer; como el objeto está borrado, no
 * se ve en ningún lado.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {number} version
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function deleteProfile(db, accountId, slug, version, { now = Date.now() } = {}) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	try {
		await saveObject(
			db,
			{ id: managed.profile.id, type: PROFILE_TYPE, version, deleted: true },
			{ actor: accountActor(accountId), now }
		);
		return { ok: true };
	} catch (error) {
		return saveFailure(error);
	}
}

// ---------------------------------------------------------------------------------------------
// Quiénes gestionan un grupo. Nunca se muestra fuera de Mi rincón de quienes lo gestionan.
// ---------------------------------------------------------------------------------------------

/** Dueñes activos (cuenta no borrada) de un perfil, como subconsulta con el id en ?1. */
const ACTIVE_OWNERS = `(SELECT COUNT(*) FROM profile_managers p JOIN accounts a ON a.id = p.account_id
	WHERE p.profile_id = ?1 AND p.role = 'owner' AND a.deleted_at IS NULL)`;

/**
 * @typedef {{ accountId: string, email: string, role: ManagerRole, me: boolean }} ManagerRow
 * @typedef {{ id: string, createdAt: number, expiresAt: number }} InviteRow
 */

/**
 * Quiénes gestionan un grupo y las invitaciones pendientes. Solo para quienes lo gestionan.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, managers: ManagerRow[], invites: InviteRow[] } | Failure>}
 */
export async function listManagers(db, accountId, slug, { now = Date.now() } = {}) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	const { results } = await db
		.prepare(
			`SELECT p.account_id, p.role, a.email FROM profile_managers p
			JOIN accounts a ON a.id = p.account_id
			WHERE p.profile_id = ?1 AND a.deleted_at IS NULL
			ORDER BY p.role = 'owner' DESC, p.created_at, a.email`
		)
		.bind(managed.profile.id)
		.all();
	const { results: invites } = await db
		.prepare(
			`SELECT id, created_at, expires_at FROM profile_invites
			WHERE profile_id = ?1 AND expires_at > ?2 ORDER BY created_at`
		)
		.bind(managed.profile.id, now)
		.all();
	return {
		ok: true,
		managers: results.map((r) => ({
			accountId: String(r.account_id),
			email: String(r.email),
			role: r.role === 'owner' ? 'owner' : 'manager',
			me: r.account_id === accountId
		})),
		invites: invites.map((r) => ({
			id: String(r.id),
			createdAt: Number(r.created_at),
			expiresAt: Number(r.expires_at)
		}))
	};
}

/**
 * Invita a un mail a gestionar un grupo (solo dueñes). Responde lo mismo tenga o no cuenta ese
 * mail, y aunque ya lo gestione: no se puede usar para averiguar quién tiene cuenta. No manda
 * ningún mail (no es un canal para escribirle a cualquiera); quien invita le avisa.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {unknown} rawEmail
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, message: string } | Failure>}
 */
export async function inviteManager(db, accountId, slug, rawEmail, { now = Date.now() } = {}) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'grupo') return failure(400, MESSAGES.onlyGroups);
	if (managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	const email = normalizeEmail(rawEmail);
	if (!email) return failure(400, MESSAGES.badEmail, { email: MESSAGES.badEmail });
	const hash = await emailHash(email);
	const id = managed.profile.id;
	const pending = await db
		.prepare(
			'SELECT COUNT(*) AS n FROM profile_invites WHERE profile_id = ?1 AND expires_at > ?2 AND email_hash != ?3'
		)
		.bind(id, now, hash)
		.first();
	if (Number(pending?.n ?? 0) >= MAX_PENDING_INVITES) return failure(400, MESSAGES.tooManyInvites);
	await db.batch([
		db
			.prepare('DELETE FROM profile_invites WHERE profile_id = ?1 AND expires_at <= ?2')
			.bind(id, now),
		db
			.prepare(
				`INSERT INTO profile_invites (id, profile_id, email_hash, invited_by, created_at, expires_at)
				VALUES (?1, ?2, ?3, ?4, ?5, ?6)
				ON CONFLICT (profile_id, email_hash) DO UPDATE SET
					invited_by = excluded.invited_by, created_at = excluded.created_at,
					expires_at = excluded.expires_at`
			)
			.bind(crypto.randomUUID(), id, hash, accountId, now, now + INVITE_TTL_MS)
	]);
	return { ok: true, message: MESSAGES.invited };
}

/**
 * Cancela una invitación pendiente (solo dueñes).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {unknown} inviteId
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function cancelInvite(db, accountId, slug, inviteId) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	await db
		.prepare('DELETE FROM profile_invites WHERE id = ?1 AND profile_id = ?2')
		.bind(text(inviteId), managed.profile.id)
		.run();
	return { ok: true };
}

/**
 * Las invitaciones para el mail (verificado) de esta cuenta, con el nombre del grupo.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ id: string, title: string, expiresAt: number }[]>}
 */
export async function myInvites(db, accountId, { now = Date.now() } = {}) {
	const account = await getAccount(db, accountId);
	if (!account?.email_verified_at) return [];
	const { results } = await db
		.prepare(
			`SELECT i.id, i.expires_at, o.title FROM profile_invites i
			JOIN objects o ON o.id = i.profile_id
			WHERE i.email_hash = ?1 AND i.expires_at > ?2 AND o.deleted_at IS NULL AND o.type = ?3
			AND NOT EXISTS (SELECT 1 FROM profile_managers p WHERE p.profile_id = i.profile_id AND p.account_id = ?4)
			ORDER BY i.created_at`
		)
		.bind(await emailHash(account.email), now, PROFILE_TYPE, accountId)
		.all();
	return results.map((r) => ({
		id: String(r.id),
		title: String(r.title),
		expiresAt: Number(r.expires_at)
	}));
}

/**
 * Acepta o rechaza una invitación dirigida al mail verificado de esta cuenta.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {unknown} inviteId
 * @param {boolean} accept
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, slug: string | null } | Failure>}
 */
export async function answerInvite(db, accountId, inviteId, accept, { now = Date.now() } = {}) {
	const account = await getAccount(db, accountId);
	if (!account?.email_verified_at) return failure(404, MESSAGES.inviteGone);
	const hash = await emailHash(account.email);
	const invite = await db
		.prepare(
			`SELECT i.id, i.profile_id, o.slug, o.data FROM profile_invites i
			JOIN objects o ON o.id = i.profile_id
			WHERE i.id = ?1 AND i.email_hash = ?2 AND i.expires_at > ?3
			AND o.deleted_at IS NULL AND o.type = ?4`
		)
		.bind(text(inviteId), hash, now, PROFILE_TYPE)
		.first();
	if (!invite) return failure(404, MESSAGES.inviteGone);
	const remove = db.prepare('DELETE FROM profile_invites WHERE id = ?1').bind(invite.id);
	if (!accept) {
		await remove.run();
		return { ok: true, slug: null };
	}
	// Aceptar suma un perfil a los que gestiona: el mismo tope que al crear.
	if ((await countMyProfiles(db, accountId)) >= MAX_PROFILES_PER_ACCOUNT) {
		return failure(400, MESSAGES.tooManyProfiles);
	}
	await db.batch([
		db
			.prepare(
				`INSERT INTO profile_managers (profile_id, account_id, role, created_at)
				VALUES (?1, ?2, 'manager', ?3) ON CONFLICT (profile_id, account_id) DO NOTHING`
			)
			.bind(invite.profile_id, accountId, now),
		remove
	]);
	return { ok: true, slug: String(invite.slug) };
}

/**
 * Cambia el rol de alguien que gestiona un grupo (solo dueñes). Nunca deja al grupo sin dueñe:
 * la condición va en la misma sentencia, así dos cambios a la vez no pueden dejarlo en cero.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {unknown} targetAccountId
 * @param {unknown} role
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function setManagerRole(db, accountId, slug, targetAccountId, role) {
	if (role !== 'owner' && role !== 'manager') return failure(400, MESSAGES.invalid);
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'grupo') return failure(400, MESSAGES.onlyGroups);
	if (managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	const res = await db
		.prepare(
			`UPDATE profile_managers SET role = ?3 WHERE profile_id = ?1 AND account_id = ?2
			AND (?3 = 'owner' OR role = 'manager' OR ${ACTIVE_OWNERS} > 1)`
		)
		.bind(managed.profile.id, text(targetAccountId), role)
		.run();
	if (res.meta.changes) return { ok: true };
	return failure(
		409,
		(await isManager(db, managed.profile.id, text(targetAccountId)))
			? MESSAGES.lastOwnerOther
			: MESSAGES.notManager
	);
}

/**
 * @param {D1Database} db
 * @param {number} profileId
 * @param {string} accountId
 */
async function isManager(db, profileId, accountId) {
	const row = await db
		.prepare('SELECT 1 AS x FROM profile_managers WHERE profile_id = ?1 AND account_id = ?2')
		.bind(profileId, accountId)
		.first();
	return Boolean(row);
}

/**
 * Saca a alguien de la gestión de un grupo: une dueñe a cualquiera, cualquiera a sí misme
 * ("dejar de gestionar"). Le última dueñe no se puede ir (condición en la misma sentencia).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {unknown} targetAccountId
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function removeManager(db, accountId, slug, targetAccountId) {
	const target = text(targetAccountId);
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	const self = target === accountId;
	if (managed.kind !== 'grupo')
		return failure(400, self ? MESSAGES.personaLeave : MESSAGES.onlyGroups);
	if (!self && managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	const res = await db
		.prepare(
			`DELETE FROM profile_managers WHERE profile_id = ?1 AND account_id = ?2
			AND (role = 'manager' OR ${ACTIVE_OWNERS} > 1)`
		)
		.bind(managed.profile.id, target)
		.run();
	if (res.meta.changes) return { ok: true };
	if (!(await isManager(db, managed.profile.id, target))) return failure(409, MESSAGES.notManager);
	return failure(409, self ? MESSAGES.lastOwner : MESSAGES.lastOwnerOther);
}

/**
 * Dejar de gestionar un grupo.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 */
export function leaveProfile(db, accountId, slug) {
	return removeManager(db, accountId, slug, accountId);
}

// ---------------------------------------------------------------------------------------------
// Integrantes: edges `es_integrante_de` (persona → grupo), escritos con saveObject().
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{ to: number, data: { aceptado: boolean } }} MemberEdge
 */

/**
 * Los edges de integrante que salen de un perfil de persona (lectura de gestión).
 *
 * @param {D1Database} db
 * @param {number} personaId
 * @returns {Promise<MemberEdge[]>}
 */
async function memberEdges(db, personaId) {
	const { results } = await db
		.prepare('SELECT to_id, data FROM edges WHERE from_id = ?1 AND kind = ?2 ORDER BY position, id')
		.bind(personaId, MEMBER_EDGE)
		.all();
	return results.map((r) => ({
		to: Number(r.to_id),
		data: { aceptado: JSON.parse(String(r.data ?? '{}'))?.aceptado === true }
	}));
}

/**
 * Reescribe los edges de integrante de una persona con saveObject() (versión actual: el cambio
 * es solo de relaciones; si otro guardado se cruza, vuelve el aviso de conflicto).
 *
 * @param {D1Database} db
 * @param {StoredObject} persona
 * @param {MemberEdge[]} edges
 * @param {string} accountId quien hace el cambio
 * @param {number} now
 * @returns {Promise<{ ok: true } | Failure>}
 */
async function saveMemberEdges(db, persona, edges, accountId, now) {
	try {
		await saveObject(
			db,
			{
				id: persona.id,
				type: PROFILE_TYPE,
				version: persona.version,
				edges: { [MEMBER_EDGE]: edges }
			},
			{ actor: accountActor(accountId), now }
		);
		return { ok: true };
	} catch (error) {
		return saveFailure(error);
	}
}

/**
 * Una persona pide sumarse a un grupo (por la dirección del grupo). El grupo tiene que ser
 * visible para esta cuenta: uno oculto "no existe". Queda pendiente hasta que el grupo acepte.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} personaSlug
 * @param {unknown} groupSlug
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function requestMembership(
	db,
	accountId,
	personaSlug,
	groupSlug,
	{ now = Date.now() } = {}
) {
	const managed = await getManagedProfile(db, accountId, personaSlug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'persona') return failure(400, MESSAGES.onlyPersonas);
	const slug = slugFromInput(groupSlug);
	const group = slug
		? await getObject(db, { type: PROFILE_TYPE, slug }, memberViewer(accountId))
		: null;
	if (!group || group.data.kind !== 'grupo') {
		return failure(404, MESSAGES.groupNotFound, { group: MESSAGES.groupNotFound });
	}
	const edges = await memberEdges(db, managed.profile.id);
	if (edges.some((e) => e.to === group.id)) return { ok: true };
	return saveMemberEdges(
		db,
		managed.profile,
		[...edges, { to: group.id, data: { aceptado: false } }],
		accountId,
		now
	);
}

/**
 * Acepta "https://kinkyvibe.ar/amigues/nombre", "/amigues/nombre" o "nombre".
 *
 * @param {unknown} value
 */
function slugFromInput(value) {
	const raw = text(value)
		.trim()
		.replace(/[?#].*$/, '')
		.replace(/\/+$/, '');
	const last = raw.split('/').pop() ?? '';
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(last) ? last : '';
}

/**
 * La persona deja un grupo (o retira su pedido).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} personaSlug
 * @param {unknown} groupId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function leaveMembership(
	db,
	accountId,
	personaSlug,
	groupId,
	{ now = Date.now() } = {}
) {
	const managed = await getManagedProfile(db, accountId, personaSlug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'persona') return failure(400, MESSAGES.onlyPersonas);
	const edges = await memberEdges(db, managed.profile.id);
	const rest = edges.filter((e) => e.to !== Number(groupId));
	if (rest.length === edges.length) return { ok: true };
	return saveMemberEdges(db, managed.profile, rest, accountId, now);
}

/**
 * Los grupos de un perfil de persona, para su propia pantalla (incluye pedidos pendientes).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} personaSlug
 * @returns {Promise<{ id: number, title: string, accepted: boolean }[]>}
 */
export async function listMemberships(db, accountId, personaSlug) {
	const managed = await getManagedProfile(db, accountId, personaSlug);
	if (!managed || managed.kind !== 'persona') return [];
	const { results } = await db
		.prepare(
			`SELECT o.id, o.title, e.data FROM edges e JOIN objects o ON o.id = e.to_id
			WHERE e.from_id = ?1 AND e.kind = ?2 AND o.deleted_at IS NULL
			ORDER BY o.title COLLATE NOCASE`
		)
		.bind(managed.profile.id, MEMBER_EDGE)
		.all();
	return results.map((r) => ({
		id: Number(r.id),
		title: String(r.title),
		accepted: JSON.parse(String(r.data ?? '{}'))?.aceptado === true
	}));
}

/**
 * Integrantes y pedidos de un grupo, para quienes lo gestionan.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} groupSlug
 * @returns {Promise<{ id: number, title: string, accepted: boolean }[]>}
 */
export async function listGroupMembers(db, accountId, groupSlug) {
	const managed = await getManagedProfile(db, accountId, groupSlug);
	if (!managed || managed.kind !== 'grupo') return [];
	const { results } = await db
		.prepare(
			`SELECT o.id, o.title, e.data FROM edges e JOIN objects o ON o.id = e.from_id
			WHERE e.to_id = ?1 AND e.kind = ?2 AND o.deleted_at IS NULL
			ORDER BY o.title COLLATE NOCASE`
		)
		.bind(managed.profile.id, MEMBER_EDGE)
		.all();
	return results.map((r) => ({
		id: Number(r.id),
		title: String(r.title),
		accepted: JSON.parse(String(r.data ?? '{}'))?.aceptado === true
	}));
}

/**
 * Quien gestiona un grupo acepta un pedido o saca a une integrante. Solo toca el edge hacia SU
 * grupo, en el perfil de la persona (con saveObject, como toda escritura).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} groupSlug
 * @param {unknown} personaId
 * @param {'accept' | 'remove'} action
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function answerMember(
	db,
	accountId,
	groupSlug,
	personaId,
	action,
	{ now = Date.now() } = {}
) {
	const managed = await getManagedProfile(db, accountId, groupSlug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'grupo') return failure(400, MESSAGES.onlyGroups);
	const id = Number(personaId);
	const row = Number.isSafeInteger(id)
		? await db
				.prepare(
					`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1 AND type = ?2 AND deleted_at IS NULL
					AND EXISTS (SELECT 1 FROM edges WHERE from_id = ?1 AND kind = ?3 AND to_id = ?4)`
				)
				.bind(id, PROFILE_TYPE, MEMBER_EDGE, managed.profile.id)
				.first()
		: null;
	if (!row) return failure(404, 'Esa persona ya no está en el grupo ni lo pidió.');
	const persona = rowToObject(row);
	const edges = await memberEdges(db, persona.id);
	const next =
		action === 'accept'
			? edges.map((e) => (e.to === managed.profile.id ? { ...e, data: { aceptado: true } } : e))
			: edges.filter((e) => e.to !== managed.profile.id);
	return saveMemberEdges(db, persona, next, accountId, now);
}

// ---------------------------------------------------------------------------------------------
// Lo que ve el público o cualquier otra cuenta.
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{
 *   slug: string, title: string, kind: ProfileKind, bio: string | null, pronouns: string | null,
 *   links: string[], avatar: string | null, members: { slug: string, title: string }[] | null
 * }} PublicProfile
 */

/**
 * Un perfil como lo ve cualquiera que no lo gestiona (para la página pública que viene). Una
 * lista blanca de campos: sin ids, sin quién lo creó o editó, sin quiénes lo gestionan. Los
 * integrantes solo si el grupo eligió mostrarlos, solo les aceptades y solo los perfiles que
 * quien mira puede ver.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {Viewer | null | undefined} [viewer]
 * @returns {Promise<PublicProfile | null>}
 */
export async function getPublicProfile(db, slug, viewer = ANON) {
	const o = await getObject(db, { type: PROFILE_TYPE, slug }, viewer);
	if (!o) return null;
	const kind = o.data.kind === 'grupo' ? 'grupo' : 'persona';
	/** @type {{ slug: string, title: string }[] | null} */
	let members = null;
	if (kind === 'grupo' && o.data.show_members === true) {
		const edges = await getEdges(db, o.id, viewer, { direction: 'in', kind: MEMBER_EDGE });
		members = edges
			.filter((e) => e.data?.aceptado === true && e.object.data.kind === 'persona')
			.map((e) => ({ slug: e.object.slug, title: e.object.title }))
			.sort((a, b) => a.title.localeCompare(b.title, 'es'));
	}
	return {
		slug: o.slug,
		title: o.title,
		kind,
		bio: o.data.bio ?? null,
		pronouns: o.data.pronouns ?? null,
		links: Array.isArray(o.data.links) ? o.data.links : [],
		avatar: o.data.avatar ?? null,
		members
	};
}

// ---------------------------------------------------------------------------------------------
// Al borrar una cuenta.
// ---------------------------------------------------------------------------------------------

/**
 * Suelta los perfiles de una cuenta que se va a borrar: sus perfiles de persona se borran
 * (suave); de los grupos sale, y si era le última dueñe pasa la propiedad a quien gestiona hace
 * más tiempo o, si no queda nadie, borra el grupo (suave). Las invitaciones que mandó quedan.
 *
 * TODAVÍA NO SE LLAMA desde el borrado de cuenta (ese flujo está en otra rama): ver
 * docs/cuentas.md («Perfiles» → pendiente).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 */
export async function releaseAccountProfiles(db, accountId, { now = Date.now() } = {}) {
	const actor = accountActor(accountId);
	for (const p of await listMyProfiles(db, accountId)) {
		if (p.kind === 'grupo') {
			const others = await db
				.prepare(
					`SELECT p.account_id, p.role FROM profile_managers p JOIN accounts a ON a.id = p.account_id
					WHERE p.profile_id = ?1 AND p.account_id != ?2 AND a.deleted_at IS NULL
					ORDER BY p.role = 'owner' DESC, p.created_at`
				)
				.bind(p.id, accountId)
				.all();
			const heir = others.results[0];
			if (heir) {
				await db.batch([
					db
						.prepare(
							"UPDATE profile_managers SET role = 'owner' WHERE profile_id = ?1 AND account_id = ?2"
						)
						.bind(p.id, heir.account_id),
					db
						.prepare('DELETE FROM profile_managers WHERE profile_id = ?1 AND account_id = ?2')
						.bind(p.id, accountId)
				]);
				continue;
			}
		}
		await saveObject(
			db,
			{ id: p.id, type: PROFILE_TYPE, version: p.version, deleted: true },
			{
				actor,
				now
			}
		);
	}
}
