import { error, fail } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { findProfileForPage, profilePageFrom } from '$lib/server/amigues/pages.js';
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
	// Una sola lectura de las publicaciones para toda la página (nadie las modifica), a la par del
	// perfil: la base está lejos y cada consulta que espera a otra es una ida y vuelta más. Si
	// falla, la página falla como antes (también antes de un 404).
	const postsP = sitePosts(platform);
	postsP.catch(() => {});
	const found = await findProfileForPage(db, params.profile, locals);
	if (!found) {
		await postsP;
		error(404, 'Not found');
	}
	const [page, pronouns, participa] = await Promise.all([
		profilePageFrom(db, found, locals, { posts: postsP }),
		// Los pronombres de las @menciones del texto.
		postsP.then((posts) => mentionPronouns(platform, posts)),
		// Eventos y publicaciones que nombran al perfil (por la dirección del objeto), por rol
		// (solo si el perfil es público; si no, `null`).
		contentForProfilePage(platform, found.object.slug, async () => [
			...(await postsP),
			...(await siteWikiPosts(platform))
		])
	]);
	if (page.private) setHeaders({ 'cache-control': 'private, no-store' });
	return { ...page, pronouns, participa };
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
