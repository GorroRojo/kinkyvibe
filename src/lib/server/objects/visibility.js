/**
 * Quién puede ver un objeto. ÚNICO lugar donde se decide: cualquier lectura de `objects` (una
 * página, un listado, la búsqueda, el sitemap, el RSS, las imágenes para compartir, un JSON…)
 * pasa por `canSee` o por `visibleWhere`, que salen de la misma tabla `VISIBLE_TO`.
 *
 * Reglas ("visible por defecto, oculto a pedido"):
 * - 'public': todes.
 * - 'members': personas con cuenta (y admins).
 * - 'hidden': solo admins (alguien pidió que no se muestre).
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
 * @param {{ visibility: string, deleted_at?: number | null }} object
 * @param {Viewer | null | undefined} viewer
 * @param {{ includeDeleted?: boolean }} [options] solo tiene efecto para admins
 */
export function canSee(object, viewer, { includeDeleted = false } = {}) {
	if (object.deleted_at != null && !(includeDeleted && isAdmin(viewer))) return false;
	return allowedFor(viewer).includes(object.visibility);
}

/**
 * La misma regla que `canSee`, como condición SQL para `WHERE`. Los valores salen de las
 * constantes de este archivo (nunca del pedido), así que se pueden escribir en el SQL.
 *
 * @param {Viewer | null | undefined} viewer
 * @param {string} [alias] nombre o alias de la tabla `objects` en la consulta
 * @param {{ includeDeleted?: boolean }} [options]
 * @returns {string}
 */
export function visibleWhere(viewer, alias = 'objects', { includeDeleted = false } = {}) {
	if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`alias inválido: ${alias}`);
	const list = allowedFor(viewer)
		.map((v) => `'${v}'`)
		.join(', ');
	const deleted = includeDeleted && isAdmin(viewer) ? '' : `${alias}.deleted_at IS NULL AND `;
	return `(${deleted}${alias}.visibility IN (${list}))`;
}
