/**
 * Mi rincón → un perfil que gestiona la cuenta: editarlo (con aviso si alguien lo cambió
 * mientras tanto), y según el tipo, quiénes lo gestionan e integrantes (proyectos) o los proyectos de
 * los que es parte (personas). Dejar de gestionar y borrar, con la confirmación en la página.
 *
 * Todas las reglas están en src/lib/server/cuentas/perfiles.js. Si la cuenta no gestiona el
 * perfil, da 404 (como si no existiera).
 *
 * Hacer dueñe a alguien, sacarle la propiedad o sacar a otre dueñe, y borrar el proyecto piden un
 * código fresco por mail (purpose 'grupo'), como la contraseña en Mi rincón: ?/confirmar lo manda
 * y la acción lo verifica y lo gasta (perfiles.js decide cuándo hace falta).
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { logDBError } from '$lib/server/db';
import {
	MESSAGES,
	cancelInvite,
	deleteProfile,
	getManagedProfile,
	inviteManager,
	inviteMember,
	listGroupMemberInvites,
	leaveMembership,
	leaveProfile,
	listGroupMembers,
	listManagers,
	listMemberships,
	removeManager,
	resubmitVenue,
	removeMember,
	setManagerRole,
	updateProfile,
	withdrawMemberInvite
} from '$lib/server/cuentas/perfiles.js';
import {
	field,
	inviteNotice,
	profileForm,
	requireMember
} from '$lib/server/cuentas/perfilesWeb.js';
import { checkConfirmCode, requestConfirmCode } from '$lib/server/cuentas/index.js';
import { approvalOf } from '$lib/server/amigues/approvals.js';
import { rejectionOf } from '$lib/server/amigues/pendingVenues.js';
import { coordinateText, reviewState } from '$lib/utils/venues.js';
import { clientOf, mailSender } from '$lib/server/cuentas/web.js';
import { organizedEventsForPage } from '$lib/server/personas/organiza.js';
import { accountActor, memberViewer } from '$lib/server/cuentas/perfiles.js';
import { findImage, imageOf, memberMayUse } from '$lib/server/media/library.js';
import { readImageChoice } from '$lib/utils/imageChoice.js';

/** Dónde se pidió el código (para mostrar el aviso en esa parte de la página). */
const CONFIRM_PLACES = ['gestion', 'borrar'];

/**
 * El código fresco que escribió la persona, para perfiles.js (que lo pide solo si hace falta).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ email: string }} member
 * @param {FormData} form
 * @returns {import('$lib/server/cuentas/perfiles.js').StepUp}
 */
function groupStepUp(event, db, member, form) {
	return async () => {
		// Sin el campo (todavía no pidió el código): lo mismo que si no hubiera `stepUp`.
		if (!form.has('code')) return { ok: false, status: 403, message: MESSAGES.needsCode };
		const result = await checkConfirmCode({
			db,
			email: member.email,
			purpose: 'grupo',
			code: field(form, 'code', 20),
			client: await clientOf(event)
		});
		return result.ok ? null : result;
	};
}

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
	const group = kind === 'proyecto';
	const managers = group ? await listManagers(db, member.id, slug) : null;
	/** @param {unknown} v */
	const str = (v) => (typeof v === 'string' ? v : '');
	const d = profile.data;
	// Solo los lugares se rechazan (Panel → Eventos → Lugares); el rechazo lo ve quien lo cargó.
	const [approval, rejection] = await Promise.all([
		approvalOf(db, profile.id),
		kind === 'lugar' ? rejectionOf(db, profile.id) : null
	]);
	const review = reviewState(Boolean(approval), Boolean(rejection));
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
			show_members: profile.data.show_members === true,
			venue:
				kind === 'lugar'
					? {
							address: str(d.address),
							area: str(d.area),
							city: str(d.city),
							accessibility: str(d.accessibility),
							how_to_get_there: str(d.how_to_get_there),
							venue_privacy: str(d.venue_privacy),
							lat: coordinateText(d.lat),
							lng: coordinateText(d.lng)
						}
					: null
		},
		// La imagen del perfil (edge `avatar`, docs/imagenes.md), para el selector de imágenes.
		avatar: await imageOf(db, profile.id, 'avatar', memberViewer(member.id)).catch(() => null),
		// Sin aprobar no aparece en el sitio (decisión de gorrite: los perfiles y lugares nuevos de
		// las cuentas esperan a une admin). Un lugar rechazado tampoco, pero quien lo cargó lo sigue
		// viendo, con el motivo, y lo vuelve a mandar con «Volver a mandar» (perfiles.js).
		pending: review === 'pending',
		rejection:
			review === 'rejected' && rejection ? { at: rejection.at, reason: rejection.reason } : null,
		role,
		isNew: event.url.searchParams.get('nuevo') === '1',
		managers: managers?.ok ? managers.managers : [],
		invites: managers?.ok ? managers.invites : [],
		members: group ? await listGroupMembers(db, member.id, slug) : [],
		pendingMembers: group ? await listGroupMemberInvites(db, member.id, slug) : [],
		memberships: group || kind === 'lugar' ? [] : await listMemberships(db, member.id, slug),
		// Eventos que este perfil organiza (rol «Organiza»), con link a sus respuestas de
		// inscripción. Vacío para los lugares.
		organizes: kind === 'lugar' ? [] : await organizedEventsForPage(event.platform, profile.slug)
	};
}

