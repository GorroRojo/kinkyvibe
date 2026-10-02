/**
 * «Lo que sigo» en el calendario personal (/ics/mio/<token>.ics, docs/lo-que-sigo.md): qué
 * eventos van, además de los de siempre. Con `lo_que_sigo` apagado el calendario no cambia (solo
 * mis entradas, como antes).
 *
 * - **Mis entradas** (`sigoCalEntradas`, prendido si no se tocó): los eventos con entradas de la
 *   cuenta, incluidos los no listados (son suyos).
 * - **Donde participo** (`sigoCalParticipo`): los eventos que nombran (`personas:`) un perfil que
 *   la cuenta gestiona.
 * - **Lo seguido con «en mi calendario»**: los eventos con la etiqueta (o una de sus hijas), los
 *   que nombran al perfil y, si es un lugar, los que se hacen ahí y lo muestran en público
 *   (`listedVenueEvents`). Solo si la cuenta todavía puede ver ese perfil.
 *
 * Lo que no es una entrada propia sale solo de los eventos listados: nunca un evento no listado
 * por seguir algo.
 */
import { getObject } from '$lib/server/objects/index.js';
import { PROFILE_TYPE, memberViewer } from '$lib/server/cuentas/perfiles.js';
import { isApproved, managerRole } from '$lib/server/amigues/profiles.js';
import { listedVenueEvents } from '$lib/server/amigues/venues.js';
import { ticketedSlugs } from '$lib/server/series/feeds.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { PERSONAS_KEY, parsePersonas } from '$lib/utils/personas.js';
import { resolveTagSlug } from '$lib/utils/tagSlug.js';
import { getCalendarPrefs, listFollows } from './follows.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ meta: Record<string, any> }} PostLike */

/** @param {PostLike} p */
const slugOf = (p) => String(p.meta.postID);

/** @param {PostLike} p */
const isEvent = (p) => p.meta.category === 'calendario';

/**
 * Las direcciones de los perfiles que gestiona la cuenta (con el permiso de perfiles).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<string[]>}
 */
export async function managedProfileSlugs(db, accountId) {
	const { results } = await db
		.prepare(
			`SELECT o.slug FROM profile_managers pm
			JOIN accounts a ON a.id = pm.account_id
			JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ?1 AND a.deleted_at IS NULL AND a.can_have_profiles = 1
			AND o.deleted_at IS NULL`
		)
		.bind(accountId)
		.all();
	return results.map((r) => String(r.slug));
}

/**
 * Los eventos (de `posts`) que nombran alguno de esos perfiles en `personas:`.
 *
 * @param {readonly PostLike[]} posts
 * @param {ReadonlySet<string>} profileSlugs
 */
function namingProfiles(posts, profileSlugs) {
	if (!profileSlugs.size) return [];
	return posts.filter((p) =>
		parsePersonas(p.meta?.[PERSONAS_KEY]).some((e) => profileSlugs.has(e.perfil))
	);
}

/**
 * Los eventos (de `events`) de una cosa seguida: con la etiqueta o una de sus hijas; los que
 * nombran al perfil en `personas:` y, si es un lugar, los que se hacen ahí y lo muestran en
 * público. Un perfil que la cuenta ya no puede ver (o que dejó de estar aprobado) no da nada.
 * Lo usan el calendario y los mails (notify.js).
 *
 * @template {PostLike} P
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ kind: string, key: string }} f
 * @param {readonly P[]} events
 * @param {TagManager} tags
 * @returns {Promise<P[]>}
 */
export async function eventsForFollow(db, accountId, f, events, tags) {
	if (f.kind === 'etiqueta') {
		// Por el nombre canónico o un alias (si se renombró con la base), y sus hijas.
		const tag = resolveTagSlug(tags, f.key);
		if (!tag?.id) return [];
		const keys = new Set([tag.id, ...(tag.getAllChildren?.() ?? [])]);
		return events.filter((p) =>
			(Array.isArray(p.meta.tags) ? p.meta.tags : []).some((t) => keys.has(t))
		);
	}
	const id = Number(f.key);
	if (!Number.isSafeInteger(id) || id <= 0) return [];
	const object = await getObject(db, { id }, memberViewer(accountId));
	if (!object || object.type !== PROFILE_TYPE) return [];
	if (!(await isApproved(db, id)) && !(await managerRole(db, accountId, id))) return [];
	const at =
		profileKindOf(object.data) === 'lugar' ? new Set(await listedVenueEvents(db, object)) : null;
	const named = new Set(namingProfiles(events, new Set([object.slug])).map(slugOf));
	return events.filter((p) => named.has(slugOf(p)) || Boolean(at?.has(slugOf(p))));
}

/**
 * Qué eventos van al calendario personal de la cuenta, por dirección.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ listed: readonly PostLike[], sigo: boolean, tags: TagManager }} ctx `listed`: los
 *   posts listados; `sigo`: el interruptor (`sigoEnabled`)
 * @returns {Promise<Set<string>>}
 */
export async function calendarSlugs(db, accountId, { listed, sigo, tags }) {
	if (!sigo) return ticketedSlugs(db, accountId);
	const prefs = await getCalendarPrefs(db, accountId);
	/** @type {Set<string>} */
	const out = prefs.entradas ? await ticketedSlugs(db, accountId) : new Set();
	const events = listed.filter(isEvent);
	const add = (/** @type {readonly PostLike[]} */ ps) => ps.forEach((p) => out.add(slugOf(p)));

	if (prefs.participo)
		add(namingProfiles(events, new Set(await managedProfileSlugs(db, accountId))));

	for (const f of (await listFollows(db, accountId)).filter((f) => f.options.calendario)) {
		add(await eventsForFollow(db, accountId, f, events, tags));
	}
	return out;
}
