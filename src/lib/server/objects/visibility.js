/**
 * Quién puede ver un objeto. ÚNICO lugar donde se decide: cualquier lectura de `objects` (una
 * página, un listado, la búsqueda, el sitemap, el RSS, las imágenes para compartir, un JSON…)
 * pasa por `canSee` o por `visibleWhere`, que salen de la misma tabla `VISIBLE_TO` y de la misma
 * regla de autoría (`creatorSees`).
 *
 * Reglas ("visible por defecto, oculto a pedido"):
 * - 'public': todes.
 * - 'members': personas con cuenta (y admins).
 * - 'hidden': admins y quien lo creó (`created_by`); alguien pidió que no se muestre. Salvo en
 *   los tipos de `NO_CREATOR_ACCESS` (perfiles): ahí lo oculto lo ven solo admins.
 *   Quienes gestionan un perfil lo ven en Mi rincón por `profile_managers`, no por acá.
 * - Borrado (`deleted_at`): nadie, salvo admins que lo piden explícitamente (para deshacer).
 * - Ante la duda (rol o visibilidad desconocidos) no se muestra.
 * - Partes de un taller (docs/talleres-partes.md): si el taller tiene «Si ocultás el taller,
 *   ocultar también sus partes», una parte se ve solo si quien mira también ve el taller
 *   (`partVisibleWhere`, para las lecturas públicas de eventos).
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
 * Tipos en los que haber creado el objeto no da acceso a lo oculto. En un perfil, quién lo
 * maneja cambia (un proyecto pasa a otras personas, quien lo creó lo deja): quién lo ve en Mi rincón
 * lo decide `profile_managers` (src/lib/server/cuentas/perfiles.js), nunca `created_by`.
 */
export const NO_CREATOR_ACCESS = Object.freeze(['perfil']);

/**
 * @param {{ type?: string, visibility: string, deleted_at?: number | null, created_by?: string | null }} object
 * @param {Viewer | null | undefined} viewer
 * @param {{ includeDeleted?: boolean }} [options] solo tiene efecto para admins
 */
export function canSee(object, viewer, { includeDeleted = false } = {}) {
	if (object.deleted_at != null && !(includeDeleted && isAdmin(viewer))) return false;
	if (allowedFor(viewer).includes(object.visibility)) return true;
	const id = creatorId(viewer);
	return (
		id !== null &&
		CREATOR_SEES.includes(object.visibility) &&
		object.created_by === id &&
		!NO_CREATOR_ACCESS.includes(String(object.type))
	);
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
	const noCreator = NO_CREATOR_ACCESS.map((v) => `'${v}'`).join(', ');
	return {
		sql: `(${deleted}(${alias}.visibility IN (${list}) OR (${alias}.visibility IN (${extraList}) AND ${alias}.created_by = ? AND ${alias}.type NOT IN (${noCreator}))))`,
		params: [/** @type {string} */ (id)]
	};
}

/**
 * La clave del taller (en `extra`) de «Si ocultás el taller, ocultar también sus partes»
 * (`OCULTAR_PARTES_KEY` de src/lib/utils/partes.js; acá sin importarla, solo imports del servidor).
 */
export const HIDE_PARTS_KEY = 'ocultar_partes';

/** El `kind` del edge del taller a cada una de sus otras partes. */
const PART_EDGE = 'parte';

/**
 * Además de `visibleWhere`, para los eventos: que la fila no sea una parte de un taller (vivo) que
 * oculta sus partes y que quien mira no ve. Un taller sin la opción, o borrado, no cambia nada.
 * Usa `?` sin número, como `visibleWhere`.
 *
 * @param {Viewer | null | undefined} viewer
 * @param {string} [alias] nombre o alias de la tabla `objects` (la parte) en la consulta
 * @returns {{ sql: string, params: string[] }}
 */
export function partVisibleWhere(viewer, alias = 'objects') {
	if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`alias inválido: ${alias}`);
	const ws = visibleWhere(viewer, 'vis_taller');
	return {
		sql: `NOT EXISTS (SELECT 1 FROM edges vis_parte
			JOIN objects vis_taller ON vis_taller.id = vis_parte.from_id
			WHERE vis_parte.kind = '${PART_EDGE}' AND vis_parte.to_id = ${alias}.id
			AND vis_taller.deleted_at IS NULL
			AND json_extract(vis_taller.data, '$.extra.${HIDE_PARTS_KEY}') = 1
			AND NOT ${ws.sql})`,
		params: ws.params
	};
}
