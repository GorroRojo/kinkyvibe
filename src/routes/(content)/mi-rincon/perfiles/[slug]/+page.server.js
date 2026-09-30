/**
 * Mi rincón → un perfil que gestiona la cuenta: editarlo (con aviso si alguien lo cambió
 * mientras tanto), y según el tipo, quiénes lo gestionan e integrantes (grupos) o los grupos de
 * los que es parte (personas). Dejar de gestionar y borrar, con la confirmación en la página.
 *
 * Todas las reglas están en src/lib/server/cuentas/perfiles.js. Si la cuenta no gestiona el
 * perfil, da 404 (como si no existiera).
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { logDBError } from '$lib/server/db';
import {
	answerMember,
	cancelInvite,
	deleteProfile,
	getManagedProfile,
	inviteManager,
	leaveMembership,
	leaveProfile,
	listGroupMembers,
	listManagers,
	listMemberships,
	removeManager,
	requestMembership,
	setManagerRole,
	updateProfile
} from '$lib/server/cuentas/perfiles.js';
import { field, profileForm, requireMember } from '$lib/server/cuentas/perfilesWeb.js';

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
async function managed(event) {
	const { db, member } = await requireMember(event);
	const slug = event.params.slug ?? '';
	const found = await getManagedProfile(db, member.id, slug);
	if (!found) error(404, 'Not found');
	return { db, member, slug, found };
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const { db, member, slug, found } = await managed(event);
	const { profile, kind, role } = found;
	const group = kind === 'grupo';
	const managers = group ? await listManagers(db, member.id, slug) : null;
	return {
		profile: {
			slug: profile.slug,
			title: profile.title,
			kind,
			visibility: profile.visibility,
			version: profile.version,
			bio: profile.data.bio ?? '',
			pronouns: profile.data.pronouns ?? '',
			links: (profile.data.links ?? []).join('\n'),
			show_members: profile.data.show_members === true
		},
		role,
		isNew: event.url.searchParams.get('nuevo') === '1',
		managers: managers?.ok ? managers.managers : [],
		invites: managers?.ok ? managers.invites : [],
		members: group ? await listGroupMembers(db, member.id, slug) : [],
		memberships: group ? [] : await listMemberships(db, member.id, slug)
	};
}

/**
 * Resultado de un helper → respuesta de la action.
 *
 * @param {string} action
 * @param {{ ok: true } | { ok: false, status: number, message: string, errors?: Record<string, string> }} result
 * @param {string} message
 */
function reply(action, result, message) {
	if (!result.ok) {
		return fail(result.status, { action, error: result.message, errors: result.errors ?? {} });
	}
	return { action, message };
}

/**
 * Corre una action con el mismo manejo de errores de base.
 *
 * @param {string} action
 * @param {() => Promise<ReturnType<typeof reply>>} fn
 */
async function guarded(action, fn) {
	try {
		return await fn();
	} catch (e) {
		logDBError(`perfiles: ${action}`, e);
		return fail(500, { action, error: 'No se pudo guardar. Probá de nuevo.', errors: {} });
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	guardar: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		const draft = profileForm(form);
		const version = Number(field(form, 'version', 20));
		let result;
		try {
			result = await updateProfile(db, member.id, slug, { ...draft, version });
		} catch (e) {
			logDBError('perfiles: guardar', e);
			return fail(500, { action: 'guardar', error: 'No se pudo guardar. Probá de nuevo.', draft });
		}
		if (!result.ok) {
			return fail(result.status, {
				action: 'guardar',
				error: result.message,
				errors: result.errors ?? {},
				// Lo que la persona escribió, para no perderlo (en un conflicto se muestra aparte).
				draft,
				conflict: result.status === 409 && !result.errors
			});
		}
		// El nombre no cambia la dirección (así los links que ya circulan siguen andando).
		return { action: 'guardar', message: 'Guardado.' };
	},

	invitar: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('invitar', async () => {
			const result = await inviteManager(db, member.id, slug, field(form, 'email', 300));
			return reply('invitar', result, result.ok ? result.message : '');
		});
	},

	cancelarInvitacion: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('invitar', async () =>
			reply(
				'invitar',
				await cancelInvite(db, member.id, slug, field(form, 'invite', 40)),
				'Invitación cancelada.'
			)
		);
	},

	rol: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('gestion', async () =>
			reply(
				'gestion',
				await setManagerRole(
					db,
					member.id,
					slug,
					field(form, 'account', 40),
					field(form, 'role', 20)
				),
				'Listo.'
			)
		);
	},

	sacar: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('gestion', async () =>
			reply(
				'gestion',
				await removeManager(db, member.id, slug, field(form, 'account', 40)),
				'Listo: ya no gestiona este perfil.'
			)
		);
	},

	dejar: async (event) => {
		const { db, member, slug } = await managed(event);
		const result = await guarded('dejar', async () =>
			reply('dejar', await leaveProfile(db, member.id, slug), '')
		);
		if ('status' in result) return result;
		redirect(303, '/mi-rincon/perfiles');
	},

	borrar: async (event) => {
		const { db, member, slug, found } = await managed(event);
		const form = await event.request.formData();
		const typed = field(form, 'confirm', 400).trim().toLowerCase();
		if (typed !== found.profile.title.trim().toLowerCase()) {
			return fail(400, {
				action: 'borrar',
				error: 'Para borrarlo, escribí el nombre del perfil tal como está.',
				errors: {}
			});
		}
		const version = Number(field(form, 'version', 20));
		const result = await guarded('borrar', async () =>
			reply('borrar', await deleteProfile(db, member.id, slug, version), '')
		);
		if ('status' in result) return result;
		redirect(303, '/mi-rincon/perfiles');
	},

	sumarme: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('grupos', async () =>
			reply(
				'grupos',
				await requestMembership(db, member.id, slug, field(form, 'group', 300)),
				'Listo: le pediste al grupo sumarte. Aparece como integrante cuando lo acepten.'
			)
		);
	},

	salirGrupo: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('grupos', async () =>
			reply(
				'grupos',
				await leaveMembership(db, member.id, slug, field(form, 'group', 20)),
				'Listo: ya no sos parte de ese grupo.'
			)
		);
	},

	integrante: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		const accept = field(form, 'do', 10) === 'accept';
		return guarded('integrantes', async () =>
			reply(
				'integrantes',
				await answerMember(
					db,
					member.id,
					slug,
					field(form, 'persona', 20),
					accept ? 'accept' : 'remove'
				),
				accept ? 'Listo: ya es integrante.' : 'Listo: ya no figura en el grupo.'
			)
		);
	}
};
