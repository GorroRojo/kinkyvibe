/**
 * Ajustes → Admins: quién puede entrar al panel. Por ahora solo lectura: la lista vive en
 * `src/lib/server/auth.js` (ADMINS, por id numérico de GitHub).
 */
import { ADMINS, requireAdmin } from '$lib/server/auth';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url }) {
	const me = requireAdmin(locals, url);
	return {
		admins: ADMINS.map((a) => ({
			id: a.id,
			login: a.login,
			// Por id (no por login): el id de GitHub no cambia aunque cambie el nombre de usuarie.
			avatar: `https://avatars.githubusercontent.com/u/${a.id}?s=96`,
			me: a.id === me.id
		}))
	};
}
