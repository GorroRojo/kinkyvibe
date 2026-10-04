/**
 * Los perfiles de la base con la forma de un post (`ProcessedPost`), para lo que antes leía las
 * fichas .md de amigues: las listas del sitio (`sitePosts`: /todo, el sitemap, «Más cosas de…»,
 * /api/posts), los autores de un evento o un material y /amigues. Siempre con la lista blanca de
 * `publicProfile` (./profiles.js), nunca el objeto.
 */
import { canonicalTags, thumbURL } from '$lib/utils';
import { imageKeysByObject } from '$lib/server/media/library.js';
import { mediaPath } from '$lib/server/media/sniff.js';
import { ANON } from '$lib/server/objects/visibility.js';
import { findPublicProfile, listPublicProfiles, profileAsPost, publicProfile } from './profiles.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */

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
 * La lista blanca del perfil con su imagen y sus etiquetas como las muestra el sitio. La imagen:
 * la de la biblioteca (edge `avatar`, docs/imagenes.md) si tiene; si no, la de la ficha vieja.
 *
 * @param {StoredObject} o
 * @param {string | null} legacySlug
 * @param {string | undefined} [avatarKey] clave de su imagen en la biblioteca
 * @param {TagManager} [tagManager]
 */
export async function toPublic(o, legacySlug, avatarKey, tagManager) {
	const raw = Array.isArray(o.data.tags) ? o.data.tags.filter((t) => typeof t === 'string') : [];
	return publicProfile(o, {
		legacySlug,
		image: avatarKey ? mediaPath(avatarKey) : await profileImage(o, legacySlug),
		tags: canonicalTags(raw, tagManager)
	});
}

/**
 * Los perfiles que lista /amigues para quien mira, como posts.
 *
 * @param {D1Database} db
 * @param {Viewer} viewer
 * @param {{ kind?: import('$lib/server/objects/types/perfil.js').ProfileKind, unlisted?: boolean, tagManager?: TagManager }} [opts]
 * @returns {Promise<ProcessedPost[]>}
 */
export async function profilePosts(db, viewer, { kind, unlisted = false, tagManager } = {}) {
	const [profiles, avatars] = await Promise.all([
		listPublicProfiles(db, viewer, { kind, unlisted }),
		imageKeysByObject(db, 'perfil', 'avatar').catch(() => new Map())
	]);
	return Promise.all(
		profiles.map(async (p) =>
			profileAsPost(await toPublic(p.object, p.legacySlug, avatars.get(p.object.id), tagManager))
		)
	);
}

/**
 * Los perfiles de los autores de un post (`authors:`, por nombre con espacios → guiones, como las
 * fichas .md) que quien mira puede ver, como posts: lo que muestran los eventos y el material
 * («Por …» y las tarjetas de les autores).
 *
 * @param {D1Database | null | undefined} db
 * @param {readonly unknown[] | undefined} authors
 * @param {{ postID?: string, viewer?: Viewer }} [opts] `postID`: el post mismo no es su autore
 * @returns {Promise<ProcessedPost[]>}
 */
export async function authorProfilePosts(db, authors, { postID, viewer = ANON } = {}) {
	if (!db || !Array.isArray(authors)) return [];
	/** @type {ProcessedPost[]} */
	const out = [];
	for (const author of authors) {
		if (typeof author !== 'string' || !author.trim()) continue;
		const slug = author.replaceAll(' ', '-');
		if (slug === postID) continue;
		const found = await findPublicProfile(db, slug, viewer).catch(() => null);
		if (!found) continue;
		const post = profileAsPost(
			await toPublic(found.object, found.legacySlug, found.avatarKey ?? undefined)
		);
		// Las tarjetas comparan con el nombre como está escrito en `authors:`.
		out.push({ ...post, meta: { ...post.meta, postID: slug } });
	}
	return out;
}
