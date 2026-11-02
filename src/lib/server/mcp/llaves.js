/**
 * Llaves para rutinas del conector de Claude (docs/conector-claude.md, «Rutinas que corren
 * solas»): un token de larga duración que une admin crea en Ajustes → Admins para las rutinas
 * programadas, que corren sin nadie frente a la pantalla y no pueden volver a pasar por la
 * pantalla «¿Conectar Claude?» cuando vence la conexión de OAuth.
 *
 * - Se muestra una sola vez, al crearla. En la base queda solo su SHA-256 (tabla `mcp_llaves`,
 *   migración 0072), con un nombre, cuándo se usó por última vez y cuándo vence ({@link LLAVE_TTL_MS}).
 * - Es de le admin que la creó: vale como su token de acceso en `/mcp` (Bearer), con los mismos
 *   controles en cada pedido que un token de OAuth: el id sigue en `ADMINS`, el interruptor
 *   prendido, y fue creada después del último «Cerrar mis conexiones» de esa persona.
 * - Se revoca de a una, todas las de une admin («Cerrar mis conexiones») o todas las de todes
 *   («Cerrar las de todes»).
 */
import { adminById, bearerAdmin, validSince } from './oauth.js';
import { sha256Hex } from '$lib/server/hash.js';
import { toBase64url } from '$lib/utils/base64.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** El comienzo de toda llave (para reconocerla sin ir a la base). */
export const LLAVE_PREFIX = 'kvc1_';

/** Cuánto vale una llave desde que se crea: un año. Después, se crea otra. */
export const LLAVE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Llaves vigentes por admin, como mucho. */
export const LLAVES_MAX = 5;

/** Cada cuánto se anota «último uso» (para no escribir en cada pedido). */
const LAST_USED_STEP_MS = 60 * 1000;

const LLAVE_RE = /^kvc1_[A-Za-z0-9_-]{43}$/;

/** ¿Tiene forma de llave? @param {unknown} token */
export const looksLikeLlave = (token) => typeof token === 'string' && LLAVE_RE.test(token);

/**
 * @typedef {{
 *   id: number,
 *   name: string,
 *   createdAt: number,
 *   expiresAt: number,
 *   lastUsedAt: number | null,
 *   revokedAt: number | null
 * }} Llave
 */

/** @param {Record<string, unknown>} r @returns {Llave} */
const rowToLlave = (r) => ({
	id: Number(r.id),
	name: String(r.name),
	createdAt: Number(r.created_at),
	expiresAt: Number(r.expires_at),
	lastUsedAt: r.last_used_at == null ? null : Number(r.last_used_at),
	revokedAt: r.revoked_at == null ? null : Number(r.revoked_at)
});

/**
 * El nombre de una llave, limpio (sin caracteres de control, hasta 60), o `''`.
 * @param {unknown} v
 */
export function cleanLlaveName(v) {
	return typeof v === 'string'
		? v
				// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
				.replace(/[\u0000-\u001f\u007f]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 60)
		: '';
}

/**
 * Las llaves de une admin (también las revocadas y vencidas, más nuevas primero; hasta 20).
 * @param {D1Database} db
 * @param {number} adminId
 * @returns {Promise<Llave[]>}
 */
export async function listLlaves(db, adminId) {
	const { results } = await db
		.prepare(
			`SELECT id, name, created_at, expires_at, last_used_at, revoked_at FROM mcp_llaves
			WHERE admin_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 20`
		)
		.bind(adminId)
		.all();
	return results.map(rowToLlave);
}

/** ¿Vale todavía? (ni revocada ni vencida) @param {Llave} l @param {number} now */
export const isLive = (l, now) => l.revokedAt === null && l.expiresAt > now;

/**
 * Crea una llave para le admin. Devuelve la llave (para mostrarla UNA vez) o el motivo.
 * @param {D1Database} db
 * @param {{ id: number, login: string }} admin
 * @param {unknown} rawName
 * @param {number} [now]
 * @returns {Promise<{ ok: true, token: string, llave: Llave } | { ok: false, message: string }>}
 */
