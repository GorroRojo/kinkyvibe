/**
 * Propinas (docs/propinas.md): total, por mes, por publicación y la lista, con CSV. Solo admins.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { propinasEnabled } from '$lib/server/flags.js';
import { listTips, tipSummary } from '$lib/server/propinas/index.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	/** @type {Awaited<ReturnType<typeof tipSummary>> | null} */
	let summary = null;
	/** @type {Awaited<ReturnType<typeof listTips>>} */
	let tips = [];
	if (db) {
		try {
			[summary, tips] = await Promise.all([tipSummary(db), listTips(db)]);
		} catch (error) {
			// Sin la migración 0019 todavía: la página se ve vacía, no rota.
			logDBError('list tips', error);
		}
	}
	return {
		dbAvailable: Boolean(db),
		enabled: await propinasEnabled(platform),
		summary,
		tips
	};
}