/**
 * Resultado de un helper → respuesta de la action. Si el formulario traía un código y algo falló,
 * el campo del código sigue abierto (`codeSentFor`) para corregirlo o pedir otro.
 *
 * @param {string} action
 * @param {{ ok: true } | { ok: false, status: number, message: string, errors?: Record<string, string> }} result
 * @param {string} message
 * @param {FormData} [form]
 */
function reply(action, result, message, form) {
	if (!result.ok) {
		const codeSentFor = form?.has('code') ? 'grupo' : undefined;
		return fail(result.status, {
			action,
			error: result.message,
			errors: result.errors ?? {},
			...(codeSentFor ? { codeSentFor } : {})
		});
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
		// La imagen elegida en el selector: una que subió esta cuenta (o la que ya tenía el perfil).
		const choice = readImageChoice(form.get('imageId'));
		/** @type {number | null | undefined} */
		let avatar;
		if (choice.action === 'remove') avatar = null;
		if (choice.action === 'set') {
			const found = await getManagedProfile(db, member.id, slug);
			const image = await findImage(db, choice.id, memberViewer(member.id));
			const allowed =
				image && found
					? await memberMayUse(db, image.id, {
							actor: accountActor(member.id),
							objectId: found.profile.id
						})
					: false;
			if (!image || !allowed) {
				return fail(400, {
					action: 'guardar',
					error: 'La imagen elegida ya no está disponible. Elegí otra o subila de nuevo.',
					errors: {},
					draft
				});
			}
			avatar = image.id;
		}
		let result;
		try {
			result = await updateProfile(db, member.id, slug, {
				...draft,
				version,
				...(avatar !== undefined ? { avatar } : {})
			});
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

	// «Volver a mandar» un lugar rechazado (decisión de gorrite): editar no alcanza.
	volverAMandar: async (event) => {
		const { db, member, slug } = await managed(event);
		return guarded('revision', async () =>
			reply(
				'revision',
				await resubmitVenue(db, member.id, slug),
				'Listo: lo volvimos a mandar. Une admin lo va a revisar.'
			)
		);
	},

	invitar: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('invitar', async () => {
			// El aviso por mail (si ese mail tiene cuenta) sale después de responder: la respuesta
			// es la misma en los dos casos. Ver inviteManager en perfiles.js.
			const result = await inviteManager(db, member.id, slug, field(form, 'email', 300), {
				notice: inviteNotice(event, db)
			});
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

	// Paso 1 de las acciones de dueñes y de borrar el proyecto: manda el código para confirmar.
	confirmar: async (event) => {
		const { db, member, found } = await managed(event);
		const form = await event.request.formData();
		const place = field(form, 'donde', 20);
		const action = CONFIRM_PLACES.includes(place) ? place : 'gestion';
		// Solo dueñes de un proyecto (así nadie más la usa para mandar mails).
		if (found.kind !== 'proyecto' || found.role !== 'owner') {
			return fail(403, { action, error: 'Eso lo puede hacer solo quien es dueñe del proyecto.' });
		}
		try {
			const result = await requestConfirmCode({
				db,
				email: member.email,
				purpose: 'grupo',
				client: await clientOf(event),
				send: mailSender(event, db)
			});
			if (!result.ok) return fail(result.status, { action, error: result.message, errors: {} });
		} catch (e) {
			logDBError('perfiles: código para confirmar', e);
			return fail(500, { action, error: 'Algo falló. Probá de nuevo.', errors: {} });
		}
		return {
			action,
			codeSentFor: 'grupo',
			message: 'Te mandamos un código a tu mail para confirmar.'
		};
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
					field(form, 'role', 20),
					{ stepUp: groupStepUp(event, db, member, form) }
				),
				'Listo.',
				form
			)
		);
	},

	sacar: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('gestion', async () =>
			reply(
				'gestion',
				await removeManager(db, member.id, slug, field(form, 'account', 40), {
					stepUp: groupStepUp(event, db, member, form)
				}),
				'Listo: ya no gestiona este perfil.',
				form
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
				errors: {},
				...(form.has('code') ? { codeSentFor: 'grupo' } : {})
			});
		}
		const version = Number(field(form, 'version', 20));
		const result = await guarded('borrar', async () =>
			reply(
				'borrar',
				await deleteProfile(db, member.id, slug, version, {
					stepUp: groupStepUp(event, db, member, form)
				}),
				'',
				form
			)
		);
		if ('status' in result) return result;
		redirect(303, '/mi-rincon/perfiles');
	},

	salirGrupo: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('proyectos', async () =>
			reply(
				'proyectos',
				await leaveMembership(db, member.id, slug, field(form, 'group', 20)),
				'Listo: ya no sos parte de ese proyecto.'
			)
		);
	},

	invitarIntegrante: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('integrantes', async () => {
			const result = await inviteMember(db, member.id, slug, field(form, 'persona', 300));
			return reply('integrantes', result, result.ok ? result.message : '');
		});
	},

	retirarInvitacionIntegrante: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('integrantes', async () =>
			reply(
				'integrantes',
				await withdrawMemberInvite(db, member.id, slug, field(form, 'persona', 20)),
				'Listo: retiraste la invitación.'
			)
		);
	},

	sacarIntegrante: async (event) => {
		const { db, member, slug } = await managed(event);
		const form = await event.request.formData();
		return guarded('integrantes', async () =>
			reply(
				'integrantes',
				await removeMember(db, member.id, slug, field(form, 'persona', 20)),
				'Listo: ya no figura en el proyecto.'
			)
		);
	}
};
