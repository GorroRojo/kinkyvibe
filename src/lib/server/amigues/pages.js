/**
 * Lo que arman las páginas públicas de /amigues cuando el interruptor `perfiles_publicos` está
 * prendido (las rutas solo eligen entre esto y los .md). Junta las reglas de profiles.js (quién ve
 * qué), venues.js (privacidad de los lugares) y claims.js ("Es mi perfil"), y reusa lo que ya usa
 * el sitio para las fichas .md: imágenes (`thumbURL`/`mediaURL`), etiquetas (`canonicalTags`),
 * "Más cosas de…" (`relatedPostsFor`) y los pronombres de las menciones.
 */
import {
	canonicalTags,
	currentRelated,
	fetchMarkdownPosts,
	mediaURL,
	relatedPostsFor,
	thumbURL
} from '$lib/utils';
import { mentionPronouns } from '$lib/server/pronouns';
import { canHaveProfiles } from '$lib/server/cuentas/accounts.js';
import { profileKind } from '$lib/server/cuentas/perfiles.js';
import { claimState } from './claims.js';
import {
	findPublicProfile,
	groupMembers,
	importedLegacySlugs,
	listPublicProfiles,
	profileAsPost,
	publicProfile,
	resolveProfileSlug,
	urlSlugOf,
	viewerFor
} from './profiles.js';
import { renderProfileBody } from './render.js';
import { listedVenueEvents, venuePageLocation } from './venues.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */

/** Filtros de tipo de /amigues (`?tipo=`). */
export const KIND_FILTERS = Object.freeze({
	persona: 'Personas',
	grupo: 'Grupos',
	lugar: 'Lugares'
});

/**
 * La imagen de un perfil: la de su ficha vieja (como la mostraba el sitio: `featured`, si no el
 * logo o la foto) o ninguna.
 *
 * @param {StoredObject} o
 * @param {string | null} legacySlug
 * @returns {Promise<string | null>}
 */
export async function profileImage(o, legacySlug) {
	if (!legacySlug) return null;
	for (const key of ['featured', 'logo', 'photo']) {
		const ref = o.data[key];
		if (typeof ref === 'string' && ref) {
			const url = await thumbURL('amigues', legacySlug, ref);
			if (url) return url;
		}
	}
	return null;
}

/**
 * La lista blanca del perfil con su imagen y sus etiquetas como las muestra el sitio.
 *
 * @param {StoredObject} o
 * @param {string | null} legacySlug
 */
async function toPublic(o, legacySlug) {
	const raw = Array.isArray(o.data.tags) ? o.data.tags.filter((t) => typeof t === 'string') : [];
	return publicProfile(o, {
		legacySlug,
		image: await profileImage(o, legacySlug),
		tags: canonicalTags(raw)
	});
}

/**
 * /amigues desde la base: los perfiles que quien mira puede ver, más las fichas .md que todavía
 * no se importaron (las importadas se muestran solo desde la base, aunque el .md siga).
 *
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {{ kind?: 'persona' | 'grupo' | 'lugar' }} [opts]
 * @returns {Promise<ProcessedPost[]>}
 */
export async function amiguesListPosts(db, locals, { kind } = {}) {
	const viewer = viewerFor(locals);
	const [profiles, imported, md] = await Promise.all([
		listPublicProfiles(db, viewer, { kind }),
		importedLegacySlugs(db),
		fetchMarkdownPosts()
	]);
	const posts = await Promise.all(
		profiles.map(async (p) => profileAsPost(await toPublic(p.object, p.legacySlug)))
	);
	if (!kind) {
		for (const post of md) {
			if (post.meta.layout === 'amigues' && !imported.has(String(post.meta.postID)))
				posts.push(post);
		}
	}
	return posts;
}

/**
 * ¿Hay un perfil (en cualquier estado) con esa dirección? Si lo hay y no se puede ver, la página
 * da 404 en vez de caer en el .md (así ocultar o borrar en el panel funciona aunque el .md siga).
 *
 * @param {D1Database} db
 * @param {string} urlSlug
 */
export async function profileSlugTaken(db, urlSlug) {
	return Boolean(await resolveProfileSlug(db, urlSlug));
}

/**
 * Los datos de la página de un perfil, o `null` si quien mira no lo puede ver.
 *
 * @param {D1Database} db
 * @param {string} urlSlug
 * @param {App.Locals} locals
 * @param {{ cuentas: boolean }} opts si están prendidas las cuentas (para "Es mi perfil")
 */
export async function profilePageData(db, urlSlug, locals, { cuentas }) {
	const viewer = viewerFor(locals);
	const accountId = locals.member?.id;
	const found = await findPublicProfile(db, urlSlug, viewer, { accountId });
	if (!found) return null;
	const { object, legacySlug, approved } = found;
	const profile = await toPublic(object, legacySlug);
	const kind = profileKind(object.data);
	const href = `/amigues/${urlSlugOf(object, legacySlug)}`;

	const posts = await fetchMarkdownPosts();
	const related = currentRelated(
		relatedPostsFor(
			/** @type {any} */ ({
				category: 'amigues',
				postID: profile.slug,
				title: profile.title,
				authors: profile.authors
			}),
			posts
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
			? posts.filter((p) => p.meta.category === 'calendario' && slugs.has(String(p.meta.postID)))
			: [];
	}

	/** @type {{ state: 'none' | 'pending' | 'manager' } | null} */
	let claim = null;
	if (cuentas && accountId && (await canHaveProfiles(db, accountId))) {
		claim = { state: await claimState(db, accountId, object.id) };
	}

	return {
		mode: /** @type {const} */ ('db'),
		profile,
		// La dirección del objeto (la que usan otros archivos para nombrarlo, por ejemplo
		// `personas:` en un evento); `profile.slug` es la de la URL, que puede ser la vieja.
		objectSlug: object.slug,
		canonical: href,
		bodyHtml: await renderProfileBody(/** @type {string | undefined} */ (object.data.body), {
			resolveMedia: (file) => (legacySlug ? mediaURL('amigues', legacySlug, file) : undefined)
		}),
		authors,
		members: await groupMembers(db, object, viewer),
		location,
		venueEvents,
		...related,
		pronouns: await mentionPronouns(),
		badges: {
			hidden: object.visibility === 'hidden',
			membersOnly: object.visibility === 'members',
			pending: !approved
		},
		claim,
		private: viewer.role !== 'anon'
	};
}
