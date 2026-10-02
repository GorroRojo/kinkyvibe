/**
 * "Es mi perfil": una cuenta pide hacerse cargo de un perfil que ya existe (una ficha de amigues
 * importada, por ejemplo). Une admin lo aprueba (la cuenta pasa a ser dueñe) o lo rechaza
 * (decisión de gorrite, 1/10). Tabla `profile_claims` (migración 0017).
 *
 * Lo que nunca se tiene que romper:
 * - solo cuentas con el permiso "puede tener perfiles" (sin él, como si el botón no existiera);
 * - una cuenta ve solo SUS pedidos: la respuesta es la misma haya o no otros pedidos o dueñes
 *   (nada dice si alguien más lo reclamó ni quién lo gestiona);
 * - límites por cuenta y por conexión, contados antes de mirar el perfil;
 * - solo se reclama un perfil que la cuenta puede ver en /amigues (aprobado, no oculto);
 * - aprobar es una sola tanda condicional: dos admins a la vez no pueden aprobar dos veces, y una
 *   persona nunca termina con dos dueñes.
 */
import { getObject } from '$lib/server/objects/index.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';
import { canHaveProfiles } from '$lib/server/cuentas/accounts.js';
import {
	MAX_PROFILES_PER_ACCOUNT,
	PROFILE_TYPE,
	memberViewer
} from '$lib/server/cuentas/perfiles.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { isApproved, managerRole } from './profiles.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Pedidos por día: por cuenta y por conexión (hash de la IP del día, como en las entradas). */
export const CLAIM_RATE_LIMITS = Object.freeze({
	account: { limit: 5, windowSeconds: 24 * 60 * 60 },
	connection: { limit: 10, windowSeconds: 24 * 60 * 60 }
});

export const CLAIM_MESSAGE_MAX = 500;

export const CLAIM_MESSAGES = Object.freeze({
	sent: 'Listo: le mandamos tu pedido a les admins. Cuando lo revisen, el perfil va a aparecer en Mi rincón → Perfiles.',
	already: 'Ya pediste este perfil. Les admins lo van a revisar pronto.',
	manager: 'Ya gestionás este perfil: lo encontrás en Mi rincón → Perfiles.',
	tooMany: 'Mandaste muchos pedidos seguidos. Probá de nuevo mañana.',
	notFound: 'No encontramos ese perfil.'
});

/**
 * @typedef {{ ok: true, message: string } | { ok: false, status: number, message: string }} ClaimResult
 */

/**
 * El estado de ESTA cuenta con un perfil: lo gestiona, tiene un pedido pendiente o nada.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} profileId
 * @returns {Promise<'manager' | 'pending' | 'none'>}
 */
export async function claimState(db, accountId, profileId) {
	if (await managerRole(db, accountId, profileId)) return 'manager';
	const row = await db
		.prepare(
			"SELECT 1 AS x FROM profile_claims WHERE profile_id = ?1 AND account_id = ?2 AND status = 'pending'"
		)
		.bind(profileId, accountId)
		.first();
	return row ? 'pending' : 'none';
}

/**
 * Pide un perfil.
 *
 * @param {D1Database} db
 * @param {{ accountId: string, profileId: number, message?: string, connection: string, now?: number }} input
 *   `connection`: un hash de la conexión (clientHash), nunca la IP
 * @returns {Promise<ClaimResult>}
 */
export async function createClaim(
	db,
	{ accountId, profileId, message = '', connection, now = Date.now() }
) {
	if (!(await canHaveProfiles(db, accountId))) {
		return { ok: false, status: 404, message: CLAIM_MESSAGES.notFound };
	}
	const perAccount = await hitRateLimit(
		db,
		`amigues:claim:a:${await sha256Hex(`amigues:account:${accountId}`)}`,
		CLAIM_RATE_LIMITS.account,
		now
	);
	const perConnection = await hitRateLimit(
		db,
		`amigues:claim:c:${connection}`,
		CLAIM_RATE_LIMITS.connection,
		now
	);
	if (!perAccount.allowed || !perConnection.allowed) {
		return { ok: false, status: 429, message: CLAIM_MESSAGES.tooMany };
	}
	if (!Number.isSafeInteger(profileId) || profileId <= 0) {
		return { ok: false, status: 404, message: CLAIM_MESSAGES.notFound };
	}
	const profile = await getObject(db, { id: profileId }, memberViewer(accountId));
	if (
		!profile ||
		profile.type !== PROFILE_TYPE ||
		profile.visibility === 'hidden' ||
		!(await isApproved(db, profileId))
	) {
		return { ok: false, status: 404, message: CLAIM_MESSAGES.notFound };
	}
	if (await managerRole(db, accountId, profileId))
		return { ok: true, message: CLAIM_MESSAGES.manager };
	const text = String(message ?? '')
		.replace(/\r\n?/g, '\n')
		.trim()
		.slice(0, CLAIM_MESSAGE_MAX);
	const r = await db
		.prepare(
			`INSERT INTO profile_claims (profile_id, account_id, message, status, created_at)
			VALUES (?1, ?2, ?3, 'pending', ?4)
			ON CONFLICT (profile_id, account_id) WHERE status = 'pending' DO NOTHING`
		)
		.bind(profileId, accountId, text, now)
		.run();
	return { ok: true, message: r.meta.changes ? CLAIM_MESSAGES.sent : CLAIM_MESSAGES.already };
}

