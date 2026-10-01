/**
 * Mi rincón → Perfiles: los perfiles que gestiona la cuenta, crear uno nuevo, las invitaciones
 * a gestionar grupos y los grupos que sumaron a sus perfiles de persona (con "Salir" a un clic). Reglas en src/lib/server/cuentas/perfiles.js; docs/cuentas.md («Perfiles»).
 * Con el interruptor `cuentas` apagado da 404; sin sesión, lleva a /ingresar.
 */
import { fail, redirect } from '@sveltejs/kit';
import { logDBError } from '$lib/server/db';
import {
	answerInvite,
	createProfile,
	leaveMembership,
	listMyMemberships,
	listMyProfiles,
	myInvites
} from '$lib/server/cuentas/perfiles.js';
import { field, requireMember } from '$lib/server/cuentas/perfilesWeb.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const { db, member } = await requireMember(event);
	const [profiles, invites, memberships] = await Promise.all([
		listMyProfiles(db, member.id),
		myInvites(db, member.id),
		listMyMemberships(db, member.id)
	]);
	return {
		profiles: profiles.map((p) => ({
			slug: p.slug,
			title: p.title,
			kind: p.kind,
			visibility: p.visibility,
			role: p.role
		})),
		invites,
		memberships
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	crear: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const input = {
			kind: field(form, 'kind', 20),
			title: field(form, 'title', 400),
			visibility: field(form, 'visibility', 20)
		};
		let result;
		try {
			result = await createProfile(db, member.id, input);
		} catch (e) {
			logDBError('perfiles: crear', e);
			return fail(500, { action: 'crear', error: 'No se pudo crear. Probá de nuevo.', input });
		}
		if (!result.ok) {
			return fail(result.status, {
				action: 'crear',
				error: result.message,
				errors: result.errors ?? {},
				input
			});
		}
		redirect(303, `/mi-rincon/perfiles/${result.profile.slug}?nuevo=1`);
	},

	aceptar: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const result = await answerInvite(db, member.id, field(form, 'invite', 40), true);
		if (!result.ok) return fail(result.status, { action: 'invitacion', error: result.message });
		redirect(303, `/mi-rincon/perfiles/${result.slug}`);
	},

	salirGrupo: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		let result;
		try {
			result = await leaveMembership(
				db,
				member.id,
				field(form, 'persona', 300),
				field(form, 'group', 20)
			);
		} catch (e) {
			logDBError('perfiles: salir de un grupo', e);
			return fail(500, { action: 'grupos', error: 'No se pudo guardar. Probá de nuevo.' });
		}
		if (!result.ok) return fail(result.status, { action: 'grupos', error: result.message });
		return { action: 'grupos', message: 'Listo: ya no sos parte de ese grupo.' };
	},

	rechazar: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const result = await answerInvite(db, member.id, field(form, 'invite', 40), false);
		if (!result.ok) return fail(result.status, { action: 'invitacion', error: result.message });
		return { action: 'invitacion', message: 'Listo: rechazaste la invitación.' };
	}
};
