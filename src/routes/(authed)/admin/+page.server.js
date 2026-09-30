import { fail } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import {
	AGENDA_DAYS,
	agendaItems,
	arDay,
	arDayStart,
	checkinTotals,
	eventSalesTrend,
	expiringTransfers,
	failedReminders,
	monthMoney,
	pendingTransfers,
	recentActivity,
	reviewItems,
	reviewOrders,
	salesFocus,
	salesSummary,
	sinceLastVisit,
	streamLinkSlugs,
	ticketTotals,
	unsentEmails,
	upcomingEvents,
	whenLabel
} from '$lib/server/admin/inicio.js';
import { markSeen, touchLastSeen } from '$lib/server/admin/lastSeen.js';
import { listEvents, usesLocalRepo } from '$lib/server/eventos/index.js';
import { contentPullItems, openContentPullStatuses } from '$lib/server/admin/contentPulls.js';
import { isTestEventSlug, listTicketedEvents } from '$lib/server/tickets/events.js';
import { resolveFondoMonth } from '$lib/server/tickets/fondoMonth.js';
import { sendOrderEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { getOrder } from '$lib/server/tickets/orders.js';
import { parseReminders } from '$lib/server/tickets/reminders.js';
import { getSalesSettings } from '$lib/server/tickets/settings.js';
import { orderReference } from '$lib/utils/tickets.js';
import {
	editEventHref,
	eventLink,
	orderHref,
	streamHref,
	transfersHref
} from '$lib/admin/links.js';
import { navItem, navLink } from '$lib/admin/nav.js';

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

	const agendaUntil = arDayStart(now) + AGENDA_DAYS * 24 * 60 * 60 * 1000;
	const [
		totals,
		checkins,
		transfers,
		review,
		unsent,
		streamLinks,
		money,
		fondo,
		seen,
		settings,
		expiring,
		contentPulls
	] = await Promise.all([
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
		db ? getSalesSettings(db).catch(() => null) : Promise.resolve(null),
		expiringTransfers(db, now, agendaUntil),
		// Cambios del panel que esperan las pruebas para publicarse, o que fallaron.
		usesLocalRepo() || !locals.user_token
			? Promise.resolve([])
			: openContentPullStatuses(locals.user_token).catch((e) => {
					console.log('Inicio: no se pudieron leer los PRs de contenido', e);
					return [];
				})
	]);
	const reminderList = settings ? parseReminders(settings.reminders) : [];
	const reminders = settings
		? await failedReminders(db, { events: reminderEvents, reminders: reminderList, now })
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
	const pullItems = contentPullItems(contentPulls);
	const reviewList = reviewItems({
		upcoming,
		transfers,
		unsent,
		review,
		titles,
		links: { transfers: transfersHref, order: orderHref, stream: streamHref, edit: editEventHref },
		formatWhen: (ms) => whenLabel(ms, now)
	});
	// Los que no se publicaron van primero; los que se están publicando, al final.
	const todo = [
		...pullItems.filter((i) => i.tone !== 'info'),
		...reviewList,
		...pullItems.filter((i) => i.tone === 'info')
	];

	const settingsItem = navItem('ajustes-cobros');
	const agenda = agendaItems({
		events,
		ticketed,
		transfers: expiring,
		reminders: reminderList,
		now,
		skip,
		links: {
			event: eventLink,
			orders: (slug) => orderHref(slug),
			transfers: transfersHref,
			reminders: (settingsItem && navLink(settingsItem)) || '/admin/entradas/ajustes'
		}
	});
	const focus = salesFocus(upcoming);

	const [activity, since, trend] = await Promise.all([
		recentActivity(db, { limit: 10, titles }),
		seen ? sinceLastVisit(db, { since: seen.since, login: user.login, titles }) : null,
		focus ? eventSalesTrend(db, focus.event.slug, now) : null
	]);
	const sales = focus
		? salesSummary({ focus, config: ticketed.get(focus.event.slug), totals, trend, now })
		: null;

	return {
		agenda,
		sales,
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
