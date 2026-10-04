import { error, fail } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { profilePageData } from '$lib/server/amigues/pages.js';
import { createClaim } from '$lib/server/amigues/claims.js';
import { resolveProfileSlug } from '$lib/server/amigues/profiles.js';
import { clientAddress, clientHash } from '$lib/server/tickets/safeguards.js';
import { contentForProfilePage } from '$lib/server/personas/index.js';
import { siteWikiPosts } from '$lib/server/wiki/site.js';
import { mentionPronouns } from '$lib/server/pronouns';

/**
 * La página de un perfil, solo desde la base («solo base»), con la misma dirección que tenía la
 * ficha .md (/amigues/<slug viejo>). Si la base no tiene un perfil con esa dirección, o quien mira
 * no lo puede ver (oculto, sin aprobar, borrado), 404, aunque el .md siga en el repo (las fichas
 * sin importar se importan primero). Ver docs/amigues.md.
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ params, platform, locals, setHeaders }) {
	const db = getDB(platform);
	if (!db) error(404, 'Not found');
	// Una sola lectura de las publicaciones para toda la página (nadie las modifica).
	const posts = await sitePosts(platform);
	const page = await profilePageData(db, params.profile, locals, { posts });
	if (!page) error(404, 'Not found');
	if (page.private) setHeaders({ 'cache-control': 'private, no-store' });
	return {
		...page,
		// Los pronombres de las @menciones del texto.
		pronouns: await mentionPronouns(platform, posts),
		// Eventos y publicaciones que nombran al perfil (por la dirección del objeto), por rol
		// (solo si el perfil es público; si no, `null`).
		participa: await contentForProfilePage(platform, page.objectSlug, async () => [
			...posts,
			...(await siteWikiPosts(platform))
		])
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
		if (!locals.member) return fail(401, { claim: { ok: false, message: 'Entrá para pedirlo.' } });
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
