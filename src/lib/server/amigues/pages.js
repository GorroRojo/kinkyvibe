/**
 * Lo que arman las páginas públicas de /amigues, solo desde la base («solo base»: las fichas .md
 * de amigues ya no se leen; una ficha que la base no tiene no existe hasta que se importa). Junta
 * las reglas de profiles.js (quién ve qué), venues.js (privacidad de los lugares) y claims.js ("Es
 * mi perfil"), y reusa lo que ya usa el sitio: imágenes (./asPost.js, `mediaURL`), etiquetas,
 * "Más cosas de…" (`relatedPostsFor`) y los pronombres de las menciones.
 */
import { currentRelated, mediaURL, relatedPostsFor } from '$lib/utils';
import { canHaveProfiles } from '$lib/server/cuentas/accounts.js';
import { contentStampOf, peekContentStamp, peekListedPosts } from '$lib/server/contenido/posts.js';
import { oncePerRequest, readAndKeep } from '$lib/server/db/perRequest.js';
import { batchesReads } from '$lib/server/db/autoBatch.js';
import { ANON } from '$lib/server/objects/visibility.js';
import { currentSiteTags } from '$lib/utils/siteTags.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { claimStatusOf } from './claims.js';
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
	const tree = currentSiteTags();
	const entry = anonCache;
	// Sin la lista de la marca con que el isolate armó sus listas (la primera vez en el isolate, o
	// cambió el contenido): se arma ya, a la par de la marca (con las tandas, en la misma ida), y se
	// usa solo si la marca dice que hace falta. Lo leído nunca es más viejo que la marca.
	const ahead =
		batchesReads(db) && !(entry?.stamp === peekContentStamp() && entry?.tree === tree)
			? oncePerRequest(db, 'amigues-anon-ahead', () => profilePosts(db, ANON))
			: null;
	ahead?.catch(() => {});
	const stamp = await contentStampOf(db);
	const posts =
		entry?.stamp === stamp && entry.tree === tree
			? entry.posts
			: await readAndKeep(
					db,
					`amigues-anon\n${stamp}`,
					() => ahead ?? profilePosts(db, ANON),
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
	const { object, legacySlug, approved, avatarKey } = found;
	const profile = await toPublic(object, legacySlug, avatarKey ?? undefined);
	const href = `/amigues/${urlSlugOf(object, legacySlug)}`;
	const postsP = Promise.resolve(sitePosts ?? []);

	const [[related, authors, venue, claim, members], bodyHtml] = await Promise.all([
		profilePageReads(db, found, locals, profile, postsP),
		renderProfileBody(/** @type {string | undefined} */ (object.data.body), {
			resolveMedia: (file) => (legacySlug ? mediaURL('amigues', legacySlug, file) : undefined),
			firstImageEager: true
		})
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
		// Una persona que pidió no aparecer en buscadores (`profileNoindex`): la página se ve igual,
		// pero con `noindex` (meta y cabecera), sin datos estructurados y con una vista previa sin
		// foto (docs/amigues.md, «Buscadores»).
		noindex: profile.noindex,
		bodyHtml,
		authors,
		members,
		location: venue?.location ?? null,
		venueEvents: venue?.venueEvents ?? [],
		...related,
		badges: {
			hidden: object.visibility === 'hidden',
			membersOnly: object.visibility === 'members',
			pending: !approved,
			// Solo para quienes lo gestionan y les admins: para el resto la página no cambia.
			noindex: profile.noindex && (viewer.role === 'admin' || Boolean(found.role))
		},
		claim,
		private: viewer.role !== 'anon'
	};
}

/**
 * Lo que la página de un perfil lee de la base después de encontrarlo, todo a la par.
 *
 * @param {D1Database} db
 * @param {import('./profiles.js').FoundProfile} found
 * @param {App.Locals} locals
 * @param {Awaited<ReturnType<typeof toPublic>>} profile
 * @param {Promise<ProcessedPost[]>} postsP
 */
function profilePageReads(db, found, locals, profile, postsP) {
	const viewer = viewerFor(locals);
	const accountId = locals.member?.id;
	const { object, legacySlug, role } = found;
	const kind = profileKindOf(object.data);
	const href = `/amigues/${urlSlugOf(object, legacySlug)}`;
	return Promise.all([
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
		groupMembers(db, object, viewer)
	]);
}

/**
 * Lo que vio sin sesión el último pedido de este isolate a cada dirección de perfil: para adelantar
 * lo que la página lee después de encontrarlo ({@link askProfilePageEarly}). Nunca decide qué se
 * muestra.
 * @type {Map<string, import('./profiles.js').FoundProfile>}
 */
const pageHints = new Map();
const PAGE_HINTS_MAX = 200;

/**
 * Guarda lo encontrado sin sesión para esa dirección (para el próximo pedido del isolate).
 * @param {string} urlSlug
 * @param {import('./profiles.js').FoundProfile | null} found
 * @param {App.Locals} locals
 */
export function rememberProfilePage(urlSlug, found, locals) {
	if (locals.user || locals.member) return;
	if (!found) {
		pageHints.delete(urlSlug);
		return;
	}
	if (pageHints.size >= PAGE_HINTS_MAX) pageHints.clear();
	pageHints.set(urlSlug, found);
}

/**
 * Adelanta lo que la página de un perfil lee después de encontrarlo, con lo que encontró el último
 * pedido sin sesión a esa dirección: con las tandas automáticas (src/lib/server/db/autoBatch.js) va
 * en la misma ida que la búsqueda del perfil, y las consultas de después (con lo encontrado de
 * verdad) reciben lo ya leído. Si el perfil cambió, salen aparte, como siempre. Solo sin sesión y
 * con tandas. Devuelve el perfil adivinado (para que la página adelante lo suyo), o `null`.
 *
 * @param {D1Database} db
 * @param {string} urlSlug
 * @param {App.Locals} locals
 * @param {Promise<ProcessedPost[]>} postsP
 */
export function askProfilePageEarly(db, urlSlug, locals, postsP) {
	if (!batchesReads(db) || locals.user || locals.member) return null;
	const found = pageHints.get(urlSlug);
	if (!found) return null;
	// La lista que ya tiene el isolate, sin esperar a saber si cambió (la de verdad sí espera).
	const known = peekListedPosts();
	toPublic(found.object, found.legacySlug, found.avatarKey ?? undefined)
		.then((profile) =>
			profilePageReads(db, found, locals, profile, known ? Promise.resolve(known) : postsP)
		)
		.catch(() => {});
	return found;
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
 * "Es mi perfil": el estado de la cuenta con el perfil (`claimState`), para cualquier cuenta (pedir
 * no da nada: une admin lo revisa). Si lo gestiona ya se sabe (`role`, de la misma regla que
 * `managerRole`); ese estado lleva a Mi rincón → Perfiles, así que solo sale con el permiso (sin
 * él, nada). El pedido (pendiente, no aprobado o ninguno) se pregunta a la par del permiso.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} profileId
 * @param {'owner' | 'manager' | null} role
 * @returns {Promise<{ state: 'none' | 'pending' | 'rejected' | 'manager' } | null>}
 */
async function claimOf(db, accountId, profileId, role) {
	const [can, claim] = await Promise.all([
		role ? canHaveProfiles(db, accountId) : false,
		role
			? null
			: claimStatusOf(db, accountId, profileId).then(
					(value) => ({ value }),
					(error) => ({ error })
				)
	]);
	if (role) return can ? { state: 'manager' } : null;
	if (claim && 'error' in claim) throw claim.error;
	return { state: claim?.value ?? 'none' };
}
