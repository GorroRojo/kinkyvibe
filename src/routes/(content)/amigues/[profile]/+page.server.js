import { error, fail } from '@sveltejs/kit';
import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { mentionPronouns } from '$lib/server/pronouns';
import { getDB } from '$lib/server/db';
import { cuentasEnabled, perfilesPublicosEnabled } from '$lib/server/flags.js';
import { profilePageData, profileSlugTaken } from '$lib/server/amigues/pages.js';
import { createClaim } from '$lib/server/amigues/claims.js';
import { resolveProfileSlug } from '$lib/server/amigues/profiles.js';
import { clientAddress, clientHash } from '$lib/server/tickets/safeguards.js';
import { contentForProfilePage } from '$lib/server/personas/index.js';

/**
 * La página de un perfil. Con el interruptor `perfiles_publicos` prendido, el perfil de la base
 * (con la misma dirección que la ficha .md: /amigues/<slug viejo>); si hay un perfil con esa
 * dirección y quien mira no lo puede ver (oculto, sin aprobar, borrado), 404, aunque el .md siga.
 * Apagado, la ficha .md como siempre. Ver docs/amigues.md.
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ params, platform, locals, setHeaders }) {
	const db = getDB(platform);
	if (db && (await perfilesPublicosEnabled(platform))) {
		const page = await profilePageData(db, params.profile, locals, {
			cuentas: await cuentasEnabled(platform)
		});
		if (page) {
			if (page.private) setHeaders({ 'cache-control': 'private, no-store' });
			return {
				...page,
				// Eventos y publicaciones que nombran al perfil (por la dirección del objeto), por rol
				// (interruptor `personas_eventos`, solo si el perfil es público; si no, `null`).
				participa: await contentForProfilePage(platform, page.objectSlug, async () => [
					...(await fetchMarkdownPosts()),
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
	return {
		mode: /** @type {const} */ ('md'),
		...post,
		...currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts())),
		pronouns: await mentionPronouns()
	};
}

/** @type {import("./$types").Actions} */
export const actions = {
	// "Es mi perfil": una cuenta con el permiso de perfiles pide hacerse cargo (lo aprueba une
	// admin). Sin el interruptor, sin cuentas o sin sesión, como si no existiera.
	esMiPerfil: async (event) => {
		const { params, platform, locals, request } = event;
		const db = getDB(platform);
		if (!db || !(await perfilesPublicosEnabled(platform)) || !(await cuentasEnabled(platform))) {
			error(404, 'Not found');
		}
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
