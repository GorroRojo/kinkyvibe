import { fail } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { rowsOf, runQueries } from '$lib/server/db/batch.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import {
	AGENDA_DAYS,
	activityItems,
	agendaItems,
	arDay,
	arDayStart,
	checkinTotalsQuery,
	claimReviewItems,
	eventSalesTrendQuery,
	expiringTransfersQuery,
	failedRemindersQuery,
	groupReviewItems,
	integrityReviewRow,
	integrityRunQuery,
	monthMoneyQuery,
	onlineMismatchCountQuery,
	onlineMismatchItem,
	pendingTransfersQuery,
	profileReviewItems,
	recentActivityRowsQuery,
	reviewItems,
	reviewOrdersQuery,
	salesFocus,
	salesFocusSlugs,
	salesSummary,
	sinceLastVisitQuery,
	streamLinkSlugsQuery,
	stuckSendsQuery,
	ticketTotalsQuery,
	transferMissingItem,
	unsentEmailsQuery,
	upcomingEvents,
	whenLabel
} from '$lib/server/admin/inicio.js';
import { markSeen, touchLastSeenQuery } from '$lib/server/admin/lastSeen.js';
import { profilesToReviewQuery } from '$lib/server/admin/cuentas.js';
import { listClaimsStatement, toAdminClaim } from '$lib/server/amigues/claims.js';
import { listEvents, usesLocalRepo } from '$lib/server/eventos/index.js';
import { contentPullItems, openContentPullStatuses } from '$lib/server/admin/contentPulls.js';
import { isTestEventSlug, listTicketedEvents } from '$lib/server/tickets/events.js';
import { resolveFondoMonth } from '$lib/server/tickets/fondoMonth.js';
import {
	sendOrderEmail,
	siteOrigin,
	transferReadyFromSettings
} from '$lib/server/tickets/index.js';
import { getOrder } from '$lib/server/tickets/orders.js';
import { parseReminders, retryFailedReminders } from '$lib/server/tickets/reminders.js';
import {
	getSalesSettings,
	readSalesSettings,
	salesSettingsStatement
} from '$lib/server/tickets/settings.js';
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

	const agendaUntil = arDayStart(now) + AGENDA_DAYS * 24 * 60 * 60 * 1000;
	// Dos idas a la base (dos tandas, ver $lib/server/db/batch.js) en vez de una por consulta.
	// Primera: todo lo que no depende de la lista de eventos, a la par de leerla.
	const first = runQueries(db, {
		transfers: pendingTransfersQuery(now),
		review: reviewOrdersQuery(),
		unsent: unsentEmailsQuery(now),
		money: monthMoneyQuery(now),
		seen: touchLastSeenQuery(user.id, now),
		settings: salesSettingsQuery(),
		expiring: expiringTransfersQuery(now, agendaUntil),
		// Lo que encontró el chequeo nocturno de integridad de los objetos (null si nada).
		integrity: integrityRunQuery(),
		// Perfiles creados por cuentas que ninguna admin revisó todavía (Perfiles).
		newProfiles: profilesToReviewQuery(),
		// Pedidos "Es mi perfil" pendientes (docs/amigues.md). [] sin la migración 0017.
		claims: claimsQuery(),
		// Eventos con la etiqueta «Online» y además un lugar (los que vienen y los del último mes).
		onlineMismatch: onlineMismatchCountQuery(now),
		// Las filas: los títulos de los eventos se ponen después, con la lista de eventos.
		activity: recentActivityRowsQuery({ limit: 10 })
	});
	const others = Promise.all([
		resolveFondoMonth({ db, fetch, now }),
		// Cambios del panel que esperan las pruebas para publicarse, o que fallaron.
		usesLocalRepo() || !locals.user_token
			? Promise.resolve([])
			: openContentPullStatuses(locals.user_token).catch((e) => {
					console.log('Inicio: no se pudieron leer los PRs de contenido', e);
					return [];
				})
	]);
	// Sin que quede un rechazo sin atender si la lista de eventos falla antes de esperarlos.
	first.catch(() => {});
	others.catch(() => {});

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
	// El bloque de ventas elige su evento con los totales, pero los que puede elegir se saben ya:
	// su tendencia va en la segunda tanda, con los totales.
	const focusSlugs = salesFocusSlugs(upcomingEvents({ events, ticketed, now, skip }));

	// fondo.kinkyvibe.ar y los PRs de GitHub no frenan la segunda tanda: se esperan al final.
	const s1 = await first;
	const reminderList = s1.settings ? parseReminders(s1.settings.reminders) : [];
	// Segunda: lo que depende de la lista de eventos o de la primera tanda (la última visita, los
	// ajustes de los recordatorios).
	const s2 = await runQueries(db, {
		totals: ticketTotalsQuery(soonTicketed, now),
		checkins: checkinTotalsQuery(
			soonTicketed.filter((s) => arDay(ticketed.get(s)?.start ?? '') === today)
		),
		streamLinks: streamLinkSlugsQuery(soonTicketed),
		stuck: stuckSendsQuery(soonTicketed),
		reminders: s1.settings
			? failedRemindersQuery({ events: reminderEvents, reminders: reminderList, now })
			: noQuery(new Map()),
		since: s1.seen
			? sinceLastVisitQuery({ since: s1.seen.since, login: user.login, titles })
			: noQuery(null),
		...Object.fromEntries(
			focusSlugs.map((slug) => [`trend:${slug}`, eventSalesTrendQuery(slug, now)])
		)
	});
	const { totals, checkins, streamLinks, stuck, reminders, since } = s2;
	const {
		transfers,
		review,
		unsent,
		money,
		seen,
		expiring,
		integrity,
		newProfiles,
		claims,
		onlineMismatch
	} = s1;
	const [fondo, contentPulls] = await others;

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
	const pullItems = contentPullItems(contentPulls);
	const todoItems = reviewItems({
		upcoming,
		transfers,
		unsent,
		review,
		titles,
		links: { transfers: transfersHref, order: orderHref, stream: streamHref, edit: editEventHref },
		formatWhen: (ms) => whenLabel(ms, now)
	});
	// Los PRs de contenido que no se publicaron van primero; los que se están publicando, al final.
	// Lo repetitivo (sin imagen, borradores, perfiles nuevos) va en una fila por tipo con la cuenta.
	// Un evento ofrece transferencia y no hay datos para transferir: la compra no la muestra.
	const transferMissing = transferMissingItem({
		upcoming,
		ticketed,
		transferReady: transferReadyFromSettings(s1.settings)
	});
	// Eventos con lugar y etiqueta «Online»: una fila que lleva a esa lista de Eventos.
	const onlineItem = onlineMismatchItem(onlineMismatch);
	const todo = groupReviewItems(
		[
			...pullItems.filter((i) => i.tone !== 'info'),
			...(transferMissing ? [transferMissing] : []),
			...todoItems,
			...(onlineItem ? [onlineItem] : []),
			...profileReviewItems(newProfiles, { formatWhen: (ms) => whenLabel(ms, now) }),
			...claimReviewItems(claims, { formatWhen: (ms) => whenLabel(ms, now) }),
			...pullItems.filter((i) => i.tone === 'info')
		],
		{ links: { noImage: '/admin/eventos?filtro=sin-imagen' } }
	);
	// El chequeo nocturno de los datos, en una sola fila que se despliega (solo si encontró algo).
	const integrityRow = integrityReviewRow(integrity, { formatWhen: (ms) => whenLabel(ms, now) });
	if (integrityRow) todo.push(integrityRow);

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

