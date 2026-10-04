/**
 * Eventos → Lugares → «Importar de eventos»: arma lugares con el «Dónde» que ya tienen los eventos
 * (decisión de gorrite). La página muestra los candidatos (vista previa, con CSV) y no escribe
 * nada hasta «Crear lugares». Solo admins (las acciones de formulario de SvelteKit ya revisan el
 * origen del pedido: CSRF); cada lugar creado o vínculo queda en el registro. Va de a tandas: la
 * página repite el pedido hasta que no queda nada. Ver src/lib/server/amigues/venueImport.js.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { perfilesPublicosEnabled } from '$lib/server/flags.js';
import {
	importableEvents,
	loadVenueImportPlan,
	readVenueChoices,
	runVenueImport
} from '$lib/server/amigues/venueImport.js';
import { VENUE_PRIVACY_LABELS } from '$lib/utils/venues.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const events = await importableEvents(platform);
	const [{ candidates, skipped }, flagOn] = await Promise.all([
		loadVenueImportPlan(db, events),
		perfilesPublicosEnabled(platform)
	]);
	return { candidates, skipped, total: events.length, flagOn };
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Una tanda. La página la repite mientras quede algo.
	crear: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { importResult: null, error: 'Sin base de datos.' });
		const choices = readVenueChoices(await request.formData());
		if (!choices.length) {
			return fail(400, { importResult: null, error: 'Elegí al menos un lugar.' });
		}
		const plan = await loadVenueImportPlan(db, await importableEvents(platform));
		const { results, remaining } = await runVenueImport(db, plan, choices, { actor: admin.login });
		for (const r of results) {
			if (r.action === 'error') continue;
			const events = r.links.map((l) => l.slug);
			await logAdminAction(db, locals, {
				action: r.action === 'created' ? 'venue.import_create' : 'venue.import_link',
				targetType: 'profile',
				targetId: r.venueId ?? null,
				summary:
					r.action === 'created'
						? `Creó el lugar «${r.title}» desde los eventos (${events.length} ${events.length === 1 ? 'evento' : 'eventos'}; se muestra: ${VENUE_PRIVACY_LABELS[r.venuePrivacy ?? 'public']}; ${r.listing === 'listed' ? 'listado en Amigues' : 'no listado en Amigues'})`
						: `Vinculó ${events.length} ${events.length === 1 ? 'evento' : 'eventos'} al lugar «${r.title}» desde los eventos`,
				detail: {
					events,
					privacy: r.links.map((l) => l.privacy ?? 'lugar'),
					...(r.action === 'created' ? { listing: r.listing ?? 'unlisted' } : {})
				}
			});
		}
		return {
			importResult: {
				created: results.filter((r) => r.action === 'created').length,
				linked: results.reduce((n, r) => n + r.links.length, 0),
				remaining,
				problems: results
					.filter((r) => r.action === 'error')
					.map((r) => ({ key: r.key, title: r.title, message: r.message ?? '' }))
			}
		};
	}
};
