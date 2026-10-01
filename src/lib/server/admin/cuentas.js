/**
 * Panel → Cuentas: las cuentas del público y sus perfiles, para admins (docs/panel.md,
 * docs/cuentas.md). Solo lecturas y las acciones de admins:
 * - prender o apagar el permiso "puede tener perfiles" de una cuenta (`accounts.can_have_profiles`,
 *   migración 0015);
 * - marcar un perfil como revisado, ocultarlo o borrarlo (suave). Ocultar y borrar van por
 *   `saveObject()`, el único camino de escritura de los objetos (docs/objetos.md).
 *
 * Les admins son superadmins de confianza: ven el mail de cada cuenta y quiénes gestionan cada
 * perfil. El registro de actividad, en cambio, no lleva mails (ver los `summary` de las rutas).
 *
 * "Para revisar": un perfil creado por una cuenta queda pendiente hasta que une admin lo marca
 * como revisado, lo oculta o lo borra. No hay columna nueva para eso: la marca es la entrada del
 * registro de actividad de esa acción ({@link PROFILE_REVIEW_ACTIONS}), que de todos modos se
 * escribe.
 */
import { getObject, saveObject, visibleWhere } from '$lib/server/objects/index.js';
import { OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { LEGACY_PROJECT_KIND, profileKindOf } from '$lib/server/objects/types/perfil.js';
import { DELETED_ACTOR, PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { logDBError } from '$lib/server/db';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */

/** Acciones del registro que cuentan como "le admin ya miró este perfil". */
export const PROFILE_REVIEW_ACTIONS = Object.freeze([
	'profile.review',
	'profile.hide',
	'profile.delete',
	// Aprobar para /amigues también es haberlo revisado (docs/amigues.md).
	'profile.approve'
]);

/** Cuántas filas muestran las listas (el buscador encuentra el resto). */
export const LIST_LIMIT = 500;

/** Prefijo de `created_by` de lo que creó una cuenta (ver `accountActor` en perfiles.js). */
const ACCOUNT_PREFIX = 'cuenta:';

/**
 * Quién mira, para las lecturas de objetos del panel.
 *
 * @param {{ login: string }} user
 * @returns {Viewer}
 */
export function adminViewer(user) {
	return { role: 'admin', id: user.login };
}

/** Viewer de admin para las consultas (el id no cambia nada en `visibleWhere` de admins). */
const ADMIN = /** @type {Viewer} */ ({ role: 'admin', id: 'panel' });

/** @param {string} s */
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** ¿Parece el id de una cuenta (UUID)? */
export function isAccountId(/** @type {unknown} */ id) {
	return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
}

/**
 * @typedef {{
 *   id: string, email: string | null, verified: boolean, hasPassword: boolean, createdAt: number,
 *   deletedAt: number | null, canHaveProfiles: boolean, profiles: number
 * }} AdminAccount
 */

/** @param {Record<string, unknown>} r @returns {AdminAccount} */
function toAdminAccount(r) {
	return {
		id: String(r.id),
		email: r.email == null ? null : String(r.email),
		verified: r.email_verified_at != null,
		hasPassword: Number(r.has_password) === 1,
		createdAt: Number(r.created_at),
		deletedAt: r.deleted_at == null ? null : Number(r.deleted_at),
		canHaveProfiles: Number(r.can_have_profiles) === 1,
		profiles: Number(r.profiles ?? 0)
	};
}

/** Perfiles vivos que gestiona cada cuenta (subconsulta; la cuenta es `a`). */
function liveProfilesCount() {
	const vis = visibleWhere(ADMIN, 'o');
	return {
		sql: `(SELECT COUNT(*) FROM profile_managers pm JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = a.id AND o.type = ? AND ${vis.sql})`,
		params: [PROFILE_TYPE, ...vis.params]
	};
}

const ACCOUNT_SELECT = `a.id, a.email, a.email_verified_at, a.password_hash IS NOT NULL AS has_password,
	a.created_at, a.deleted_at, a.can_have_profiles`;

/**
 * Las cuentas, de la más nueva a la más vieja, con la búsqueda por mail (`q`, parte del mail) y
 * los totales.
 *
 * @param {D1Database} db
 * @param {{ q?: string, limit?: number }} [opts]
 */
export async function listAccounts(db, { q = '', limit = LIST_LIMIT } = {}) {
	const needle = q.trim().toLowerCase().slice(0, 254);
	const count = liveProfilesCount();
	const where = needle ? "WHERE a.email LIKE ? ESCAPE '\\'" : '';
	const { results } = await db
		.prepare(
			`SELECT ${ACCOUNT_SELECT}, ${count.sql} AS profiles FROM accounts a ${where}
			ORDER BY a.created_at DESC, a.id LIMIT ?`
		)
		.bind(...count.params, ...(needle ? [`%${likeEscape(needle)}%`] : []), limit)
		.all();
	const totals = await db
		.prepare(
			`SELECT COUNT(*) AS total,
				COALESCE(SUM(deleted_at IS NULL), 0) AS active,
				COALESCE(SUM(deleted_at IS NULL AND can_have_profiles = 1), 0) AS with_profiles,
				COALESCE(SUM(deleted_at IS NOT NULL), 0) AS deleted
			FROM accounts`
		)
		.first();
	return {
		accounts: results.map(toAdminAccount),
		totals: {
			total: Number(totals?.total ?? 0),
			active: Number(totals?.active ?? 0),
			withProfiles: Number(totals?.with_profiles ?? 0),
			deleted: Number(totals?.deleted ?? 0)
		}
	};
}

/**
 * Una cuenta (también borrada) con sus perfiles (también borrados) y su rol en cada uno.
 *
 * @param {D1Database} db
 * @param {string} id
 */
export async function getAccountDetail(db, id) {
	if (!isAccountId(id)) return null;
	const count = liveProfilesCount();
	const row = await db
		.prepare(`SELECT ${ACCOUNT_SELECT}, ${count.sql} AS profiles FROM accounts a WHERE a.id = ?`)
		.bind(...count.params, id)
		.first();
	if (!row) return null;
	const vis = visibleWhere(ADMIN, 'o', { includeDeleted: true });
	const { results } = await db
		.prepare(
			`SELECT ${prefixed('o')}, pm.role AS role FROM profile_managers pm
			JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ? AND o.type = ? AND ${vis.sql}
			ORDER BY o.deleted_at IS NOT NULL, o.created_at DESC`
		)
		.bind(id, PROFILE_TYPE, ...vis.params)
		.all();
	return {
		account: toAdminAccount(row),
		profiles: results.map((r) => ({
			...profileSummary(rowToObject(r)),
			role: r.role === 'owner' ? 'owner' : 'manager'
		}))
	};
}

/** @param {string} alias */
function prefixed(alias) {
	return OBJECT_COLUMNS.split(', ')
		.map((c) => `${alias}.${c}`)
		.join(', ');
}

/**
 * Lo que muestran las listas de un perfil.
 *
 * @param {StoredObject} o
 */
function profileSummary(o) {
	return {
		id: o.id,
		slug: o.slug,
		title: o.title,
		kind: profileKindOf(o.data),
		visibility: o.visibility,
		createdAt: o.created_at,
		deletedAt: o.deleted_at,
		byAccount: o.created_by.startsWith(ACCOUNT_PREFIX) && o.created_by !== DELETED_ACTOR
	};
}

/**
 * Prende o apaga el permiso "puede tener perfiles". Solo cuentas vivas.
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {boolean} value
 * @param {{ now?: number }} [opts]
 * @returns {Promise<'changed' | 'unchanged' | 'not_found'>}
 */
export async function setProfilePermission(db, id, value, { now = Date.now() } = {}) {
	if (!isAccountId(id)) return 'not_found';
	const v = value ? 1 : 0;
	const res = await db
		.prepare(
			`UPDATE accounts SET can_have_profiles = ?2, updated_at = ?3
			WHERE id = ?1 AND deleted_at IS NULL AND can_have_profiles != ?2`
		)
		.bind(id, v, now)
		.run();
	if (res.meta.changes) return 'changed';
	const row = await db
		.prepare('SELECT 1 AS x FROM accounts WHERE id = ?1 AND deleted_at IS NULL')
		.bind(id)
		.first();
	return row ? 'unchanged' : 'not_found';
}

/** Condición SQL: el perfil `o` ya fue revisado por une admin (ver PROFILE_REVIEW_ACTIONS). */
const REVIEWED = `EXISTS (SELECT 1 FROM admin_audit r WHERE r.target_type = 'profile'
	AND r.target_id = CAST(o.id AS TEXT) AND r.action IN (${PROFILE_REVIEW_ACTIONS.map((a) => `'${a}'`).join(', ')}))`;

/** Condición SQL: lo creó una cuenta (no une admin, no una cuenta ya borrada). */
const BY_ACCOUNT = `o.created_by LIKE '${ACCOUNT_PREFIX}%' AND o.created_by != '${DELETED_ACTOR}'`;

/** Filtros de la lista de perfiles (`?filtro=`). */
export const PROFILE_FILTERS = Object.freeze({
	'sin-revisar': 'Para revisar',
	'sin-aprobar': 'No aparecen en Amigues',
	ocultos: 'Ocultos',
	borrados: 'Borrados'
});

/** Filtro por tipo (`?tipo=`). */
export const PROFILE_KIND_FILTERS = Object.freeze({
	persona: 'Personas',
	proyecto: 'Proyectos',
	lugar: 'Lugares'
});

/** Condición SQL: el perfil `o` está aprobado para /amigues (migración 0017). */
const APPROVED = 'EXISTS (SELECT 1 FROM profile_approvals ap WHERE ap.profile_id = o.id)';

/**
 * @typedef {ReturnType<typeof profileSummary> & {
 *   reviewed: boolean,
 *   approved: boolean,
 *   managers: { accountId: string, email: string | null, role: 'owner' | 'manager', deleted: boolean }[]
 * }} AdminProfile
 */

/**
 * Todos los perfiles (también ocultos y borrados), del más nuevo al más viejo, con quiénes los
 * gestionan y si ya se revisaron. `q` busca en el nombre y la dirección; `filter` es una clave de
 * {@link PROFILE_FILTERS}.
 *
 * @param {D1Database} db
 * @param {{ q?: string, filter?: string, kind?: string, limit?: number }} [opts] `kind`: una
 *   clave de {@link PROFILE_KIND_FILTERS}
 * @returns {Promise<{ profiles: AdminProfile[], counts: { total: number, toReview: number, hidden: number, deleted: number } }>}
 */
export async function listProfiles(
	db,
	{ q = '', filter = '', kind = '', limit = LIST_LIMIT } = {}
) {
	const vis = visibleWhere(ADMIN, 'o', { includeDeleted: true });
	/** @type {string[]} */
	const where = ['o.type = ?', vis.sql];
	/** @type {(string | number)[]} */
	const params = [PROFILE_TYPE, ...vis.params];
	const needle = q.trim().toLowerCase().slice(0, 200);
	if (needle) {
		where.push("(lower(o.title) LIKE ? ESCAPE '\\' OR o.slug LIKE ? ESCAPE '\\')");
		const like = `%${likeEscape(needle)}%`;
		params.push(like, like);
	}
	if (filter === 'sin-revisar')
		where.push(`o.deleted_at IS NULL AND ${BY_ACCOUNT} AND NOT ${REVIEWED}`);
	else if (filter === 'sin-aprobar') where.push(`o.deleted_at IS NULL AND NOT ${APPROVED}`);
	else if (filter === 'ocultos') where.push("o.deleted_at IS NULL AND o.visibility = 'hidden'");
	else if (filter === 'borrados') where.push('o.deleted_at IS NOT NULL');
	if (kind in PROFILE_KIND_FILTERS) {
		// Igual que profileKindOf(): lo desconocido es persona y el viejo `grupo` es proyecto.
		const kindSql = "COALESCE(json_extract(o.data, '$.kind'), 'persona')";
		if (kind === 'persona') where.push(`${kindSql} NOT IN ('proyecto', ?, 'lugar')`);
		else if (kind === 'proyecto') where.push(`${kindSql} IN ('proyecto', ?)`);
		else where.push(`${kindSql} = ?`);
		params.push(kind === 'lugar' ? 'lugar' : LEGACY_PROJECT_KIND);
	}
	const { results } = await db
		.prepare(
			`SELECT ${prefixed('o')}, ${REVIEWED} AS reviewed, ${APPROVED} AS approved FROM objects o
			WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC, o.id DESC LIMIT ?`
		)
		.bind(...params, limit)
		.all();
	const profiles = results.map((r) => ({
		...profileSummary(rowToObject(r)),
		reviewed: Number(r.reviewed) === 1,
		approved: Number(r.approved) === 1,
		/** @type {AdminProfile['managers']} */
		managers: []
	}));
	const managers = await managersOf(
		db,
		profiles.map((p) => p.id)
	);
	for (const p of profiles) p.managers = managers.get(p.id) ?? [];
	const all = visibleWhere(ADMIN, 'o', { includeDeleted: true });
	const counts = await db
		.prepare(
			`SELECT COUNT(*) AS total,
				COALESCE(SUM(o.deleted_at IS NULL AND ${BY_ACCOUNT} AND NOT ${REVIEWED}), 0) AS to_review,
				COALESCE(SUM(o.deleted_at IS NULL AND o.visibility = 'hidden'), 0) AS hidden,
				COALESCE(SUM(o.deleted_at IS NOT NULL), 0) AS deleted
			FROM objects o WHERE o.type = ? AND ${all.sql}`
		)
		.bind(PROFILE_TYPE, ...all.params)
		.first();
	return {
		profiles,
		counts: {
			total: Number(counts?.total ?? 0),
			toReview: Number(counts?.to_review ?? 0),
			hidden: Number(counts?.hidden ?? 0),
			deleted: Number(counts?.deleted ?? 0)
		}
	};
}

/**
 * Quiénes gestionan cada perfil (también cuentas borradas, marcadas).
 *
 * @param {D1Database} db
 * @param {number[]} ids
 */
async function managersOf(db, ids) {
	/** @type {Map<number, AdminProfile['managers']>} */
	const out = new Map();
	// De a tandas: D1 acepta hasta 100 parámetros por sentencia.
	for (let i = 0; i < ids.length; i += 90) {
		const chunk = ids.slice(i, i + 90);
		const { results } = await db
			.prepare(
				`SELECT pm.profile_id, pm.account_id, pm.role, a.email, a.deleted_at
				FROM profile_managers pm JOIN accounts a ON a.id = pm.account_id
				WHERE pm.profile_id IN (${chunk.map(() => '?').join(', ')})
				ORDER BY pm.role = 'owner' DESC, pm.created_at`
			)
			.bind(...chunk)
			.all();
		for (const r of results) {
			const id = Number(r.profile_id);
			const list = out.get(id) ?? [];
			list.push({
				accountId: String(r.account_id),
				email: r.email == null ? null : String(r.email),
				role: r.role === 'owner' ? 'owner' : 'manager',
				deleted: r.deleted_at != null
			});
			out.set(id, list);
		}
	}
	return out;
}

/**
 * Un perfil (también oculto o borrado) con todo lo que hace falta para la ficha del panel.
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {Viewer} viewer de admin
 */
export async function getProfileDetail(db, id, viewer) {
	if (!Number.isSafeInteger(id) || id <= 0) return null;
	const o = await getObject(db, { id }, viewer, { includeDeleted: true });
	if (!o || o.type !== PROFILE_TYPE) return null;
	const reviewed = await db
		.prepare(
			`SELECT r.at, r.actor_login, r.action FROM admin_audit r WHERE r.target_type = 'profile'
			AND r.target_id = ? AND r.action IN (${PROFILE_REVIEW_ACTIONS.map(() => '?').join(', ')})
			ORDER BY r.id DESC LIMIT 1`
		)
		.bind(String(o.id), ...PROFILE_REVIEW_ACTIONS)
		.first();
	const managers = (await managersOf(db, [o.id])).get(o.id) ?? [];
	// Aprobación para /amigues y dirección vieja de una ficha importada (migración 0017).
	const extra = await db
		.prepare(
			`SELECT (SELECT approved_at FROM profile_approvals WHERE profile_id = ?1) AS approved_at,
				(SELECT approved_by FROM profile_approvals WHERE profile_id = ?1) AS approved_by,
				(SELECT legacy_slug FROM profile_sources WHERE profile_id = ?1) AS legacy_slug`
		)
		.bind(o.id)
		.first()
		.catch(() => null);
	return {
		approval:
			extra?.approved_at != null
				? { at: Number(extra.approved_at), by: String(extra.approved_by) }
				: null,
		urlSlug: extra?.legacy_slug != null ? String(extra.legacy_slug) : o.slug,
		profile: {
			...profileSummary(o),
			version: o.version,
			bio: typeof o.data.bio === 'string' ? o.data.bio : '',
			pronouns: typeof o.data.pronouns === 'string' ? o.data.pronouns : '',
			links: Array.isArray(o.data.links) ? o.data.links.map(String) : [],
			showMembers: o.data.show_members === true,
			updatedAt: o.updated_at,
			// Quién lo creó o editó: una cuenta (`cuenta:<id>`), une admin (login) o una cuenta borrada.
			createdBy: o.created_by,
			updatedBy: o.updated_by
		},
		managers,
		review: reviewed
			? {
					at: Number(reviewed.at),
					by: String(reviewed.actor_login),
					action: String(reviewed.action)
				}
			: null
	};
}

/**
 * Oculta un perfil (visibilidad `hidden`: lo ven solo admins; quienes lo gestionan lo siguen
 * viendo en Mi rincón). Con `saveObject()` y la versión que se abrió.
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {number} version
 * @param {{ login: string }} user
 * @param {{ now?: number }} [opts]
 */
export function hideProfile(db, id, version, user, { now = Date.now() } = {}) {
	return saveObject(
		db,
		{ id, type: PROFILE_TYPE, version, visibility: 'hidden' },
		{ actor: user.login, now }
	);
}

/**
 * Borra un perfil (suave: `deleted_at`, se puede deshacer desde la base). Con `saveObject()` y
 * la versión que se abrió. Las filas de gestión y los edges quedan, como al borrar desde Mi rincón.
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {number} version
 * @param {{ login: string }} user
 * @param {{ now?: number }} [opts]
 */
export function deleteProfileAsAdmin(db, id, version, user, { now = Date.now() } = {}) {
	return saveObject(
		db,
		{ id, type: PROFILE_TYPE, version, deleted: true },
		{ actor: user.login, now }
	);
}

/**
 * "Para revisar" del Inicio: perfiles vivos creados por cuentas que ninguna admin revisó todavía,
 * del más viejo al más nuevo. `[]` sin base o si falla (por ejemplo, sin la migración 0014).
 *
 * @param {D1Database | null | undefined} db
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ id: number, title: string, kind: import('$lib/server/objects/types/perfil.js').ProfileKind, createdAt: number }[]>}
 */
export async function profilesToReview(db, { limit = 50 } = {}) {
	if (!db) return [];
	try {
		const vis = visibleWhere(ADMIN, 'o');
		const { results } = await db
			.prepare(
				`SELECT o.id, o.title, o.data, o.created_at FROM objects o
				WHERE o.type = ? AND ${vis.sql} AND ${BY_ACCOUNT} AND NOT ${REVIEWED}
				ORDER BY o.created_at, o.id LIMIT ?`
			)
			.bind(PROFILE_TYPE, ...vis.params, limit)
			.all();
		return results.map((r) => {
			let kind = /** @type {import('$lib/server/objects/types/perfil.js').ProfileKind} */ (
				'persona'
			);
			try {
				kind = profileKindOf(JSON.parse(String(r.data)));
			} catch {
				// datos rotos: el chequeo nocturno lo reporta
			}
			return { id: Number(r.id), title: String(r.title), kind, createdAt: Number(r.created_at) };
		});
	} catch (error) {
		logDBError('perfiles para revisar', error);
		return [];
	}
}

/**
 * Cuántos perfiles esperan revisión (contador del menú). `0` sin base o si falla.
 *
 * @param {D1Database | null | undefined} db
 */
export async function countProfilesToReview(db) {
	if (!db) return 0;
	try {
		const vis = visibleWhere(ADMIN, 'o');
		const row = await db
			.prepare(
				`SELECT COUNT(*) AS n FROM objects o
				WHERE o.type = ? AND ${vis.sql} AND ${BY_ACCOUNT} AND NOT ${REVIEWED}`
			)
			.bind(PROFILE_TYPE, ...vis.params)
			.first();
		return Number(row?.n ?? 0);
	} catch (error) {
		logDBError('contador de perfiles para revisar', error);
		return 0;
	}
}
