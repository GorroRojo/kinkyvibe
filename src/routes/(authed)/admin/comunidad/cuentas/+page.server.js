/**
 * Cuentas: las cuentas del público (docs/cuentas.md), con búsqueda por mail. Solo admins (el
 * `load` llama a `requireAdmin`). Les admins ven el mail: son superadmins de confianza.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { listAccounts } from '$lib/server/admin/cuentas.js';
import { parseAccountSort } from '$lib/admin/cuentas.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const q = (url.searchParams.get('q') ?? '').slice(0, 254);
	// Orden de la tabla (`?orden=mail-asc`), validado contra las columnas que se ordenan.
	const sort = parseAccountSort(url.searchParams.get('orden'));
	const empty = {
		dbAvailable: false,
		q,
		accounts: /** @type {Awaited<ReturnType<typeof listAccounts>>['accounts']} */ ([]),
		totals: { total: 0, active: 0, withProfiles: 0, deleted: 0 }
	};
	const db = getDB(platform);
	if (!db) return empty;
	try {
		const { accounts, totals } = await listAccounts(db, { q, sort });
		return { dbAvailable: true, q, sort, accounts, totals };
	} catch (error) {
		logDBError('panel: cuentas', error);
		return empty;
	}
}
