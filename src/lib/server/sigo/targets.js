/**
 * Qué es cada cosa que se puede seguir en «Lo que sigo», y si quien mira la puede seguir:
 *
 * - **etiqueta**: una que existe en el árbol del sitio (archivo o base, `siteTagManager`). Se
 *   guarda por su nombre canónico: un alias o la forma de la URL («Rancheadita-Kinky») se
 *   resuelven antes (`resolveTagSlug`). Si después se renombra dejando el alias, el
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
import {
	isApproved,
	listPublicProfiles,
	managerRole,
	urlSlugOf
} from '$lib/server/amigues/profiles.js';
import { profileImage } from '$lib/server/amigues/pages.js';
import { seriesImageURL } from '$lib/server/series/index.js';
import { isSeriesTag, resolveTagSlug, seriesImage, tagPagePath } from '$lib/utils/series.js';
import { followKindLabel, sortFollows } from '$lib/utils/sigo.js';
import { eventsForFollow } from './calendar.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/sigo.js').FollowTarget} FollowTarget */
/** @typedef {import('$lib/utils/sigo.js').FollowView} FollowView */
/** @typedef {import('$lib/utils/sigo.js').FollowLook} FollowLook */
/**
 * @typedef {{ target: FollowTarget, title: string, href: string, label: string }
 *   & FollowLook & { imageFile?: string }} ResolvedTarget `imageFile`: el archivo de la imagen
 *   de una serie (la URL la arma `describeFollows`)
 */

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
	const series = isSeriesTag(tags, tag.id);
	return {
		target: { kind: 'etiqueta', key: tag.id },
		title: `${tag.icon ? `${tag.icon} ` : ''}${tag.visible_name ?? tag.id}`,
		href: tagPagePath(tag.id),
		label: followKindLabel('etiqueta'),
		name: tag.visible_name ?? tag.id,
		icon: tag.icon ?? '',
		color: tag.getColor?.() ?? undefined,
		series,
		imageFile: series ? seriesImage(tag) : undefined
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
	const profileKind = profileKindOf(object.data);
	return {
		target: { kind: 'perfil', key: String(id) },
		title: object.title,
		href: `/amigues/${encodeURIComponent(urlSlugOf(object, legacySlug))}`,
		label: followKindLabel('perfil', profileKind),
		name: object.title,
		profileKind,
		image: await profileImage(object, legacySlug)
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
 * Lo que sigue la cuenta, listo para mostrar en Mi rincón (y para el CSV). Con `events` (los
 * eventos próximos, ordenados por fecha), cada cosa trae además su próximo evento (`next`).
 *
 * @param {{ db: D1Database, tags: TagManager, accountId: string,
 *   events?: readonly ProcessedPost[] }} ctx
 * @param {readonly import('./follows.js').FollowRow[]} rows
 * @returns {Promise<FollowView[]>}
 */
export async function describeFollows(ctx, rows) {
	/** @type {FollowView[]} */
	const out = [];
	for (const row of rows) {
		const target = { kind: row.kind, key: row.key };
		const found = await resolveTarget(ctx, target);
		/** @type {FollowView} */
		const view = {
			kind: row.kind,
			key: row.key,
			title: found?.title ?? 'Ya no está disponible',
			href: found?.href ?? null,
			label: found?.label ?? followKindLabel(row.kind),
			available: Boolean(found),
			options: row.options,
			createdAt: row.createdAt
		};
		if (found) {
			view.name = found.name;
			view.icon = found.icon;
			view.color = found.color;
			view.series = found.series;
			view.profileKind = found.profileKind ?? null;
			view.image = found.image ?? (await seriesImageURL(found.imageFile)) ?? null;
		}
		if (found && ctx.events) {
			const [next] = await eventsForFollow(ctx.db, ctx.accountId, target, ctx.events, ctx.tags);
			view.next = next
				? { title: String(next.meta.title ?? ''), href: next.path, start: String(next.meta.start) }
				: null;
		}
		out.push(view);
	}
	return sortFollows(out);
}

/**
 * Las etiquetas del árbol que se pueden seguir, para el buscador de «Agregar» (con la forma de
 * las opciones del selector de etiquetas, $lib/utils/adminTags.js): sin alias, sin las sueltas
 * (que no están en el árbol) y sin la raíz. `count` es cuántos eventos próximos la tienen, así
 * con el buscador vacío se sugieren las que tienen más.
 *
 * @param {TagManager} tags
 * @param {readonly { meta: Record<string, any> }[]} [events] los eventos próximos
 * @returns {(import('$lib/utils/adminTags.js').TagOption & { series: boolean })[]}
 */
export function followableTags(tags, events = []) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const e of events) {
		for (const raw of Array.isArray(e.meta.tags) ? e.meta.tags : []) {
			const id = tags.get(raw)?.id ?? raw;
			counts.set(id, (counts.get(id) ?? 0) + 1);
		}
	}
	/** @type {Map<string, string[]>} */
	const aliases = new Map();
	for (const [id, tag] of tags.entries()) {
		if (tag?.aliasOf) aliases.set(tag.aliasOf, [...(aliases.get(tag.aliasOf) ?? []), id]);
	}
	const out = [];
	for (const [id, tag] of tags.entries()) {
		if (!tag || tag.aliasOf || tag.orphan || id === 'root') continue;
		const parent = (tag.parents ?? []).find((/** @type {string} */ p) => p !== 'root') ?? '';
		out.push({
			id,
			name: tag.visible_name ?? id,
			icon: tag.icon ?? '',
			color: tag.getColor?.() ?? undefined,
			group: parent,
			aliases: [...(aliases.get(id) ?? []), ...(Array.isArray(tag.aka) ? tag.aka : [])],
			count: counts.get(id) ?? 0,
			inTree: true,
			series: isSeriesTag(tags, id)
		});
	}
	return out;
}

/**
 * Los perfiles que la cuenta puede seguir desde «Agregar»: los de /amigues que ve (aprobados y
 * visibles para ella). Solo nombre, id y tipo.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<import('$lib/utils/sigo.js').ProfileOption[]>}
 */
export async function followableProfiles(db, accountId) {
	const list = await listPublicProfiles(db, memberViewer(accountId));
	return list.map(({ object }) => ({
		key: String(object.id),
		name: object.title,
		kind: profileKindOf(object.data)
	}));
}
