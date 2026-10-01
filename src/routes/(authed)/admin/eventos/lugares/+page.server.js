/**
 * Eventos → Lugares (mapa del panel): los perfiles de tipo lugar y en qué lugar sucede cada
 * evento ("sucede en", con la privacidad de la dirección de ese evento). Son los mismos perfiles
 * de Contenido → Amigues (filtro «Lugares»); se editan con el mismo editor.
 *
 * El vínculo evento → lugar es provisorio (tabla `event_venues`, por dirección del evento)
 * mientras los eventos sigan siendo .md: ver docs/amigues.md. Funciona con el interruptor
 * `perfiles_publicos` apagado (para dejar todo listo); el sitio lo usa recién al prenderlo.
 * Solo admins; queda en el registro.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { fetchMarkdownPosts } from '$lib/utils';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { perfilesPublicosEnabled } from '$lib/server/flags.js';
import {
	listEventVenues,
	listVenues,
	removeEventVenue,
	setEventVenue
} from '$lib/server/amigues/venues.js';
import { createProfileAction } from '$lib/server/admin/amiguesRoutes.js';
import { isVenuePrivacy, VENUE_PRIVACY_LABELS } from '$lib/utils/venues.js';

/** Los eventos (.md) para elegir, del más nuevo al más viejo, con si su archivo tiene dirección. */
async function eventChoices() {
	const [listed, unlisted] = await Promise.all([
		fetchMarkdownPosts(false, false),
		fetchMarkdownPosts(false, true)
	]);
	return [...listed, ...unlisted]
		.filter((p) => p.meta.category === 'calendario')
		.map((p) => ({
			slug: String(p.meta.postID),
			title: String(p.meta.title ?? p.meta.postID),
			start: p.meta.start ? String(p.meta.start) : '',
			// La dirección escrita en el .md es pública (el repo es público): conviene sacarla si el
			// lugar no la quiere mostrar.
			mdAddress: Boolean(p.meta.location)
		}))
		.sort((a, b) => b.start.localeCompare(a.start));
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const [venues, links, events, flagOn] = await Promise.all([
		listVenues(db),
		listEventVenues(db),
		eventChoices(),
		perfilesPublicosEnabled(platform)
	]);
	return {
		flagOn,
		venues: venues.map((v) => ({
			id: v.id,
			slug: v.slug,
			title: v.title,
			visibility: v.visibility,
			privacy: isVenuePrivacy(v.data.venue_privacy) ? v.data.venue_privacy : null,
			area: typeof v.data.area === 'string' ? v.data.area : '',
			city: typeof v.data.city === 'string' ? v.data.city : '',
			hasMap: typeof v.data.lat === 'number',
			events: links.filter((l) => l.venueId === v.id).length
		})),
		links,
		events,
		privacyLabels: VENUE_PRIVACY_LABELS
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	crearPerfil: createProfileAction,

	vincular: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { link: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const eventSlug = String(form.get('evento') ?? '');
		const venueId = Number(form.get('lugar'));
		const rawPrivacy = String(form.get('privacidad') ?? '');
		const privacy = isVenuePrivacy(rawPrivacy) ? rawPrivacy : null;
		const events = await eventChoices();
		if (!events.some((e) => e.slug === eventSlug)) {
			return fail(400, { link: { ok: false, message: 'Elegí un evento.' } });
		}
		const r = await setEventVenue(db, { eventSlug, venueId, privacy, by: admin.login });
		if (!r.ok) return fail(400, { link: r });
		await logAdminAction(db, locals, {
			action: 'event.venue_set',
			targetType: 'event',
			targetId: eventSlug,
			summary: `Puso el lugar del evento ${eventSlug}${privacy ? ` (dirección: ${VENUE_PRIVACY_LABELS[privacy].toLowerCase()})` : ''}`,
			detail: { venueId, privacy }
		});
		return { link: { ok: true, message: 'Listo: el evento tiene lugar.' } };
	},

	desvincular: async ({ locals, url, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { link: { ok: false, message: 'Sin base de datos.' } });
		const eventSlug = String((await request.formData()).get('evento') ?? '');
		if (!(await removeEventVenue(db, eventSlug))) {
			return fail(404, { link: { ok: false, message: 'Ese evento no tenía lugar.' } });
		}
		await logAdminAction(db, locals, {
			action: 'event.venue_remove',
			targetType: 'event',
			targetId: eventSlug,
			summary: `Sacó el lugar del evento ${eventSlug}`
		});
		return { link: { ok: true, message: 'Listo: el evento ya no tiene lugar.' } };
	}
};
