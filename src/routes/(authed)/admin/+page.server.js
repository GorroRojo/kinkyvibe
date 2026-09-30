import { fail } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import {
	arDay,
	checkinTotals,
	failedReminders,
	monthMoney,
	pendingTransfers,
	recentActivity,
	reviewItems,
	reviewOrders,
	sinceLastVisit,
	streamLinkSlugs,
	ticketTotals,
	unsentEmails,
	upcomingEvents,
	whenLabel
} from '$lib/server/admin/inicio.js';
import { markSeen, touchLastSeen } from '$lib/server/admin/lastSeen.js';
import { listEvents } from '$lib/server/eventos/index.js';
import { isTestEventSlug, listTicketedEvents } from '$lib/server/tickets/events.js';
import { resolveFondoMonth } from '$lib/server/tickets/fondoMonth.js';
import { sendOrderEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { getOrder } from '$lib/server/tickets/orders.js';
import { parseReminders } from '$lib/server/tickets/reminders.js';
import { getSalesSettings } from '$lib/server/tickets/settings.js';
import { orderReference } from '$lib/utils/tickets.js';
import { editEventHref, orderHref, streamHref, transfersHref } from '$lib/admin/links.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, fetch, setHeaders }) {
	// Los loads corren en paralelo con el del layout: se controla acá también.
	const user = requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const now = Date.now();

	const [events, ticketedList] = await Promise.all([listEvents(), listTicketedEvents()]);
	const ticketed = new Map(ticketedList.map((t) => [t.slug, t.config]));
	const titles = new Map(events.map((e) => [e.slug, e.title]));
	// Los eventos de prueba del repo solo existen en `vite dev`.
	/** @param {string} slug */
	const skip = (slug) => !dev && isTestEventSlug(slug);
	const today = arDay(now);
	const soonSlugs = events
		.filter((e) => !e.unpublished && e.start && arDay(e.start) >= today && !skip(e.slug))
		.map((e) => e.slug);
	const soonTicketed = soonSlugs.filter((s) => ticketed.has(s));

	const reminderEvents = soonTicketed.flatMap((slug) => {
		const c = ticketed.get(slug);
		const start = c?.start ? Date.parse(c.start) : NaN;
		return c && Number.isFinite(start)
			? [{ slug, start, reminders: c.reminders, cancelled: c.status === 'cancelado' }]
			: [];
	});

	const [totals, checkins, transfers, review, unsent, streamLinks, money, fondo, seen, settings] =
		await Promise.all([
			ticketTotals(db, soonTicketed, now),
			checkinTotals(
				db,
				soonTicketed.filter((s) => arDay(ticketed.get(s)?.start ?? '') === today)
			),
			pendingTransfers(db, now),
			reviewOrders(db),
			unsentEmails(db, now),
			streamLinkSlugs(db, soonTicketed),
			monthMoney(db, now),
			resolveFondoMonth({ db, fetch, now }),
			touchLastSeen(db, user.id, now),
			db ? getSalesSettings(db).catch(() => null) : Promise.resolve(null)
		]);
	const reminders = settings
		? await failedReminders(db, {
				events: reminderEvents,
				reminders: parseReminders(settings.reminders),
				now
			})
		: new Map();

	const upcoming = upcomingEvents({
		events,
		ticketed,
		totals,
		checkins,
		transfers,
		review,
		streamLinks,
		reminders,
		now,
		skip
	});
	const todo = reviewItems({
		upcoming,
		transfers,
		unsent,
		review,
		titles,
		links: { transfers: transfersHref, order: orderHref, stream: streamHref, edit: editEventHref },
		formatWhen: (ms) => whenLabel(ms, now)
	});

	const [activity, since] = await Promise.all([
		recentActivity(db, { limit: 12, titles }),
		seen ? sinceLastVisit(db, { since: seen.since, login: user.login, titles }) : null
	]);

	return {
		now,
		dbAvailable: Boolean(db),
		upcoming,
		todayEvents: upcoming.filter((e) => e.today),
		todo,
		money,
		fondo,
		activity,
		since: since ? { ...since, first: seen?.first ?? false } : null
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	// "Reenviar" desde "Para revisar": el mail de las entradas de una orden aprobada que no salió.
	resend: async ({ locals, url, platform, request, fetch }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { resend: { ok: false, message: 'Sin base de datos.' } });
		const orderId = String((await request.formData()).get('order') ?? '');
		const order = await getOrder(db, orderId);
		if (!order || order.status !== 'approved') {
			return fail(400, { resend: { ok: false, message: 'Esa orden no está aprobada.' } });
		}
		const sent = await sendOrderEmail({
			db,
			order,
			origin: siteOrigin(url),
			fetch,
			idempotent: false
		});
		await logAdminAction(db, locals, {
			action: 'order.resend',
			targetType: 'order',
			targetId: order.id,
			summary: sent
				? `Reenvió las entradas de ${orderReference(order.id)}`
				: `Intentó reenviar las entradas de ${orderReference(order.id)} (el mail falló)`,
			detail: { event: order.event_slug, sent, from: 'inicio' }
		});
		return {
			resend: {
				ok: sent,
				message: sent
					? `Reenviamos las entradas de ${orderReference(order.id)}.`
					: 'No se pudo mandar el mail (ver logs).'
			}
		};
	},

	// "Marcar como visto" en "Desde tu última visita".
	seen: async ({ locals, url, platform }) => {
		const user = requireAdmin(locals, url);
		const ok = await markSeen(getDB(platform), user.id);
		return { seen: { ok } };
	}
};