/**
 * Lugar vacío en una tanda: no va a la base y da `value`.
 * @template T
 * @param {T} value
 * @returns {import('$lib/server/db/batch.js').BatchQuery<T>}
 */
function noQuery(value) {
	return { what: '', fallback: value, statements: () => [], read: () => value };
}

/**
 * Los ajustes de la venta (para los recordatorios y para saber si hay datos para transferir). `null` si fallan; sin la tabla, los de las
 * variables de entorno (como `getSalesSettings`).
 * @returns {import('$lib/server/db/batch.js').BatchQuery<Awaited<ReturnType<typeof getSalesSettings>> | null>}
 */
function salesSettingsQuery() {
	return {
		what: 'inicio: ajustes de la venta',
		fallback: null,
		statements: (db) => [salesSettingsStatement(db)],
		read: (results) => readSalesSettings(rowsOf(results)),
		alone: getSalesSettings
	};
}

/**
 * Los pedidos "Es mi perfil" pendientes; `[]` si falla (sin la migración 0017).
 * @returns {import('$lib/server/db/batch.js').BatchQuery<import('$lib/server/amigues/claims.js').AdminClaim[]>}
 */
function claimsQuery() {
	return {
		what: 'inicio: pedidos "Es mi perfil"',
		fallback: [],
		statements: (db) => [listClaimsStatement(db)],
		read: (results) => rowsOf(results).map(toAdminClaim)
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
