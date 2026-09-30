/**
 * Registro de actividad del panel (tabla `admin_audit`, migración 0004): quién cambió qué.
 * Cada acción de admin que cambia datos llama a `logAdminAction` después de hacer el cambio.
 *
 * Reglas:
 * - nunca tira error ni frena la acción (un registro que falla solo se loguea);
 * - sin base de datos no hace nada;
 * - nunca guarda DNI, tokens, secretos ni datos bancarios: `detail` pasa por `sanitizeDetail`,
 *   que saca esas claves y recorta textos largos. El resumen lo escribe el código, no la persona.
 */
import { logDBError } from '$lib/server/db';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {{
 *   id: number,
 *   at: number,
 *   actorId: number | null,
 *   actorLogin: string,
 *   action: string,
 *   targetType: string | null,
 *   targetId: string | null,
 *   summary: string,
 *   detail: unknown
 * }} AuditEntry
 */

/** Claves que nunca se guardan en `detail` (se comparan sin mayúsculas ni guiones). */
const FORBIDDEN_KEY =
	/^(dni|document|documento|token|usertoken|accesstoken|secret|password|pass|clave|cbu|cvu|alias|authorization|cookie|apikey|key|holders|buyerdni)$/;

const MAX_TEXT = 300;
const MAX_SUMMARY = 500;
const MAX_DETAIL_JSON = 4000;
const MAX_DEPTH = 4;
const MAX_KEYS = 40;

/**
 * Copia `detail` sin claves sensibles, con textos recortados y profundidad limitada.
 * Exportada para los tests.
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function sanitizeDetail(value, depth = 0) {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string')
		return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) + '…' : value;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'boolean') return value;
	if (depth >= MAX_DEPTH) return null;
	if (Array.isArray(value))
		return value.slice(0, MAX_KEYS).map((v) => sanitizeDetail(v, depth + 1));
	if (typeof value === 'object') {
		/** @type {Record<string, unknown>} */
		const out = {};
		for (const [k, v] of Object.entries(value).slice(0, MAX_KEYS)) {
			if (FORBIDDEN_KEY.test(k.toLowerCase().replace(/[-_\s]/g, ''))) continue;
			out[k] = sanitizeDetail(v, depth + 1);
		}
		return out;
	}
	return null;
}

/**
 * @param {unknown} s
 * @param {number} max
 * @returns {string | null}
 */
function text(s, max) {
	if (s === null || s === undefined || s === '') return null;
	const str = String(s)
		// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.trim();
	return str ? str.slice(0, max) : null;
}

/**
 * Anota una acción de admin. Nunca tira error; devuelve `true` si quedó guardada.
 *
 * @param {D1Database | null | undefined} db
 * @param {Pick<App.Locals, 'user'> | { user?: { id?: number, login?: string } | null } | null | undefined} locals
 *   de acá sale quién fue (`locals.user`)
 * @param {{
 *   action: string,
 *   targetType?: string | null,
 *   targetId?: string | number | null,
 *   summary: string,
 *   detail?: unknown
 * }} entry
 * @param {{ now?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function logAdminAction(db, locals, entry, { now = Date.now() } = {}) {
	if (!db) return false;
	try {
		const user = locals?.user;
		const action = text(entry?.action, 80);
		const summary = text(entry?.summary, MAX_SUMMARY);
		if (!action || !summary) {
			console.error('[audit] entrada sin action o summary:', entry?.action);
			return false;
		}
		const actorId = typeof user?.id === 'number' && Number.isSafeInteger(user.id) ? user.id : null;
		const actorLogin = text(user?.login, 100) ?? 'desconocide';
		let detail = null;
		if (entry.detail !== undefined && entry.detail !== null) {
			const json = JSON.stringify(sanitizeDetail(entry.detail));
			detail = json.length > MAX_DETAIL_JSON ? JSON.stringify({ truncated: true }) : json;
		}
		await db
			.prepare(
				`INSERT INTO admin_audit
					(at, actor_id, actor_login, action, target_type, target_id, summary, detail)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				now,
				actorId,
				actorLogin,
				action,
				text(entry.targetType, 40),
				text(entry.targetId, 200),
				summary,
				detail
			)
			.run();
		return true;
	} catch (error) {
		logDBError('registro de actividad', error);
		return false;
	}
}

/**
 * Últimas entradas del registro, de la más nueva a la más vieja.
 *
 * @param {D1Database | null | undefined} db
 * @param {{
 *   limit?: number,
 *   before?: number,
 *   targetType?: string,
 *   targetId?: string,
 *   actor?: string
 * }} [opts] `before`: solo entradas con `id` menor (para paginar: pasá el `id` de la última);
 *   `limit` entre 1 y 200 (default 50).
 * @returns {Promise<AuditEntry[]>} `[]` sin base o si falla
 */
export async function listAudit(db, { limit = 50, before, targetType, targetId, actor } = {}) {
	if (!db) return [];
	const raw = Math.floor(Number(limit));
	const n = Number.isFinite(raw) ? Math.min(200, Math.max(1, raw)) : 50;
	/** @type {string[]} */
	const where = [];
	/** @type {(string | number)[]} */
	const args = [];
	if (Number.isSafeInteger(before)) {
		where.push('id < ?');
		args.push(/** @type {number} */ (before));
	}
	if (targetType) {
		where.push('target_type = ?');
		args.push(targetType);
	}
	if (targetId) {
		where.push('target_id = ?');
		args.push(targetId);
	}
	if (actor) {
		where.push('actor_login = ?');
		args.push(actor);
	}
	try {
		const { results } = await db
			.prepare(
				`SELECT id, at, actor_id, actor_login, action, target_type, target_id, summary, detail
				 FROM admin_audit ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
				 ORDER BY id DESC LIMIT ?`
			)
			.bind(...args, n)
			.all();
		return results.map((r) => ({
			id: Number(r.id),
			at: Number(r.at),
			actorId: r.actor_id === null ? null : Number(r.actor_id),
			actorLogin: String(r.actor_login),
			action: String(r.action),
			targetType: r.target_type === null ? null : String(r.target_type),
			targetId: r.target_id === null ? null : String(r.target_id),
			summary: String(r.summary),
			detail: parseDetail(r.detail)
		}));
	} catch (error) {
		logDBError('leer el registro de actividad', error);
		return [];
	}
}

/** @param {unknown} raw */
function parseDetail(raw) {
	if (typeof raw !== 'string' || !raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
