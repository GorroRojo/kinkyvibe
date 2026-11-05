/**
 * CSV de las respuestas de un formulario (docs/formularios.md): una columna por pregunta y, si
 * la privacidad de hoy muestra nombres, «nombre» y «mail» (vacías en las anónimas). Solo el día,
 * nunca la hora. Mezcladas si hay anónimas. Bajarlo queda en Actividad. Solo admins.
 */
import { error } from '@sveltejs/kit';
import { csvFilename, csvResponse, toCsv } from '$lib/admin/csv.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { formOr404, requireFormsAdmin } from '$lib/server/formularios/admin.js';
import { responsesView } from '$lib/server/formularios/responses.js';
import { responsesCsvRows } from '$lib/utils/formularios.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	const { db } = await requireFormsAdmin(event);
	const form = await formOr404(db, event.params.id);
	if (form.kind === 'template') error(404, 'Not found');
	const view = await responsesView(db, form);
	const [head, ...rows] = responsesCsvRows(form.questions, view.responses, form.privacy);
	await logAdminAction(db, event.locals, {
		action: 'form.responses.csv',
		targetType: 'form',
		targetId: String(form.id),
		summary: `Bajó el CSV de las respuestas de «${form.title}»`
	});
	/** @type {import('$lib/admin/csv.js').CsvColumn<string[]>[]} */
	const columns = head.map((label, i) => ({ label, value: (/** @type {string[]} */ r) => r[i] }));
	return csvResponse(toCsv(rows, columns), csvFilename('respuestas', form.slug));
}
