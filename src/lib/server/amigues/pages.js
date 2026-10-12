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
import { claimState } from './claims.js';
import { findPublicProfile, groupMembers, urlSlugOf, viewerFor } from './profiles.js';
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
 * @param {{ posts?: ProcessedPost[] }} [opts] `posts`: las publicaciones del sitio (`sitePosts`;
 *   sin pasar, ninguna)
 */
export async function profilePageData(db, urlSlug, locals, { posts: sitePosts } = {}) {
	const viewer = viewerFor(locals);
	const accountId = locals.member?.id;
	const found = await findPublicProfile(db, urlSlug, viewer, { accountId });
	if (!found) return null;
	const { object, legacySlug, approved, avatarKey } = found;
	const profile = await toPublic(object, legacySlug, avatarKey ?? undefined);
	const kind = profileKindOf(object.data);
	const href = `/amigues/${urlSlugOf(object, legacySlug)}`;

	const posts = sitePosts ?? [];
	// Un lugar vinculado manda sobre el «Dónde» del .md de cada evento.
	const related = await relatedWithVenuePlaces(
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
	);

	// Autores con link a su perfil si es una ficha de amigues que se puede ver.
	const authors = await Promise.all(
		profile.authors.map(async (name) => {
			const slug = name.replaceAll(' ', '-');
			if (slug === profile.slug) return { name, href: null };
			const other = await findPublicProfile(db, slug, viewer, { accountId });
			return { name, href: other ? `/amigues/${urlSlugOf(other.object, other.legacySlug)}` : null };
		})
	);

	/** @type {import('$lib/utils/venues.js').VenueView | null} */
	let location = null;
	/** @type {ProcessedPost[]} */
	let venueEvents = [];
	if (kind === 'lugar') {
		location = venuePageLocation(object, href);
		const slugs = new Set(await listedVenueEvents(db, object));
		venueEvents = slugs.size
			? await withVenuePlaces(
					db,
					posts.filter((p) => p.meta.category === 'calendario' && slugs.has(String(p.meta.postID)))
				)
			: [];
	}

	/** @type {{ state: 'none' | 'pending' | 'manager' } | null} */
	let claim = null;
	if (accountId && (await canHaveProfiles(db, accountId))) {
		claim = { state: await claimState(db, accountId, object.id) };
	}

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
		bodyHtml: await renderProfileBody(/** @type {string | undefined} */ (object.data.body), {
			resolveMedia: (file) => (legacySlug ? mediaURL('amigues', legacySlug, file) : undefined)
		}),
		authors,
		members: await groupMembers(db, object, viewer),
		location,
		venueEvents,
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
