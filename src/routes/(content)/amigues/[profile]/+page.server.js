import { error, fail } from '@sveltejs/kit';
import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { mentionPronouns } from '$lib/server/pronouns';
import { getDB } from '$lib/server/db';
import { profilePageData, profileSlugTaken } from '$lib/server/amigues/pages.js';
import { createClaim } from '$lib/server/amigues/claims.js';
import { resolveProfileSlug } from '$lib/server/amigues/profiles.js';
import { relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { clientAddress, clientHash } from '$lib/server/tickets/safeguards.js';
import { contentForProfilePage } from '$lib/server/personas/index.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';

/**
 * La página de un perfil: el perfil de la base (con la misma dirección que la ficha .md:
 * /amigues/<slug viejo>); si hay un perfil con esa dirección y quien mira no lo puede ver (oculto,
 * sin aprobar, borrado), 404, aunque el .md siga. Sin base, o si la base no tiene un perfil con
 * esa dirección (una ficha sin importar), la ficha .md como siempre. Ver docs/amigues.md.
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ params, platform, locals, setHeaders }) {
	const db = getDB(platform);
	if (db) {
		// Una sola lectura de las publicaciones para toda la página (nadie las modifica).
		const posts = await sitePosts(platform);
		const page = await profilePageData(db, params.profile, locals, { posts });
		if (page) {
			if (page.private) setHeaders({ 'cache-control': 'private, no-store' });
			return {
				...page,
				// Eventos y publicaciones que nombran al perfil (por la dirección del objeto), por rol
				// (solo si el perfil es público; si no, `null`).
				participa: await contentForProfilePage(platform, page.objectSlug, async () => [
					...posts,
					...(await fetchMarkdownPosts(true))
				])
			};
		}
		if (await profileSlugTaken(db, params.profile)) error(404, 'Not found');
	}
	// 404s for missing/unpublished profiles. The content component can't be serialized,
	// so +page.js loads it on its own.
	// eslint-disable-next-line no-unused-vars
	const { content, ...post } = await fetchPost('amigues', params.profile);
	// Un lugar vinculado manda sobre el «Dónde» del .md de cada evento.
	const related = await relatedWithVenuePlaces(
		db,
		currentRelated(relatedPostsFor(post.meta, await sitePosts(platform)))
	);
	return {
		mode: /** @type {const} */ ('md'),
		...post,
		...related,
		// «Comprar entradas» / «Agotadas» en las tarjetas de "Más cosas de…".
		ticketStates: await ticketStatesFor(platform, related.relatedPosts),
		pronouns: await mentionPronouns()
	};
}

/** @type {import("./$types").Actions} */
export const actions = {
	// "Es mi perfil": una cuenta con el permiso de perfiles pide hacerse cargo (lo aprueba une
	// admin). Sin base, como si no existiera; sin sesión, pide ingresar.
	esMiPerfil: async (event) => {
		const { params, platform, locals, request } = event;
		const db = getDB(platform);
		if (!db) error(404, 'Not found');
		if (!locals.member)
			return fail(401, { claim: { ok: false, message: 'Ingresá para pedirlo.' } });
		const ref = await resolveProfileSlug(db, params.profile);
		const form = await request.formData();
		const message = form.get('mensaje');
		const result = await createClaim(db, {
			accountId: locals.member.id,
			profileId: ref?.id ?? 0,
			message: typeof message === 'string' ? message : '',
			connection: await clientHash(clientAddress(event))
		});
		if (!result.ok) {
			if (result.status === 404) error(404, 'Not found');
			return fail(result.status, { claim: { ok: false, message: result.message } });
		}
		return { claim: { ok: true, message: result.message } };
	}
};
