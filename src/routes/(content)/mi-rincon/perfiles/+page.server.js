/**
 * Mi rincón → Perfiles: los perfiles que gestiona la cuenta, crear uno nuevo, las invitaciones
 * a gestionar grupos, las invitaciones de grupos a sus perfiles de persona (aceptar o rechazar,
 * y la opción de no recibirlas) y los grupos de los que son parte (con "Salir" a un clic). Reglas
 * en src/lib/server/cuentas/perfiles.js; docs/cuentas.md («Perfiles»).
 * Con el interruptor `cuentas` apagado da 404; sin sesión, lleva a /ingresar.
 */
import { fail, redirect } from '@sveltejs/kit';
import { logDBError } from '$lib/server/db';
import { getNoGroupInvites, setNoGroupInvites } from '$lib/server/cuentas/accounts.js';
import {
	answerInvite,
	answerMemberInvite,
	createProfile,
	leaveMembership,
	listMyMemberInvites,
	listMyMemberships,
	listMyProfiles,
	myInvites
} from '$lib/server/cuentas/perfiles.js';
import { field, requireMember } from '$lib/server/cuentas/perfilesWeb.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const { db, member } = await requireMember(event);
	const [profiles, invites, memberships, memberInvites, noGroupInvites] = await Promise.all([
		listMyProfiles(db, member.id),
		myInvites(db, member.id),
		listMyMemberships(db, member.id),
		listMyMemberInvites(db, member.id),
		getNoGroupInvites(db, member.id)
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
		memberships,
		memberInvites,
		noGroupInvites
	};
}

/**
 * Aceptar o rechazar la invitación de un grupo a uno de tus perfiles de persona.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {boolean} accept
 */
async function answerGroup(event, accept) {
	const { db, member } = await requireMember(event);
	const form = await event.request.formData();
	let result;
	try {
		result = await answerMemberInvite(
			db,
			member.id,
			field(form, 'persona', 300),
			field(form, 'group', 20),
			accept
		);
	} catch (e) {
		logDBError('perfiles: responder invitación de grupo', e);
		return fail(500, { action: 'grupos', error: 'No se pudo guardar. Probá de nuevo.' });
	}
	if (!result.ok) return fail(result.status, { action: 'grupos', error: result.message });
	return {
		action: 'grupos',
		message: accept
			? 'Listo: ya sos parte del grupo. Te podés ir cuando quieras.'
			: 'Listo: rechazaste la invitación. Ese grupo no te puede volver a invitar por 30 días.'
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

	aceptarGrupo: async (event) => answerGroup(event, true),

	rechazarGrupo: async (event) => answerGroup(event, false),

	// "No recibir invitaciones de grupos" (de la cuenta, para todos sus perfiles de persona).
	invitacionesGrupos: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const off = form.get('recibir') === 'no';
		try {
			await setNoGroupInvites(db, member.id, off);
		} catch (e) {
			logDBError('perfiles: invitaciones de grupos', e);
			return fail(500, {
				action: 'invitacionesGrupos',
				error: 'No se pudo guardar. Probá de nuevo.'
			});
		}
		return {
			action: 'invitacionesGrupos',
			message: off
				? 'Listo: no vas a recibir invitaciones de grupos.'
				: 'Listo: vas a recibir invitaciones de grupos.'
		};
	},

	rechazar: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const result = await answerInvite(db, member.id, field(form, 'invite', 40), false);
		if (!result.ok) return fail(result.status, { action: 'invitacion', error: result.message });
		return { action: 'invitacion', message: 'Listo: rechazaste la invitación.' };
	}
};
