/**
 * Qué es cada cosa que se puede seguir en «Lo que sigo», y si quien mira la puede seguir:
 *
 * - **etiqueta**: una que existe en el árbol del sitio (archivo o base, `siteTagManager`). Se
 *   guarda por su nombre canónico: un alias o la forma de la URL («Rancheadita-Kinky») se
 *   resuelven antes (`resolveTagSlug`). Si después se renombra con la base (`etiquetas_db`), el
 *   nombre viejo queda como alias y lo seguido se sigue resolviendo.
 * - **perfil** (persona, proyecto o lugar): un perfil de la base que quien mira puede ver y que
 *   está aprobado para /amigues (o que gestiona), con las mismas reglas que su página pública
 *   (`getObject` con la visibilidad de quien mira). Se guarda por el id del objeto, que no cambia
 *   aunque cambie la dirección.
 *
 * Si algo seguido deja de existir o de verse, en Mi rincón aparece como «Ya no está disponible»
 * (sin nombre ni link) y se puede dejar de seguir.
 */
import { getObject } from '$lib/server/objects/index.js';
import { PROFILE_TYPE, memberViewer } from '$lib/server/cuentas/perfiles.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { isApproved, managerRole, urlSlugOf } from '$lib/server/amigues/profiles.js';
import { resolveTagSlug, tagPagePath } from '$lib/utils/series.js';
import { followKindLabel, sortFollows } from '$lib/utils/sigo.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/sigo.js').FollowTarget} FollowTarget */
/** @typedef {import('$lib/utils/sigo.js').FollowView} FollowView */
/** @typedef {{ target: FollowTarget, title: string, href: string, label: string }} ResolvedTarget */

/**
 * La etiqueta, por su nombre, un alias o la forma de la URL, o `null` si no existe.
 *
 * @param {TagManager} tags
 * @param {string} key
 * @returns {ResolvedTarget | null}
 */
export function resolveTag(tags, key) {
	const tag = resolveTagSlug(tags, key);
	if (!tag?.id) return null;
	return {
		target: { kind: 'etiqueta', key: tag.id },
		title: `${tag.icon ? `${tag.icon} ` : ''}${tag.visible_name ?? tag.id}`,
		href: tagPagePath(tag.id),
		label: followKindLabel('etiqueta')
	};
}

/**
 * El perfil, si la cuenta lo puede ver y seguir (aprobado o gestionado por ella), o `null`.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} key el id del objeto
 * @returns {Promise<ResolvedTarget | null>}
 */
export async function resolveProfile(db, accountId, key) {
	const id = Number(key);
	if (!Number.isSafeInteger(id) || id <= 0) return null;
	const object = await getObject(db, { id }, memberViewer(accountId));
	if (!object || object.type !== PROFILE_TYPE) return null;
	if (!(await isApproved(db, id)) && !(await managerRole(db, accountId, id))) return null;
	const legacy = await db
		.prepare('SELECT legacy_slug FROM profile_sources WHERE profile_id = ?1')
		.bind(id)
		.first();
	const legacySlug = legacy?.legacy_slug == null ? null : String(legacy.legacy_slug);
	return {
		target: { kind: 'perfil', key: String(id) },
		title: object.title,
		href: `/amigues/${encodeURIComponent(urlSlugOf(object, legacySlug))}`,
		label: followKindLabel('perfil', profileKindOf(object.data))
	};
}

/**
 * Resuelve cualquier cosa seguible.
 *
 * @param {{ db: D1Database, tags: TagManager, accountId: string }} ctx
 * @param {FollowTarget} target
 */
export function resolveTarget({ db, tags, accountId }, target) {
	return target.kind === 'etiqueta'
		? Promise.resolve(resolveTag(tags, target.key))
		: resolveProfile(db, accountId, target.key);
}

/**
 * Lo que sigue la cuenta, listo para mostrar en Mi rincón (y para el CSV).
 *
 * @param {{ db: D1Database, tags: TagManager, accountId: string }} ctx
 * @param {readonly import('./follows.js').FollowRow[]} rows
 * @returns {Promise<FollowView[]>}
 */
export async function describeFollows(ctx, rows) {
	/** @type {FollowView[]} */
	const out = [];
	for (const row of rows) {
		const found = await resolveTarget(ctx, { kind: row.kind, key: row.key });
		out.push({
			kind: row.kind,
			key: row.key,
			title: found?.title ?? 'Ya no está disponible',
			href: found?.href ?? null,
			label: found?.label ?? followKindLabel(row.kind),
			available: Boolean(found),
			options: row.options,
			createdAt: row.createdAt
		});
	}
	return sortFollows(out);
}
