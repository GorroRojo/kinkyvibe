import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { profilePageData } from '$lib/server/amigues/pages.js';
import { hasContact, profileVcard } from '$lib/utils/vcard.js';

/**
 * GET /amigues/<perfil>/contacto.vcf: la tarjeta de contacto del perfil, con las mismas reglas que
 * su página (quién lo puede ver, privacidad del lugar). Sin contacto público, 404.
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ params, platform, locals }) {
	const db = getDB(platform);
	if (!db) error(404, 'Not found');
	const page = await profilePageData(db, params.profile, locals, { posts: [] });
	if (!page || !hasContact(page.profile)) error(404, 'Not found');
	const file = `${page.profile.slug.replace(/[^\w-]+/g, '-') || 'contacto'}.vcf`;
	return new Response(profileVcard(page), {
		headers: {
			'content-type': 'text/vcard; charset=utf-8',
			'content-disposition': `attachment; filename="${file}"`,
			// Un perfil que no es público (lo ve una cuenta o une admin) no queda en ninguna caché.
			'cache-control': page.private ? 'private, no-store' : 'public, max-age=300'
		}
	});
}
