/**
 * CSV de las respuestas de un formulario para quien organiza el evento (mismas reglas que la
 * página: src/lib/server/formularios/organiza.js), con el límite por cuenta de las respuestas de
 * inscripción. Sin mails; nombres solo si la privacidad de hoy los deja ver.
 */
import { error } from '@sveltejs/kit';
import { csvFilename, csvResponse, toCsv } from '$lib/admin/csv.js';
import { logFormResponsesViewed } from '$lib/server/admin/accountEvents.js';
import { requireOrganizerForm } from '$lib/server/formularios/organiza.js';
import { responsesView } from '$lib/server/formularios/responses.js';
import { organizerCsvAllowed } from '$lib/server/personas/organiza.js';
import { responsesCsvRows } from '$lib/utils/formularios.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	const access = await requireOrganizerForm(event);
	const limit = await organizerCsvAllowed(access.db, access.member.id);
	if (!limit.allowed) error(429, 'Bajaste muchos CSV seguidos. Esperá un rato y probá de nuevo.');
	const view = await responsesView(access.db, access.form, { emails: false });
	const [head, ...rows] = responsesCsvRows(
		access.form.questions,
		view.responses,
		access.form.privacy
	);
	// Sin la columna «mail» (vacía para les organizadores).
	const keep = head.map((label, i) => (label === 'mail' ? -1 : i)).filter((i) => i >= 0);
	await logFormResponsesViewed(access.db, {
		accountId: access.member.id,
		profile: { id: access.profile.id, title: access.profile.title },
		eventSlug: access.event.slug,
		formId: access.form.id,
		formTitle: access.form.title,
		csv: true
	});
	/** @type {import('$lib/admin/csv.js').CsvColumn<string[]>[]} */
	const columns = keep.map((i) => ({ label: head[i], value: (/** @type {string[]} */ r) => r[i] }));
	return csvResponse(toCsv(rows, columns), csvFilename('respuestas', access.form.slug));
}
