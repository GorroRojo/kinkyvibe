/**
 * Eventos → Series (interruptor `series`): las series (etiquetas hijas de «evento recurrente»)
 * con sus ediciones y cuántas personas pidieron aviso. Solo admins (sin sesión, al login; sin
 * permiso, 403); con el interruptor apagado, 404. Los mails de quienes piden aviso nunca salen de
 * la base: acá solo se cuentan. Las ediciones se bajan en CSV (ediciones.csv).
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { allSeries } from '$lib/server/series/index.js';
import { subscriberCounts } from '$lib/server/series/subscriptions.js';
import { requireSeries } from '$lib/server/series/web.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	await requireSeries(platform);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	/** @type {Map<string, { confirmed: number, pending: number }>} */
	let counts = new Map();
	if (db) {
		try {
			counts = await subscriberCounts(db);
		} catch (error) {
			logDBError('series: suscripciones', error);
		}
	}
	const series = await allSeries();
	const upcomingSlugs = new Set(series.flatMap((s) => s.upcoming.map((e) => e.slug)));
	return {
		series: series.map((s) => ({
			id: s.id,
			name: s.name,
			icon: s.icon,
			href: s.href,
			image: s.image ?? null,
			total: s.editions.length,
			upcoming: s.upcoming.length,
			next: s.upcoming[0] ?? null,
			last: s.past[0] ?? null,
			subscribers: counts.get(s.id) ?? { confirmed: 0, pending: 0 },
			// la más nueva primero, como el resto de las listas del panel
			editions: [...s.editions]
				.reverse()
				.map((e) => ({ ...e, upcoming: upcomingSlugs.has(e.slug) }))
		}))
	};
}
