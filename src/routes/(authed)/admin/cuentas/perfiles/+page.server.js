/**
 * Cuentas → Perfiles: todos los perfiles (también ocultos y borrados), con quiénes los gestionan,
 * búsqueda por nombre o dirección y filtros (para revisar, ocultos, borrados). Solo admins.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { PROFILE_FILTERS, listProfiles } from '$lib/server/admin/cuentas.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const q = (url.searchParams.get('q') ?? '').slice(0, 200);
	const raw = url.searchParams.get('filtro') ?? '';
	const filter = raw in PROFILE_FILTERS ? raw : '';
	const empty = {
		dbAvailable: false,
		q,
		filter,
		filters: PROFILE_FILTERS,
		profiles: /** @type {Awaited<ReturnType<typeof listProfiles>>['profiles']} */ ([]),
		counts: { total: 0, toReview: 0, hidden: 0, deleted: 0 }
	};
	const db = getDB(platform);
	if (!db) return empty;
	try {
		const { profiles, counts } = await listProfiles(db, { q, filter });
		return { ...empty, dbAvailable: true, profiles, counts };
	} catch (error) {
		logDBError('panel: perfiles', error);
		return empty;
	}
}
