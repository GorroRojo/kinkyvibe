/**
 * Mi rincón → un perfil → Respuestas de inscripción de un evento que organiza. Quién entra y qué
 * se ve: src/lib/server/personas/organiza.js (si no corresponde, 404).
 */
import {
	logOrganizerAccess,
	organizerAnswers,
	requireOrganizer
} from '$lib/server/personas/organiza.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const access = await requireOrganizer(event);
	const answers = await organizerAnswers(access.db, access.event.slug);
	await logOrganizerAccess(access.db, access, { csv: false });
	return {
		profile: { slug: access.profile.slug, title: access.profile.title },
		event: access.event,
		...answers
	};
}
