/**
 * Eventos › Roles y preguntas (la URL sigue bajo /admin/ajustes/):
 * - roles de personas en eventos: los fijos y los que agregan les admins;
 * - preguntas de inscripción generales: se definen acá y cada evento elige cuáles usa (pestaña
 *   Preguntas de su ficha).
 * Solo admins; todo queda en el registro de actividad. Ver docs/personas-eventos.md.
 *
 * `?/addRole` también lo llama la sección «Personas» de los formularios de eventos y material
 * («+ Nuevo rol…» en el selector de rol: $lib/utils/personasPicker.js `ADD_ROLE_ACTION`), así crear
 * un rol desde ahí tiene la misma validación, los mismos permisos y el mismo registro.
 */
import { fail } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { logDBError } from '$lib/server/db';
import {
	createFieldAction,
	deleteFieldAction,
	updateFieldAction,
	requirePersonasAdmin
} from '$lib/server/personas/admin.js';
import { addRole, listCustomRoles, removeRole } from '$lib/server/personas/roles.js';
import { listGeneralFields } from '$lib/server/tickets/signupFields.js';
import { FIXED_ROLES } from '$lib/utils/personas.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const { db } = await requirePersonasAdmin(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const [custom, fields] = await Promise.all([listCustomRoles(db), listGeneralFields(db)]);
	return {
		roles: [
			...FIXED_ROLES.map((name) => ({ name, fixed: true, createdAt: null, createdBy: null })),
			...custom.map((r) => ({ ...r, fixed: false }))
		],
		fields
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	addRole: async (event) => {
		const { admin, db } = await requirePersonasAdmin(event);
		const name = String((await event.request.formData()).get('name') ?? '').slice(0, 200);
		let result;
		try {
			result = await addRole(db, name, { by: admin.login });
		} catch (e) {
			logDBError('agregar rol', e);
			return fail(500, { role: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
		}
		if (!result.ok)
			return fail(result.status, { role: { ok: false, message: result.message, name } });
		await logAdminAction(db, event.locals, {
			action: 'persona_role.add',
			targetType: 'settings',
			targetId: 'persona_roles',
			summary: `Agregó el rol «${result.name}»`
		});
		// `name`: el rol como quedó (también lo usa «+ Nuevo rol…» de la sección Personas de los
		// formularios, que llama a esta misma acción).
		return { role: { ok: true, name: result.name, message: `Rol «${result.name}» agregado.` } };
	},
	removeRole: async (event) => {
		const { db } = await requirePersonasAdmin(event);
		const name = String((await event.request.formData()).get('name') ?? '').slice(0, 200);
		let result;
		try {
			result = await removeRole(db, name);
		} catch (e) {
			logDBError('sacar rol', e);
			return fail(500, { role: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
		}
		if (!result.ok) return fail(result.status, { role: { ok: false, message: result.message } });
		await logAdminAction(db, event.locals, {
			action: 'persona_role.remove',
			targetType: 'settings',
			targetId: 'persona_roles',
			summary: `Sacó el rol «${result.name}»`
		});
		return {
			role: {
				ok: true,
				message: `Rol «${result.name}» sacado. Las publicaciones que ya lo usan lo siguen mostrando.`
			}
		};
	},
	createField: (event) => createFieldAction(event, null),
	updateField: (event) => updateFieldAction(event, null),
	deleteField: (event) => deleteFieldAction(event, null)
};