// ---------------------------------------------------------------------------------------------
// Panel (solo admins).
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: number, profileId: number, profileTitle: string, profileSlug: string, kind: string,
 *   profileDeleted: boolean, accountId: string, email: string | null, accountDeleted: boolean,
 *   canHaveProfiles: boolean, message: string, status: 'pending' | 'approved' | 'rejected',
 *   createdAt: number, decidedAt: number | null, decidedBy: string | null
 * }} AdminClaim
 */

/** @param {Record<string, unknown>} r @returns {AdminClaim} */
export function toAdminClaim(r) {
	let kind = 'persona';
	try {
		kind = profileKindOf(JSON.parse(String(r.data)));
	} catch {
		// datos rotos: el chequeo nocturno lo reporta
	}
	return {
		id: Number(r.id),
		profileId: Number(r.profile_id),
		profileTitle: String(r.title),
		profileSlug: String(r.slug),
		kind,
		profileDeleted: r.deleted_at != null,
		accountId: String(r.account_id),
		email: r.email == null ? null : String(r.email),
		accountDeleted: r.account_deleted_at != null,
		canHaveProfiles: Number(r.can_have_profiles) === 1,
		message: String(r.message ?? ''),
		status: r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending',
		createdAt: Number(r.created_at),
		decidedAt: r.decided_at == null ? null : Number(r.decided_at),
		decidedBy: r.decided_by == null ? null : String(r.decided_by)
	};
}

const CLAIM_SELECT = `SELECT c.id, c.profile_id, c.account_id, c.message, c.status, c.created_at,
	c.decided_at, c.decided_by, o.title, o.slug, o.data, o.deleted_at, a.email,
	a.deleted_at AS account_deleted_at, a.can_have_profiles
	FROM profile_claims c JOIN objects o ON o.id = c.profile_id JOIN accounts a ON a.id = c.account_id`;

/**
 * Pedidos para el panel: los pendientes (del más viejo al más nuevo) o los de un perfil.
 *
 * @param {D1Database} db
 * @param {{ profileId?: number, status?: 'pending' | 'all', limit?: number }} [opts]
 * @returns {Promise<AdminClaim[]>}
 */
export async function listClaims(db, opts = {}) {
	const { results } = await listClaimsStatement(db, opts).all();
	return results.map(toAdminClaim);
}

/**
 * La consulta de {@link listClaims} (para correrla en una tanda; cada fila con `toAdminClaim`).
 *
 * @param {D1Database} db
 * @param {{ profileId?: number, status?: 'pending' | 'all', limit?: number }} [opts]
 */
export function listClaimsStatement(db, { profileId, status = 'pending', limit = 200 } = {}) {
	const where = [];
	/** @type {(string | number)[]} */
	const params = [];
	if (status === 'pending') where.push("c.status = 'pending'");
	if (profileId !== undefined) {
		where.push('c.profile_id = ?');
		params.push(profileId);
	}
	return db
		.prepare(
			`${CLAIM_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
			ORDER BY c.status = 'pending' DESC, c.created_at, c.id LIMIT ?`
		)
		.bind(...params, limit);
}

/**
 * Cuántos pedidos esperan (contador del menú y "Para revisar"). `0` si falla.
 *
 * @param {D1Database | null | undefined} db
 */
export async function countPendingClaims(db) {
	if (!db) return 0;
	try {
		return readPendingClaimsCount(await countPendingClaimsStatement(db).first());
	} catch {
		return 0; // sin la migración 0017
	}
}

/**
 * La consulta de {@link countPendingClaims} (para correrla en una tanda).
 * @param {D1Database} db
 */
export function countPendingClaimsStatement(db) {
	return db.prepare(
		`SELECT COUNT(*) AS n FROM profile_claims c JOIN objects o ON o.id = c.profile_id
		WHERE c.status = 'pending' AND o.deleted_at IS NULL`
	);
}

/** @param {Record<string, unknown> | null | undefined} row */
export function readPendingClaimsCount(row) {
	return Number(row?.n ?? 0);
}

