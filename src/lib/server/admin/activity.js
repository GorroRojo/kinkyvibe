/**
 * Consultas del visor del registro de actividad (/admin/ajustes/actividad): filtros por admin, tipo de
 * acción y objetivo, paginado por `id` y los valores posibles de cada filtro.
 *
 * `listAudit` (audit.js) filtra por admin y objetivo; acá se suma el filtro por tipo de acción
 * (`transfer`, `order.refund`...) sin cambiar esa función, que usan otras páginas.
 */
import { logDBError } from '$lib/server/db';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./audit.js').AuditEntry} AuditEntry */

/**
 * @typedef {{
 *   actor?: string,
 *   type?: string,
 *   targetType?: string,
 *   targetId?: string,
 *   before?: number,
 *   limit?: number
 * }} AuditFilters
 */

/** Nombre legible de cada familia de acciones (la parte antes del punto). */
export const ACTION_FAMILIES = /** @type {Record<string, string>} */ ({
	transfer: 'Transferencias',
	order: 'Órdenes',
	stream: 'Transmisión',
	discount: 'Códigos',
	settings: 'Ajustes',
	event: 'Eventos',
	account: 'Cuentas',
	profile: 'Perfiles'
});

/** Nombre legible de cada tipo de objetivo. */
export const TARGET_TYPES = /** @type {Record<string, string>} */ ({
	order: 'Orden',
	event: 'Evento',
	discount: 'Código',
	settings: 'Ajustes',
	account: 'Cuenta',
	profile: 'Perfil'
});

/**
 * Normaliza los filtros que llegan en la URL.
 * @param {URLSearchParams} params
 * @returns {AuditFilters}
 */
export function parseAuditFilters(params) {
	/** @param {string} k @param {number} max */
	const str = (k, max) => {
		const v = (params.get(k) ?? '').trim().slice(0, max);
		return v || undefined;
	};
	const beforeRaw = Number(params.get('antes'));
	const type = str('tipo', 80);
	return {
		actor: str('admin', 100),
		type: type && /^[a-z0-9_.-]+$/i.test(type) ? type : undefined,
		targetType: str('objeto', 40),
		targetId: str('id', 200),
		before: Number.isSafeInteger(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined
	};
}

/**
 * Los filtros como parámetros de URL (para links de paginado y el CSV).
 * @param {AuditFilters} f
 * @param {{ before?: number }} [extra]
 */
export function auditFilterQuery(f, { before } = {}) {
	const p = new URLSearchParams();
	if (f.actor) p.set('admin', f.actor);
	if (f.type) p.set('tipo', f.type);
	if (f.targetType) p.set('objeto', f.targetType);
	if (f.targetId) p.set('id', f.targetId);
	if (before) p.set('antes', String(before));
	const s = p.toString();
	return s ? `?${s}` : '';
}

/**
 * Entradas del registro con filtros, de la más nueva a la más vieja. `type` es una acción
 * exacta (`order.refund`) o una familia (`order`: todas las `order.*`).
 *
 * @param {D1Database | null | undefined} db
 * @param {AuditFilters} [filters]
 * @returns {Promise<AuditEntry[]>} `[]` sin base o si falla
 */
export async function queryAudit(db, filters = {}) {
	if (!db) return [];
	const raw = Math.floor(Number(filters.limit ?? 50));
	const limit = Number.isFinite(raw) ? Math.min(500, Math.max(1, raw)) : 50;
	/** @type {string[]} */
	const where = [];
	/** @type {(string | number)[]} */
	const args = [];
	if (Number.isSafeInteger(filters.before)) {
		where.push('id < ?');
		args.push(/** @type {number} */ (filters.before));
	}
	if (filters.actor) {
		where.push('actor_login = ?');
		args.push(filters.actor);
	}
	if (filters.type) {
		if (filters.type.includes('.')) {
			where.push('action = ?');
			args.push(filters.type);
		} else {
			where.push("(action = ? OR substr(action, 1, length(?) + 1) = ? || '.')");
			args.push(filters.type, filters.type, filters.type);
		}
	}
	if (filters.targetType) {
		where.push('target_type = ?');
		args.push(filters.targetType);
	}
	if (filters.targetId) {
		where.push('target_id = ?');
		args.push(filters.targetId);
	}
	try {
		const { results } = await db
			.prepare(
				`SELECT id, at, actor_id, actor_login, action, target_type, target_id, summary, detail
				FROM admin_audit ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
				ORDER BY id DESC LIMIT ?`
			)
			.bind(...args, limit)
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
		logDBError('registro de actividad (visor)', error);
		return [];
	}
}

/**
 * Valores para los selectores de filtro: admins y acciones que aparecen en el registro.
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<{ actors: string[], actions: string[], targetTypes: string[] }>}
 */
export async function auditFacets(db) {
	const empty = { actors: [], actions: [], targetTypes: [] };
	if (!db) return empty;
	try {
		const [actors, actions, targets] = await db.batch([
			db.prepare('SELECT DISTINCT actor_login AS v FROM admin_audit ORDER BY v LIMIT 100'),
			db.prepare('SELECT DISTINCT action AS v FROM admin_audit ORDER BY v LIMIT 200'),
			db.prepare(
				'SELECT DISTINCT target_type AS v FROM admin_audit WHERE target_type IS NOT NULL ORDER BY v LIMIT 50'
			)
		]);
		/** @param {D1Result} r */
		const vals = (r) => (r.results ?? []).map((x) => String(/** @type {any} */ (x).v));
		return { actors: vals(actors), actions: vals(actions), targetTypes: vals(targets) };
	} catch (error) {
		logDBError('filtros del registro de actividad', error);
		return empty;
	}
}

/** @typedef {import('@cloudflare/workers-types').D1Result} D1Result */

/** @param {unknown} raw */
function parseDetail(raw) {
	if (typeof raw !== 'string' || !raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
