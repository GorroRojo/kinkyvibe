/**
 * Mi rincón → un perfil → Respuestas de inscripción de un evento que organiza. Quién entra y qué
 * se ve: src/lib/server/personas/organiza.js (si no corresponde, 404).
 */
import {
	logOrganizerAccess,
	organizerAnswers,
	requireOrganizer
} from '$lib/server/personas/organiza.js';
import { formsForOrganizer } from '$lib/server/formularios/organiza.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const access = await requireOrganizer(event);
	const [answers, forms] = await Promise.all([
		organizerAnswers(access.db, access.event.slug),
		// Los formularios de este evento (la encuesta, por ejemplo): con el interruptor `formularios`.
		formsForOrganizer(event.platform, access.db, access.event.slug)
	]);
	await logOrganizerAccess(access.db, access, { csv: false });
	return {
		profile: { slug: access.profile.slug, title: access.profile.title },
		event: access.event,
		forms,
		...answers
	};
}
