/**
 * Quién puede ver un objeto. ÚNICO lugar donde se decide: cualquier lectura de `objects` (una
 * página, un listado, la búsqueda, el sitemap, el RSS, las imágenes para compartir, un JSON…)
 * pasa por `canSee` o por `visibleWhere`, que salen de la misma tabla `VISIBLE_TO` y de la misma
 * regla de autoría (`creatorSees`).
 *
 * Reglas ("visible por defecto, oculto a pedido"):
 * - 'public': todes.
 * - 'members': personas con cuenta (y admins).
 * - 'hidden': admins y quien lo creó (`created_by`); alguien pidió que no se muestre.
 * - Borrado (`deleted_at`): nadie, salvo admins que lo piden explícitamente (para deshacer).
 * - Ante la duda (rol o visibilidad desconocidos) no se muestra.
 *
 * Solo usa imports relativos.
 */

/** @typedef {'public' | 'members' | 'hidden'} Visibility */

/**
 * Quién mira. Hoy solo hay admins (login de GitHub); las cuentas de personas llegan en la fase 2.
 *
 * @typedef {{ role: 'anon' } | { role: 'member', id: string } | { role: 'admin', id: string }} Viewer
 */

/** @type {readonly Visibility[]} */
export const VISIBILITIES = Object.freeze(['public', 'members', 'hidden']);

/** Visibilidad de un objeto nuevo. */
export const DEFAULT_VISIBILITY = /** @type {Visibility} */ ('public');

/** @type {Viewer} */
export const ANON = Object.freeze({ role: 'anon' });

/** Qué visibilidades ve cada rol. */
const VISIBLE_TO = Object.freeze({
	anon: Object.freeze(['public']),
	member: Object.freeze(['public', 'members']),
	admin: Object.freeze(['public', 'members', 'hidden'])
});

/**
 * @param {Viewer | null | undefined} viewer
 * @returns {readonly string[]}
 */
function allowedFor(viewer) {
	const role = viewer?.role;
	if (role === 'member' || role === 'admin') return VISIBLE_TO[role];
	return VISIBLE_TO.anon;
}

/** @param {Viewer | null | undefined} viewer */
export function isAdmin(viewer) {
	return viewer?.role === 'admin';
}

/**
 * Quien creó un objeto lo sigue viendo aunque esté oculto (sin ser admin). Anónimes no tienen id.
 *
 * @param {Viewer | null | undefined} viewer
 * @returns {string | null} el id que tiene que coincidir con `created_by`, o null
 */
function creatorId(viewer) {
	if (viewer?.role !== 'member' && viewer?.role !== 'admin') return null;
	return typeof viewer.id === 'string' && viewer.id ? viewer.id : null;
}

/** Visibilidades que su autore ve siempre, además de las de su rol. */
const CREATOR_SEES = Object.freeze(['hidden']);

/**
 * @param {{ visibility: string, deleted_at?: number | null, created_by?: string | null }} object
 * @param {Viewer | null | undefined} viewer
 * @param {{ includeDeleted?: boolean }} [options] solo tiene efecto para admins
 */
export function canSee(object, viewer, { includeDeleted = false } = {}) {
	if (object.deleted_at != null && !(includeDeleted && isAdmin(viewer))) return false;
	if (allowedFor(viewer).includes(object.visibility)) return true;
	const id = creatorId(viewer);
	return id !== null && CREATOR_SEES.includes(object.visibility) && object.created_by === id;
}

/**
 * La misma regla que `canSee`, como condición SQL para `WHERE`. Las visibilidades salen de las
 * constantes de este archivo (nunca del pedido); el id de quien mira va como parámetro.
 *
 * Usa `?` sin número: la consulta que la incluye tiene que usar también `?` sin número y pasar
 * `params` en el lugar que corresponde.
 *
 * @param {Viewer | null | undefined} viewer
 * @param {string} [alias] nombre o alias de la tabla `objects` en la consulta
 * @param {{ includeDeleted?: boolean }} [options]
 * @returns {{ sql: string, params: string[] }}
 */
export function visibleWhere(viewer, alias = 'objects', { includeDeleted = false } = {}) {
	if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`alias inválido: ${alias}`);
	const allowed = allowedFor(viewer);
	const list = allowed.map((v) => `'${v}'`).join(', ');
	const deleted = includeDeleted && isAdmin(viewer) ? '' : `${alias}.deleted_at IS NULL AND `;
	const id = creatorId(viewer);
	const extra = id === null ? [] : CREATOR_SEES.filter((v) => !allowed.includes(v));
	if (!extra.length) return { sql: `(${deleted}${alias}.visibility IN (${list}))`, params: [] };
	const extraList = extra.map((v) => `'${v}'`).join(', ');
	return {
		sql: `(${deleted}(${alias}.visibility IN (${list}) OR (${alias}.visibility IN (${extraList}) AND ${alias}.created_by = ?)))`,
		params: [/** @type {string} */ (id)]
	};
}
