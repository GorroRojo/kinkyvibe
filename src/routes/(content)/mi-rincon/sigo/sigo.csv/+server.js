/**
 * GET /mi-rincon/sigo/sigo.csv: «Lo que sigo» de la cuenta de la sesión, en CSV (lo mismo que
 * muestra la página). Solo lo de esta cuenta; privado y sin caché (`csvResponse`).
 */
import { csvFilename, csvResponse, toCsv } from '$lib/admin/csv.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { listFollows } from '$lib/server/sigo/follows.js';
import { describeFollows } from '$lib/server/sigo/targets.js';
import { requireSigoMember } from '$lib/server/sigo/web.js';
import { FOLLOW_CSV_COLUMNS } from '$lib/utils/sigo.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	const { db, member } = await requireSigoMember(event);
	const follows = await describeFollows(
		{ db, tags: await siteTagManager(event.platform), accountId: member.id },
		await listFollows(db, member.id)
	);
	return csvResponse(toCsv(follows, FOLLOW_CSV_COLUMNS), csvFilename('lo-que-sigo'));
}