/**
 * Aprueba o rechaza un pedido. Al aprobar, la cuenta pasa a ser dueñe del perfil, en la misma
 * tanda que marca el pedido (si otre admin lo resolvió en el medio, no pasa nada).
 *
 * @param {D1Database} db
 * @param {number} claimId
 * @param {boolean} approve
 * @param {{ by: string, now?: number }} opts
 * @returns {Promise<{ ok: true, claim: AdminClaim } | { ok: false, status: number, message: string }>}
 */
export async function decideClaim(db, claimId, approve, { by, now = Date.now() }) {
	const row = Number.isSafeInteger(claimId)
		? await db.prepare(`${CLAIM_SELECT} WHERE c.id = ?1`).bind(claimId).first()
		: null;
	if (!row) return { ok: false, status: 404, message: 'Ese pedido ya no existe.' };
	const claim = toAdminClaim(row);
	if (claim.status !== 'pending') {
		return { ok: false, status: 409, message: 'Ese pedido ya estaba resuelto.' };
	}
	if (!approve) {
		await db
			.prepare(
				"UPDATE profile_claims SET status = 'rejected', decided_at = ?2, decided_by = ?3 WHERE id = ?1 AND status = 'pending'"
			)
			.bind(claimId, now, by)
			.run();
		return { ok: true, claim: { ...claim, status: 'rejected', decidedAt: now, decidedBy: by } };
	}
	if (claim.profileDeleted) return { ok: false, status: 409, message: 'Ese perfil está borrado.' };
	if (claim.accountDeleted) return { ok: false, status: 409, message: 'Esa cuenta ya no existe.' };
	if (!claim.canHaveProfiles) {
		return {
			ok: false,
			status: 409,
			message:
				'Esa cuenta no tiene el permiso "puede tener perfiles": dáselo primero (Cuentas → la cuenta).'
		};
	}
	const owners = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM profile_managers pm JOIN accounts a ON a.id = pm.account_id
			WHERE pm.profile_id = ?1 AND pm.role = 'owner' AND a.deleted_at IS NULL AND pm.account_id != ?2`
		)
		.bind(claim.profileId, claim.accountId)
		.first();
	if (claim.kind === 'persona' && Number(owners?.n ?? 0) > 0) {
		return {
			ok: false,
			status: 409,
			message:
				'Ese perfil de persona ya tiene dueñe. Un perfil de persona tiene una sola cuenta: si corresponde, primero sacá a quien lo tiene.'
		};
	}
	const count = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM profile_managers pm JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ?1 AND o.deleted_at IS NULL`
		)
		.bind(claim.accountId)
		.first();
	if (Number(count?.n ?? 0) >= MAX_PROFILES_PER_ACCOUNT) {
		return {
			ok: false,
			status: 409,
			message: `Esa cuenta ya gestiona el máximo de ${MAX_PROFILES_PER_ACCOUNT} perfiles.`
		};
	}
	// Una sola tanda: marca el pedido y, solo si lo marcó esta tanda (decided_at = now y by),
	// suma a la cuenta como dueñe. Un perfil de persona solo si sigue sin otre dueñe.
	await db.batch([
		db
			.prepare(
				"UPDATE profile_claims SET status = 'approved', decided_at = ?2, decided_by = ?3 WHERE id = ?1 AND status = 'pending'"
			)
			.bind(claimId, now, by),
		db
			.prepare(
				`INSERT INTO profile_managers (profile_id, account_id, role, created_at)
				SELECT ?1, ?2, 'owner', ?3 WHERE EXISTS (SELECT 1 FROM profile_claims WHERE id = ?4
					AND status = 'approved' AND decided_at = ?3 AND decided_by = ?5)
				AND (?6 != 'persona' OR NOT EXISTS (SELECT 1 FROM profile_managers WHERE profile_id = ?1
					AND account_id != ?2))
				ON CONFLICT (profile_id, account_id) DO UPDATE SET role = 'owner'`
			)
			.bind(claim.profileId, claim.accountId, now, claimId, by, claim.kind)
	]);
	const after = await db.prepare(`${CLAIM_SELECT} WHERE c.id = ?1`).bind(claimId).first();
	const role = await db
		.prepare('SELECT role FROM profile_managers WHERE profile_id = ?1 AND account_id = ?2')
		.bind(claim.profileId, claim.accountId)
		.first();
	if (!after || toAdminClaim(after).status !== 'approved' || role?.role !== 'owner') {
		return { ok: false, status: 409, message: 'No se pudo aprobar: algo cambió mientras tanto.' };
	}
	return { ok: true, claim: toAdminClaim(after) };
}
