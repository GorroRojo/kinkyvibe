/**
 * Eventos → Lugares (mapa del panel): los perfiles de tipo lugar y en qué lugar sucede cada
 * evento ("sucede en", con la privacidad de la dirección de ese evento). Son los mismos perfiles
 * de Perfiles (filtro «Lugares»); se editan con el mismo editor.
 *
 * El vínculo evento → lugar es provisorio (tabla `event_venues`, por dirección del evento)
 * mientras los eventos sigan siendo .md: ver docs/amigues.md. Funciona con el interruptor
 * `perfiles_publicos` apagado (para dejar todo listo); el sitio lo usa recién al prenderlo.
 * Solo admins; queda en el registro.
 *
 * "Para aprobar": los lugares que cargó una cuenta (decisión de gorrite, docs/decisiones/
 * 0022-lugares-desde-cuentas.md) no aparecen en el sitio hasta que une admin los aprueba acá.
 * Rechazar no los borra (decisión de gorrite): quedan sin aparecer en el sitio y quien los cargó
 * los ve como «Rechazado» en Mi rincón, con el motivo opcional que se escribe acá. Ver
 * src/lib/server/amigues/pendingVenues.js.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { perfilesPublicosEnabled } from '$lib/server/flags.js';
import {
	listEventVenues,
	listVenues,
	removeEventVenue,
	setEventVenue
} from '$lib/server/amigues/venues.js';
import { createProfileAction } from '$lib/server/admin/amiguesRoutes.js';
import { approveProfile } from '$lib/server/amigues/approvals.js';
import {
	listPendingVenues,
	listRejectedVenues,
	rejectPendingVenue
} from '$lib/server/amigues/pendingVenues.js';
import { isVenuePrivacy, VENUE_PRIVACY_LABELS } from '$lib/utils/venues.js';

/** Los eventos (.md) para elegir, del más nuevo al más viejo, con si su archivo tiene dirección. */
/** @param {App.Platform | undefined} platform */
async function eventChoices(platform) {
	// Con `contenido_db` prendido, también los eventos de la base.
	const [listed, unlisted] = await Promise.all([
		sitePosts(platform, false, false),
		sitePosts(platform, false, true)
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
	const [venues, links, events, flagOn, pending, rejected] = await Promise.all([
		listVenues(db),
		listEventVenues(db),
		eventChoices(platform),
		perfilesPublicosEnabled(platform),
		listPendingVenues(db),
		// "Rechazados" (decisión de gorrite): quién lo rechazó y el motivo; se pueden aprobar.
		listRejectedVenues(db)
	]);
	return {
		flagOn,
		pending,
		rejected,
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
		events
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	crearPerfil: createProfileAction,

	aprobarLugar: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { pending: { ok: false, message: 'Sin base de datos.' } });
		const id = Number((await request.formData()).get('lugar'));
		// Desde "Para aprobar" o desde "Rechazados" (aprobar borra el rechazo, ver approvals.js).
		const [pending, rejected] = await Promise.all([listPendingVenues(db), listRejectedVenues(db)]);
		const venue = [...pending, ...rejected].find((v) => v.id === id);
		if (!venue) {
			return fail(404, { pending: { ok: false, message: 'Ese lugar ya no está para aprobar.' } });
		}
		await approveProfile(db, id, admin.login);
		await logAdminAction(db, locals, {
			action: 'profile.approve',
			targetType: 'profile',
			targetId: id,
			summary: `Aprobó el lugar «${venue.title}»`
		});
		return { pending: { ok: true, message: `Listo: «${venue.title}» ya aparece en el sitio.` } };
	},

	rechazarLugar: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { pending: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const id = Number(form.get('lugar'));
		const r = await rejectPendingVenue(db, id, { by: admin.login, reason: form.get('motivo') });
		if (!r.ok) return fail(r.status, { pending: { ok: false, message: r.message } });
		// El motivo va al detalle (lo ven solo admins en Actividad), no al resumen.
		await logAdminAction(db, locals, {
			action: 'profile.reject',
			targetType: 'profile',
			targetId: id,
			summary: `Rechazó el lugar «${r.title}»`,
			...(r.reason ? { detail: { reason: r.reason } } : {})
		});
		return {
			pending: {
				ok: true,
				message: `Listo: rechazaste «${r.title}». Quien lo cargó lo ve como rechazado en su Mi rincón.`
			}
		};
	},

	vincular: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { link: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const eventSlug = String(form.get('evento') ?? '');
		const venueId = Number(form.get('lugar'));
		const rawPrivacy = String(form.get('privacidad') ?? '');
		const privacy = isVenuePrivacy(rawPrivacy) ? rawPrivacy : null;
		const events = await eventChoices(platform);
		if (!events.some((e) => e.slug === eventSlug)) {
			return fail(400, { link: { ok: false, message: 'Elegí un evento.' } });
		}
		const r = await setEventVenue(db, { eventSlug, venueId, privacy, by: admin.login });
		if (!r.ok) return fail(400, { link: r });
		await logAdminAction(db, locals, {
			action: 'event.venue_set',
			targetType: 'event',
			targetId: eventSlug,
			summary: `Puso el lugar del evento ${eventSlug}${privacy ? ` (se muestra: ${VENUE_PRIVACY_LABELS[privacy]})` : ''}`,
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
