/**
 * Quién puede subir y elegir imágenes (docs/imagenes.md):
 * - les admins del panel: todo (subir, buscar en toda la biblioteca, borrar);
 * - una cuenta del público que gestiona al menos un perfil (Mi rincón, para la imagen del
 *   perfil): subir, buscar solo entre las que subió ella y borrar una que subió ella si nada la
 *   usa (decisión de gorrite; `deleteOwnImage` en library.js).
 * Nadie más (ni sin sesión).
 */
import { isAdmin } from '$lib/server/auth';
import { accountActor, memberViewer } from '$lib/server/cuentas/perfiles.js';

/**
 * @typedef {{ role: 'admin' | 'member', actor: string,
 *   viewer: import('$lib/server/objects/visibility.js').Viewer, createdBy?: string,
 *   accountId?: string }} ImageAccess
 */

/**
 * @param {App.Locals} locals
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @returns {Promise<ImageAccess | null>}
 */
export async function imageAccess(locals, db) {
	if (locals.user && locals.user_token && isAdmin(locals.user)) {
		const login = locals.user.login;
		return { role: 'admin', actor: login, viewer: { role: 'admin', id: login } };
	}
	const accountId = locals.member?.id;
	if (accountId && db) {
		const row = await db
			.prepare('SELECT 1 AS ok FROM profile_managers WHERE account_id = ?1 LIMIT 1')
			.bind(accountId)
			.first();
		if (row) {
			const actor = accountActor(accountId);
			return {
				role: 'member',
				actor,
				viewer: memberViewer(accountId),
				createdBy: actor,
				accountId
			};
		}
	}
	return null;
}