export async function createLlave(db, admin, rawName, now = Date.now()) {
	const name = cleanLlaveName(rawName);
	if (!name)
		return {
			ok: false,
			message: 'Poné un nombre para reconocerla (por ejemplo, «Rutinas de la compu»).'
		};
	if (!adminById(admin.id)) return { ok: false, message: 'Tu cuenta no puede crear llaves.' };
	const live = (await listLlaves(db, admin.id)).filter((l) => isLive(l, now));
	if (live.length >= LLAVES_MAX) {
		return {
			ok: false,
			message: `Ya tenés ${LLAVES_MAX} llaves vigentes: revocá una antes de crear otra.`
		};
	}
	const token = LLAVE_PREFIX + toBase64url(crypto.getRandomValues(new Uint8Array(32)));
	const row = await db
		.prepare(
			`INSERT INTO mcp_llaves (admin_id, name, token_hash, created_at, created_by, expires_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6)
			RETURNING id, name, created_at, expires_at, last_used_at, revoked_at`
		)
		.bind(admin.id, name, await sha256Hex(token), now, admin.login, now + LLAVE_TTL_MS)
		.first();
	return { ok: true, token, llave: rowToLlave(/** @type {Record<string, unknown>} */ (row)) };
}

/**
 * Revoca una llave de le admin (solo las suyas). `false` si no era suya o ya estaba revocada.
 * @param {D1Database} db
 * @param {{ id: number }} admin
 * @param {unknown} id
 * @param {number} [now]
 */
export async function revokeLlave(db, admin, id, now = Date.now()) {
	const n = typeof id === 'string' ? Number(id) : id;
	if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) return false;
	const r = await db
		.prepare(
			'UPDATE mcp_llaves SET revoked_at = ?3 WHERE id = ?1 AND admin_id = ?2 AND revoked_at IS NULL'
		)
		.bind(n, admin.id, now)
		.run();
	return r.meta.changes === 1;
}

/**
 * Revoca todas las llaves de une admin (con `adminId`) o las de todes (sin). Devuelve cuántas.
 * @param {D1Database} db
 * @param {number | null} adminId
 * @param {number} [now]
 */
export async function revokeAllLlaves(db, adminId, now = Date.now()) {
	const r =
		adminId === null
			? await db
					.prepare('UPDATE mcp_llaves SET revoked_at = ?1 WHERE revoked_at IS NULL')
					.bind(now)
					.run()
			: await db
					.prepare(
						'UPDATE mcp_llaves SET revoked_at = ?2 WHERE admin_id = ?1 AND revoked_at IS NULL'
					)
					.bind(adminId, now)
					.run();
	return r.meta.changes;
}

/**
 * Le admin de una llave, si vale: existe, no está revocada ni vencida, su admin sigue en `ADMINS` y
 * la creó después de su último «Cerrar mis conexiones». Anota el último uso (como mucho una vez por
 * minuto). Si no vale, `null`.
 *
 * @param {D1Database} db
 * @param {unknown} token
 * @param {number} [now]
 * @returns {Promise<{ id: number, login: string } | null>}
 */
export async function llaveAdmin(db, token, now = Date.now()) {
	if (!looksLikeLlave(token)) return null;
	const row = /** @type {Record<string, unknown> | null} */ (
		await db
			.prepare(
				`SELECT id, admin_id, name, created_at, expires_at, last_used_at, revoked_at
				FROM mcp_llaves WHERE token_hash = ?1`
			)
			.bind(await sha256Hex(/** @type {string} */ (token)))
			.first()
	);
	if (!row) return null;
	const llave = rowToLlave(row);
	if (!isLive(llave, now)) return null;
	const admin = adminById(Number(row.admin_id));
	if (!admin) return null;
	if (llave.createdAt < (await validSince(db, admin.id))) return null;
	if (llave.lastUsedAt === null || now - llave.lastUsedAt >= LAST_USED_STEP_MS) {
		await db
			.prepare('UPDATE mcp_llaves SET last_used_at = ?2 WHERE id = ?1')
			.bind(llave.id, now)
			.run();
	}
	return { id: admin.id, login: admin.login };
}

/**
 * Le admin de un pedido a `/mcp`: con una llave para rutinas o con un token de acceso de OAuth
 * (ver {@link bearerAdmin}). `null` si no trae ninguno que valga.
 *
 * @param {D1Database} db
 * @param {Request} request
 * @param {string} origin
 * @param {number} [now]
 * @returns {Promise<{ id: number, login: string, via: 'llave' | 'oauth' } | null>}
 */
export async function mcpAdmin(db, request, origin, now = Date.now()) {
	const m = /^Bearer (kvc1_[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization') ?? '');
	if (m) {
		const admin = await llaveAdmin(db, m[1], now);
		return admin ? { ...admin, via: 'llave' } : null;
	}
	const admin = await bearerAdmin(db, request, origin, now);
	return admin ? { ...admin, via: 'oauth' } : null;
}
