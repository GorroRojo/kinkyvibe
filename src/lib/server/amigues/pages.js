/**
 * Lo que arman las páginas públicas de /amigues, solo desde la base («solo base»: las fichas .md
 * de amigues ya no se leen; una ficha que la base no tiene no existe hasta que se importa). Junta
 * las reglas de profiles.js (quién ve qué), venues.js (privacidad de los lugares) y claims.js ("Es
 * mi perfil"), y reusa lo que ya usa el sitio: imágenes (./asPost.js, `mediaURL`), etiquetas,
 * "Más cosas de…" (`relatedPostsFor`) y los pronombres de las menciones.
 */
import { currentRelated, mediaURL, relatedPostsFor } from '$lib/utils';
import { canHaveProfiles } from '$lib/server/cuentas/accounts.js';
import { contentStampOf } from '$lib/server/contenido/posts.js';
import { readAndKeep } from '$lib/server/db/perRequest.js';
import { ANON } from '$lib/server/objects/visibility.js';
import { currentSiteTags } from '$lib/utils/siteTags.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { hasPendingClaim } from './claims.js';
import {
	findPublicProfile,
	findPublicProfiles,
	groupMembers,
	urlSlugOf,
	viewerFor
} from './profiles.js';
import { profileImage, profilePosts, toPublic } from './asPost.js';
import { renderProfileBody } from './render.js';
import {
	listedVenueEvents,
	relatedWithVenuePlaces,
	venuePageLocation,
	withVenuePlaces
} from './venues.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */

/** Filtros de tipo de /amigues (`?tipo=`). */
export const KIND_FILTERS = Object.freeze({
	persona: 'Personas',
	proyecto: 'Proyectos',
	lugar: 'Lugares'
});

// La imagen de un perfil (la usa también «Lo que sigo»).
export { profileImage };

/**
 * /amigues: los perfiles de la base que quien mira puede ver (solo la base: una ficha .md sin
 * importar no aparece).
 *
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {{ kind?: import('$lib/server/objects/types/perfil.js').ProfileKind }} [opts]
 * @returns {Promise<ProcessedPost[]>}
 */
export async function amiguesListPosts(db, locals, { kind } = {}) {
	const viewer = viewerFor(locals);
	if (viewer.role !== 'anon' || kind) return profilePosts(db, viewer, { kind });
	return anonProfilePosts(db);
}

/**
 * La lista de /amigues para quien no inició sesión (casi todas las visitas), recordada en el
 * isolate mientras no cambie la marca del contenido (`contentStampOf`: perfiles, aprobaciones,
 * importaciones e imágenes; se lee una vez por pedido) ni el árbol de etiquetas con que se
 * ordenan sus etiquetas. Lo que se recuerda es lo mismo que arma `profilePosts` (la misma
 * función), así que cambia la cantidad de consultas, no lo que se ve. Con sesión no se recuerda:
 * una cuenta o une admin pueden ver más. Solo la lista ya armada: lo que está en camino se
 * comparte solo dentro del pedido (`readAndKeep`, src/lib/server/db/perRequest.js).
 * @type {{ stamp: string, tree: TagManager, posts: ProcessedPost[] } | null}
 */
let anonCache = null;

/** Olvida la lista recordada de /amigues (tests). */
export function clearAmiguesCache() {
	anonCache = null;
}

/**
 * @param {D1Database} db
 * @returns {Promise<ProcessedPost[]>}
 */
async function anonProfilePosts(db) {
	const stamp = await contentStampOf(db);
	const tree = currentSiteTags();
	const entry = anonCache;
	const posts =
		entry?.stamp === stamp && entry.tree === tree
			? entry.posts
			: await readAndKeep(
					db,
					`amigues-anon\n${stamp}`,
					() => profilePosts(db, ANON),
					(list) => {
						anonCache = { stamp, tree, posts: list };
					}
				);
	// Una lista nueva en cada pedido (los posts son los mismos: nadie los cambia).
	return [...posts];
}

/**
 * Los datos de la página de un perfil, o `null` si quien mira no lo puede ver.
 *
 * @param {D1Database} db
 * @param {string} urlSlug
 * @param {App.Locals} locals
 * @param {{ posts?: ProcessedPost[] | Promise<ProcessedPost[]> }} [opts] `posts`: las
 *   publicaciones del sitio (`sitePosts`, o la lectura en camino; sin pasar, ninguna)
 */
export async function profilePageData(db, urlSlug, locals, opts) {
	const found = await findProfileForPage(db, urlSlug, locals);
	return found ? profilePageFrom(db, found, locals, opts) : null;
}

/**
 * El perfil de una dirección como lo ve quien mira (con si está aprobado, su imagen y el rol de
 * la cuenta), en una consulta; `null` si no lo puede ver (404). Lo demás de la página,
 * {@link profilePageFrom}.
 *
 * @param {D1Database} db
 * @param {string} urlSlug
 * @param {App.Locals} locals
 */
export function findProfileForPage(db, urlSlug, locals) {
	return findPublicProfile(db, urlSlug, viewerFor(locals), { accountId: locals.member?.id });
}

/**
 * Los datos de la página de un perfil ya encontrado ({@link findProfileForPage}). Lo que lee de la
 * base sale a la par (la base está lejos: cada consulta que espera a otra es una ida y vuelta).
 *
 * @param {D1Database} db
 * @param {import('./profiles.js').FoundProfile} found
 * @param {App.Locals} locals
 * @param {{ posts?: ProcessedPost[] | Promise<ProcessedPost[]> }} [opts] ver {@link profilePageData}
 */
