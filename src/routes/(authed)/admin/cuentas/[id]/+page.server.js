/**
 * Ficha de una cuenta del público: sus datos, sus perfiles y el permiso "puede tener perfiles"
 * (apagado por defecto; solo lo cambian admins, acá). Solo admins: el `load` y la action llaman a
 * `requireAdmin`. Cada cambio del permiso queda en el registro de actividad, sin el mail.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getAccountDetail, setProfilePermission } from '$lib/server/admin/cuentas.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const detail = await getAccountDetail(db, params.id);
	if (!detail) error(404, 'No encontramos esa cuenta.');
	return detail;
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Prender o apagar "puede tener perfiles".
	permiso: async ({ locals, url, params, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { permiso: { ok: false, message: 'Sin base de datos.' } });
		const value = (await request.formData()).get('valor');
		if (value !== '1' && value !== '0') {
			return fail(400, { permiso: { ok: false, message: 'No sabemos qué cambiar.' } });
		}
		const on = value === '1';
		const result = await setProfilePermission(db, params.id, on);
		if (result === 'not_found') {
			return fail(404, {
				permiso: { ok: false, message: 'Esa cuenta no existe o está borrada.' }
			});
		}
		if (result === 'changed') {
			await logAdminAction(db, locals, {
				action: 'account.profiles_permission',
				targetType: 'account',
				targetId: params.id,
				summary: on
					? 'Le dio a una cuenta el permiso para tener perfiles'
					: 'Le sacó a una cuenta el permiso para tener perfiles',
				detail: { canHaveProfiles: on }
			});
		}
		return {
			permiso: {
				ok: true,
				message: on
					? 'Listo: esta cuenta puede tener perfiles.'
					: 'Listo: esta cuenta ya no puede tener perfiles (no los ve, pero quedan guardados).'
			}
		};
	}
};
