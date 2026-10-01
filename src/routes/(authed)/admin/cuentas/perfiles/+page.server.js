/**
 * Cuentas → Perfiles: todos los perfiles (también ocultos y borrados), con quiénes los gestionan,
 * búsqueda por nombre o dirección, filtros (para revisar, sin aprobar, ocultos, borrados) y por
 * tipo (persona, grupo, lugar), y los pedidos "Es mi perfil" pendientes. Solo admins.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import {
	PROFILE_FILTERS,
	PROFILE_KIND_FILTERS,
	listProfiles
} from '$lib/server/admin/cuentas.js';
import { listClaims } from '$lib/server/amigues/claims.js';
import { claimDecisionAction } from '$lib/server/admin/amiguesRoutes.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const q = (url.searchParams.get('q') ?? '').slice(0, 200);
	const raw = url.searchParams.get('filtro') ?? '';
	const filter = raw in PROFILE_FILTERS ? raw : '';
	const rawKind = url.searchParams.get('tipo') ?? '';
	const kind = rawKind in PROFILE_KIND_FILTERS ? rawKind : '';
	const empty = {
		dbAvailable: false,
		q,
		filter,
		kind,
		filters: PROFILE_FILTERS,
		kinds: PROFILE_KIND_FILTERS,
		profiles: /** @type {Awaited<ReturnType<typeof listProfiles>>['profiles']} */ ([]),
		counts: { total: 0, toReview: 0, hidden: 0, deleted: 0 },
		claims: /** @type {Awaited<ReturnType<typeof listClaims>>} */ ([])
	};
	const db = getDB(platform);
	if (!db) return empty;
	try {
		const [{ profiles, counts }, claims] = await Promise.all([
			listProfiles(db, { q, filter, kind }),
			listClaims(db).catch((error) => {
				logDBError('panel: pedidos de perfiles', error);
				return [];
			})
		]);
		return { ...empty, dbAvailable: true, profiles, counts, claims };
	} catch (error) {
		logDBError('panel: perfiles', error);
		return empty;
	}
}

/** @type {import('./$types').Actions} */
export const actions = { pedido: claimDecisionAction };
