import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { runQueries } from '$lib/server/db/batch.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import {
	AGENDA_DAYS,
	activityItems,
	agendaItems,
	arDay,
	arDayStart,
	checkinTotalsQuery,
	eventSalesTrendQuery,
	expiringTransfersQuery,
	monthMoneyQuery,
	recentActivityRowsQuery,
	salesFocus,
	salesFocusSlugs,
	salesSummary,
	sinceLastVisitQuery,
	upcomingEvents
} from '$lib/server/admin/inicio.js';
import {
	noQuery,
	reviewEventContext,
	reviewEventQueries,
	reviewTagUsage,
	reviewQueries,
	reviewRows,
	skipReviewEvent
} from '$lib/server/admin/review.js';
import { markSeen, touchLastSeenQuery } from '$lib/server/admin/lastSeen.js';
import { listEvents } from '$lib/server/eventos/index.js';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { resolveFondoMonth } from '$lib/server/tickets/fondoMonth.js';
import { sendOrderEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { getOrder } from '$lib/server/tickets/orders.js';
import { parseReminders, retryFailedReminders } from '$lib/server/tickets/reminders.js';
import { orderReference } from '$lib/utils/tickets.js';
import { eventLink, orderHref, transfersHref } from '$lib/admin/links.js';
import { navItem, navLink } from '$lib/admin/nav.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, fetch, setHeaders }) {
	// Los loads corren en paralelo con el del layout: se controla acá también.
	const user = requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const now = Date.now();

	const agendaUntil = arDayStart(now) + AGENDA_DAYS * 24 * 60 * 60 * 1000;
	// Dos idas a la base (dos tandas, ver $lib/server/db/batch.js) en vez de una por consulta.
	// Primera: todo lo que no depende de la lista de eventos, a la par de leerla. Lo de «Para
	// revisar» sale de review.js: las mismas consultas que cuenta el botón del menú.
	const first = runQueries(db, {
		...reviewQueries(now, { login: user.login }),
		money: monthMoneyQuery(now),
		seen: touchLastSeenQuery(user.id, now),
		expiring: expiringTransfersQuery(now, agendaUntil),
		// Las filas: los títulos de los eventos se ponen después, con la lista de eventos.
		activity: recentActivityRowsQuery({ limit: 10 })
	});
	const others = Promise.all([
		resolveFondoMonth({ db, fetch, now }),
		// El uso de las etiquetas (para lo que Etiquetas tiene para revisar).
		reviewTagUsage()
	]);
	// Sin que quede un rechazo sin atender si la lista de eventos falla antes de esperarlos.
	first.catch(() => {});
	others.catch(() => {});

	const [events, ticketedList] = await Promise.all([listEvents(), listTicketedEvents()]);
	// Los eventos de prueba del repo solo existen en `vite dev`.
	const skip = skipReviewEvent;
	const { ticketed, titles, today, soonTicketed, reminderEvents } = reviewEventContext({
		events,
		ticketedList,
		now,
		skip
	});
	// El bloque de ventas elige su evento con los totales, pero los que puede elegir se saben ya:
	// su tendencia va en la segunda tanda, con los totales.
	const focusSlugs = salesFocusSlugs(upcomingEvents({ events, ticketed, now, skip }));

	// fondo.kinkyvibe.ar y el uso de las etiquetas no frenan la segunda tanda: se esperan al final.
	const s1 = await first;
	const reminderList = s1.settings ? parseReminders(s1.settings.reminders) : [];
	// Segunda: lo que depende de la lista de eventos o de la primera tanda (la última visita, los
	// ajustes de los recordatorios).
	const s2 = await runQueries(db, {
		...reviewEventQueries({ soonTicketed, reminderEvents, settings: s1.settings, now }),
		checkins: checkinTotalsQuery(
			soonTicketed.filter((s) => arDay(ticketed.get(s)?.start ?? '') === today)
		),
		since: s1.seen
			? sinceLastVisitQuery({ since: s1.seen.since, login: user.login, titles })
			: noQuery(null),
		...Object.fromEntries(
			focusSlugs.map((slug) => [`trend:${slug}`, eventSalesTrendQuery(slug, now)])
		)
	});
	const { totals, checkins, streamLinks, stuck, reminders, since } = s2;
	const { transfers, review, money, seen, expiring } = s1;
	const [fondo, outside] = await others;

	const upcoming = upcomingEvents({
		events,
		ticketed,
		totals,
		checkins,
		transfers,
		review,
		streamLinks,
		reminders,
		stuck,
		now,
		skip
	});
	// «Para revisar»: las mismas filas que cuenta el botón del menú (panelCounts.js).
	const todo = reviewRows({ ...s1, ...outside, upcoming, ticketed, titles, now });

	// Los recordatorios se configuran en Ajustes → Mails y plantillas.
	const remindersItem = navItem('ajustes-mails');
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
			reminders: (remindersItem && navLink(remindersItem)) || '/admin/ajustes/mails'
		}
	});
	const focus = salesFocus(upcoming);
	const trends =
		/** @type {Record<string, import('$lib/server/admin/inicio.js').SalesTrend | null>} */ (
			/** @type {unknown} */ (s2)
		);
	const trend = focus ? (trends[`trend:${focus.event.slug}`] ?? null) : null;
	const sales = focus
		? salesSummary({ focus, config: ticketed.get(focus.event.slug), totals, trend, now })
		: null;

	return {
		agenda,
		sales,
		now,
		dbAvailable: Boolean(db),
		upcoming,
		// Lo de hoy que se destaca arriba: nunca un borrador (todavía no está confirmado).
		todayEvents: upcoming.filter((e) => e.today && !e.draft),
		todo,
		money,
		fondo,
		activity: activityItems(s1.activity, { limit: 10, titles }),
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

	// "Reintentar" desde "Para revisar": los recordatorios de un evento que fallaron todos sus
	// intentos vuelven a la cola; los manda el próximo cron.
	retryReminders: async ({ locals, url, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { resend: { ok: false, message: 'Sin base de datos.' } });
		const slug = String((await request.formData()).get('slug') ?? '');
		if (!/^[a-z0-9][a-z0-9_-]{0,199}$/i.test(slug)) {
			return fail(400, { resend: { ok: false, message: 'Evento inválido.' } });
		}
		const n = await retryFailedReminders(db, slug);
		if (n) {
			await logAdminAction(db, locals, {
				action: 'reminders.retry',
				targetType: 'event',
				targetId: slug,
				summary: `Volvió a poner en la cola ${n === 1 ? '1 recordatorio' : `${n} recordatorios`}`,
				detail: { count: n }
			});
		}
		return {
			resend: {
				ok: true,
				message: n
					? `Listo: ${n === 1 ? 'el recordatorio sale' : `los ${n} recordatorios salen`} en la próxima vuelta del cron (cada 15 minutos).`
					: 'No había recordatorios fallidos para reintentar.'
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
