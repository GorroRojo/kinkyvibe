/**
 * CSV de las respuestas de inscripción para quien organiza el evento (mismas reglas que la
 * página: src/lib/server/personas/organiza.js), con límite por cuenta. Solo nombre y respuestas.
 */
import { error } from '@sveltejs/kit';
import { csvFilename, csvResponse, toCsv } from '$lib/admin/csv.js';
import {
	logOrganizerAccess,
	organizerAnswers,
	organizerCsvAllowed,
	requireOrganizer
} from '$lib/server/personas/organiza.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	const access = await requireOrganizer(event);
	const limit = await organizerCsvAllowed(access.db, access.member.id);
	if (!limit.allowed) {
		error(429, 'Bajaste muchos CSV seguidos. Esperá un rato y probá de nuevo.');
	}
	const { columns, rows } = await organizerAnswers(access.db, access.event.slug);
	await logOrganizerAccess(access.db, access, { csv: true });
	/** @type {import('$lib/admin/csv.js').CsvColumn<{ name: string, values: string[] }>[]} */
	const csvColumns = [
		{ label: 'nombre', value: (r) => r.name },
		...columns.map((c, i) => ({
			label: c.label,
			value: (/** @type {{ values: string[] }} */ r) => r.values[i]
		}))
	];
	return csvResponse(toCsv(rows, csvColumns), csvFilename('respuestas', access.event.slug));
}
