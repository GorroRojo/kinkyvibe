/**
 * Mi rincón → un perfil → Respuestas de un evento que organiza → un formulario (la encuesta, por
 * ejemplo). Quién entra y qué se ve: src/lib/server/formularios/organiza.js (si no corresponde,
 * 404). Sin mails; con nombre solo si la privacidad de hoy lo deja ver.
 */
import { logFormResponsesViewed } from '$lib/server/admin/accountEvents.js';
import { requireOrganizerForm } from '$lib/server/formularios/organiza.js';
import { responsesView } from '$lib/server/formularios/responses.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const access = await requireOrganizerForm(event);
	const view = await responsesView(access.db, access.form, { emails: false });
	await logFormResponsesViewed(access.db, {
		accountId: access.member.id,
		profile: { id: access.profile.id, title: access.profile.title },
		eventSlug: access.event.slug,
		formId: access.form.id,
		formTitle: access.form.title,
		csv: false
	});
	return {
		profile: { slug: access.profile.slug, title: access.profile.title },
		event: access.event,
		form: {
			id: access.form.id,
			kind: access.form.kind,
			title: access.form.title,
			privacy: access.form.privacy
		},
		...view
	};
}