export async function profilePageFrom(db, found, locals, { posts: sitePosts } = {}) {
	const viewer = viewerFor(locals);
	const accountId = locals.member?.id;
	const { object, legacySlug, approved, avatarKey, role } = found;
	const profile = await toPublic(object, legacySlug, avatarKey ?? undefined);
	const kind = profileKindOf(object.data);
	const href = `/amigues/${urlSlugOf(object, legacySlug)}`;
	const postsP = Promise.resolve(sitePosts ?? []);

	const [related, authors, venue, claim, bodyHtml, members] = await Promise.all([
		// Un lugar vinculado manda sobre el «Dónde» del .md de cada evento.
		postsP.then((posts) =>
			relatedWithVenuePlaces(
				db,
				currentRelated(
					relatedPostsFor(
						/** @type {any} */ ({
							category: 'amigues',
							postID: profile.slug,
							title: profile.title,
							authors: profile.authors
						}),
						posts
					)
				)
			)
		),
		profileAuthors(db, profile, viewer, accountId),
		kind === 'lugar' ? venuePageEvents(db, object, href, postsP) : null,
		accountId ? claimOf(db, accountId, object.id, role) : null,
		renderProfileBody(/** @type {string | undefined} */ (object.data.body), {
			resolveMedia: (file) => (legacySlug ? mediaURL('amigues', legacySlug, file) : undefined)
		}),
		groupMembers(db, object, viewer)
	]);

	return {
		mode: /** @type {const} */ ('db'),
		profile,
		// La dirección del objeto (no la vieja de la ficha): es la que usan los `personas:` de los
		// eventos (src/lib/server/personas/).
		objectSlug: object.slug,
		// El id del objeto: es lo que guarda «Lo que sigo» (botón «Seguir», docs/lo-que-sigo.md).
		profileId: object.id,
		canonical: href,
		// No listado (no sale en /amigues): el link se puede compartir, pero los buscadores no lo
		// guardan (`noindex`, docs/compartir.md).
		unlisted: object.data.unlisted === true,
		bodyHtml,
		authors,
		members,
		location: venue?.location ?? null,
		venueEvents: venue?.venueEvents ?? [],
		...related,
		badges: {
			hidden: object.visibility === 'hidden',
			membersOnly: object.visibility === 'members',
			pending: !approved
		},
		claim,
		private: viewer.role !== 'anon'
	};
}

/**
 * Autores con link a su perfil si es una ficha de amigues que se puede ver (todes en una
 * consulta).
 *
 * @param {D1Database} db
 * @param {{ slug: string, authors: string[] }} profile
 * @param {import('$lib/server/objects/visibility.js').Viewer} viewer
 * @param {string | undefined} accountId
 */
async function profileAuthors(db, profile, viewer, accountId) {
	const slugOf = (/** @type {string} */ name) => name.replaceAll(' ', '-');
	const others = profile.authors.map(slugOf).filter((slug) => slug !== profile.slug);
	const found = others.length
		? await findPublicProfiles(db, others, viewer, { accountId })
		: new Map();
	return profile.authors.map((name) => {
		const slug = slugOf(name);
		if (slug === profile.slug) return { name, href: null };
		const other = found.get(slug);
		return { name, href: other ? `/amigues/${urlSlugOf(other.object, other.legacySlug)}` : null };
	});
}

/**
 * La ubicación de un lugar y los eventos que lista (la lista de eventos vinculados sale a la par
 * de las publicaciones).
 *
 * @param {D1Database} db
 * @param {StoredObject} object
 * @param {string} href
 * @param {Promise<ProcessedPost[]>} postsP
 * @returns {Promise<{ location: import('$lib/utils/venues.js').VenueView, venueEvents: ProcessedPost[] }>}
 */
async function venuePageEvents(db, object, href, postsP) {
	const location = venuePageLocation(object, href);
	const [listed, posts] = await Promise.all([listedVenueEvents(db, object), postsP]);
	const slugs = new Set(listed);
	const venueEvents = slugs.size
		? await withVenuePlaces(
				db,
				posts.filter((p) => p.meta.category === 'calendario' && slugs.has(String(p.meta.postID)))
			)
		: [];
	return { location, venueEvents };
}

/**
 * "Es mi perfil": el estado de la cuenta con el perfil (`claimState`), solo si tiene el permiso de
 * perfiles. Si lo gestiona ya se sabe (`role`, de la misma regla que `managerRole`); el pedido
 * pendiente se pregunta a la par del permiso y cuenta solo con el permiso.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} profileId
 * @param {'owner' | 'manager' | null} role
 * @returns {Promise<{ state: 'none' | 'pending' | 'manager' } | null>}
 */
async function claimOf(db, accountId, profileId, role) {
	const [can, pending] = await Promise.all([
		canHaveProfiles(db, accountId),
		role
			? null
			: hasPendingClaim(db, accountId, profileId).then(
					(value) => ({ value }),
					(error) => ({ error })
				)
	]);
	if (!can) return null;
	if (role) return { state: 'manager' };
	if (pending && 'error' in pending) throw pending.error;
	return { state: pending?.value ? 'pending' : 'none' };
}
