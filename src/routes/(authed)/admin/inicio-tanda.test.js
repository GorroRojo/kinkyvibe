/**
 * Panel → Inicio (/admin) en tanda: el load de la página y los contadores del menú (layout) dan
 * EXACTAMENTE lo mismo que antes, ahora con dos idas a la base en la página y una en el layout (eran
 * 33 consultas sueltas por visita). Para comparar, abajo está el load de antes, tal cual (con las
 * funciones de inicio.js de siempre, que siguen existiendo y tienen sus propios tests).
 * D1 de miniflare, datos inventados (example.com); los eventos, de mentira.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { getDB, logDBError } from '$lib/server/db';
import { ADMINS, requireAdmin } from '$lib/server/auth';
import { insertOrder, insertTicket } from '$lib/server/admin/testRows.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { logAccountCreated } from '$lib/server/admin/accountEvents.js';
import { createProfile } from '$lib/server/cuentas/perfiles.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { recordIntegrityRun } from '$lib/server/objects/integrity.js';
import { applyTipPayment, createTip, tipReference } from '$lib/server/propinas/index.js';
import { streamLinkHash } from '$lib/server/tickets/stream.js';
import { panelCounts } from '$lib/server/admin/panelCounts.js';
import {
	AGENDA_DAYS,
	agendaItems,
	arDay,
	arDayStart,
	checkinTotals,
	eventSalesTrend,
	expiringTransfers,
	failedReminders,
	groupReviewItems,
	integrityReviewRow,
	integrityRun,
	monthMoney,
	pendingTransfers,
	profileReviewItems,
	claimReviewItems,
	recentActivity,
	reviewItems,
	reviewOrders,
	salesFocus,
	salesSummary,
	sinceLastVisit,
	streamLinkSlugs,
	stuckSends,
	ticketTotals,
	unsentEmails,
	upcomingEvents,
	whenLabel
} from '$lib/server/admin/inicio.js';
import { touchLastSeen } from '$lib/server/admin/lastSeen.js';
import { countProfilesToReview, profilesToReview } from '$lib/server/admin/cuentas.js';
import { countPendingClaims, listClaims } from '$lib/server/amigues/claims.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { listEvents, usesLocalRepo } from '$lib/server/eventos/index.js';
import { contentPullItems, openContentPullStatuses } from '$lib/server/admin/contentPulls.js';
import { isTestEventSlug, listTicketedEvents } from '$lib/server/tickets/events.js';
import { resolveFondoMonth } from '$lib/server/tickets/fondoMonth.js';
import { parseReminders } from '$lib/server/tickets/reminders.js';
import { getSalesSettings } from '$lib/server/tickets/settings.js';
import {
	editEventHref,
	eventLink,
	orderHref,
	streamHref,
	transfersHref
} from '$lib/admin/links.js';
import { navItem, navLink } from '$lib/admin/nav.js';
import { load } from './+page.server.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const fake = vi.hoisted(() => ({
	/** @type {any[]} */ events: [],
	/** @type {{ slug: string, config: any }[]} */ ticketed: [],
	/** Los .md no listados (el contador «No listadas»). @type {any[]} */ unlisted: []
}));
vi.mock('$env/dynamic/private', () => ({ env: { CONTENIDO_DB_ENABLED: '1' } }));
vi.mock('$lib/server/eventos/index.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	listEvents: async () => structuredClone(fake.events),
	usesLocalRepo: () => true
}));
vi.mock('$lib/server/tickets/events.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	listTicketedEvents: async () => structuredClone(fake.ticketed),
	isTestEventSlug: (/** @type {string} */ slug) => slug.startsWith('prueba-')
}));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki || !unlisted ? [] : structuredClone(fake.unlisted)
}));

/** @param {string} local ej. '2026-09-30T12:00' (hora de Argentina) */
const ar = (local) => new Date(`${local}:00-03:00`).getTime();
const NOW = ar('2026-09-30T12:00');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const otherAdmin = { id: ADMINS[1].id, login: ADMINS[1].login };
const STREAM_LINK = 'https://example.com/sala-inventada';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	fake.events = [];
	fake.ticketed = [];
	fake.unlisted = [];
});
afterEach(() => {
	vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// El load de antes, tal cual estaba (33 consultas sueltas), para comparar.
// ---------------------------------------------------------------------------------------------

/** @param {any} event */
async function oldLoad({ locals, url, platform, fetch, setHeaders }) {
	// Los loads corren en paralelo con el del layout: se controla acá también.
	const user = requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const now = Date.now();

	const agendaUntil = arDayStart(now) + AGENDA_DAYS * 24 * 60 * 60 * 1000;
	// Lo que no depende de la lista de eventos sale ya, a la par de leerla (una vuelta a la base
	// menos antes de poder mostrar la página).
	const independent = Promise.all([
		pendingTransfers(db, now),
		reviewOrders(db),
		unsentEmails(db, now),
		monthMoney(db, now),
		resolveFondoMonth({ db, fetch, now }),
		touchLastSeen(db, user.id, now),
		db ? getSalesSettings(db).catch(() => null) : Promise.resolve(null),
		expiringTransfers(db, now, agendaUntil),
		// Lo que encontró el chequeo nocturno de integridad de los objetos (null si nada).
		integrityRun(db),
		// Cambios del panel que esperan las pruebas para publicarse, o que fallaron.
		usesLocalRepo() || !locals.user_token
			? Promise.resolve([])
			: openContentPullStatuses(locals.user_token).catch((e) => {
					console.log('Inicio: no se pudieron leer los PRs de contenido', e);
					return [];
				}),
		// Perfiles creados por cuentas que ninguna admin revisó todavía (Perfiles).
		profilesToReview(db),
		// Pedidos "Es mi perfil" pendientes (docs/amigues.md). [] sin la migración 0017.
		db ? listClaims(db).catch(() => []) : Promise.resolve([])
	]);
	// Sin que quede un rechazo sin atender si la lista de eventos falla antes de esperarlo.
	independent.catch(() => {});

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

	const [
		[totals, checkins, streamLinks, stuck],
		[
			transfers,
			review,
			unsent,
			money,
			fondo,
			seen,
			settings,
			expiring,
			integrity,
			contentPulls,
			newProfiles,
			claims
		]
	] = await Promise.all([
		Promise.all([
			ticketTotals(db, soonTicketed, now),
			checkinTotals(
				db,
				soonTicketed.filter((s) => arDay(ticketed.get(s)?.start ?? '') === today)
			),
			streamLinkSlugs(db, soonTicketed),
			stuckSends(db, soonTicketed)
		]),
		independent
	]);
	// Solo necesitan los títulos y la última visita: a la par de los recordatorios.
	const activityP = recentActivity(db, { limit: 10, titles });
	const sinceP = seen ? sinceLastVisit(db, { since: seen.since, login: user.login, titles }) : null;
	activityP.catch(() => {});
	sinceP?.catch(() => {});
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
	const todo = groupReviewItems(
		[
			...pullItems.filter((i) => i.tone !== 'info'),
			...todoItems,
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

	const [activity, since, trend] = await Promise.all([
		activityP,
		sinceP,
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
const dev = true;

/**
 * Los contadores del menú de antes (+layout.server.js), tal cual.
 * @param {App.Platform | undefined} platform
 */
async function oldPanelCounts(platform) {
	/** @type {Record<string, number>} */
	const counts = {};
	const db = getDB(platform);
	const tasks = [
		(async () => {
			if (!db) return;
			try {
				// Transferencias esperando comprobante y todavía vigentes.
				const row = await db
					.prepare(
						"SELECT COUNT(*) AS n FROM orders WHERE status = 'awaiting_transfer' AND expires_at > ?"
					)
					.bind(Date.now())
					.first();
				counts.transfers = Number(row?.n ?? 0);
			} catch (error) {
				logDBError('contador de transferencias del panel', error);
			}
		})(),
		(async () => {
			if (!db) return;
			try {
				// Órdenes marcadas "para revisar" (pago tarde que pasó el cupo, posible cobro doble).
				const row = await db
					.prepare('SELECT COUNT(*) AS n FROM orders WHERE needs_review IS NOT NULL')
					.first();
				counts.reviewOrders = Number(row?.n ?? 0);
			} catch (error) {
				logDBError('contador de órdenes para revisar del panel', error);
			}
		})(),
		(async () => {
			const [review, claims] = await Promise.all([
				countProfilesToReview(db),
				countPendingClaims(db)
			]);
			counts.profilesToReview = review + claims;
		})(),
		(async () => {
			try {
				// Publicaciones no listadas (borradores). Cacheado por instancia fuera de dev.
				counts.unlisted = (await sitePosts(platform, false, true)).length;
			} catch (error) {
				console.error('[admin] contador de no listadas:', error);
			}
		})()
	];
	await Promise.all(tasks);
	counts.review =
		(counts.transfers ?? 0) + (counts.reviewOrders ?? 0) + (counts.profilesToReview ?? 0);
	return counts;
}

// ---------------------------------------------------------------------------------------------
// Datos inventados
// ---------------------------------------------------------------------------------------------

/**
 * @param {string} slug
 * @param {string} title
 * @param {string} start
 * @param {Record<string, any>} [o]
 */
const event = (slug, title, start, o = {}) => ({
	slug,
	title,
	start,
	end: '',
	status: 'abierto',
	location: 'Lugar Inventado',
	unlisted: false,
	unpublished: false,
	thumb: 'imagen.jpg',
	...o
});

/** @param {Record<string, any>} o */
const tickets = (o) => ({
	types: [{ id: 'general', name: 'General', capacity: 30, closesAt: null }],
	fondoEnabled: false,
	opensAt: null,
	closesAt: null,
	online: false,
	reminders: true,
	status: 'abierto',
	...o
});

/** La base con un poco de todo lo que muestra el Inicio. */
async function seed() {
	const fiestaStart = '2026-09-30T22:00-03:00';
	const tallerStart = '2026-09-30T19:00-03:00';
	const viernesStart = '2026-10-02T21:00-03:00';
	fake.events = [
		event('fiesta-hoy', 'Fiesta Inventada', fiestaStart),
		event('taller-hoy', 'Taller Inventado', tallerStart, { thumb: undefined }),
		event('viernes', 'Charla Online Inventada', viernesStart),
		event('borrador', 'Borrador Inventado', '2026-10-03T20:00-03:00', { unlisted: true }),
		event('cancelado', 'Cancelado Inventado', '2026-10-04T20:00-03:00'),
		event('sin-entradas', 'Sin Entradas', '2026-10-05T20:00-03:00', { thumb: undefined }),
		event('lejos', 'Lejos Inventado', '2026-11-20T20:00-03:00'),
		event('ayer', 'Ayer Inventado', '2026-09-29T21:00-03:00'),
		event('oculto', 'Oculto Inventado', '2026-10-01T21:00-03:00', { unpublished: true }),
		event('prueba-x', 'Prueba', '2026-10-01T21:00-03:00')
	];
	fake.ticketed = [
		{
			slug: 'fiesta-hoy',
			config: tickets({
				start: fiestaStart,
				online: true,
				types: [
					{ id: 'general', name: 'General', capacity: 3, closesAt: null },
					{ id: 'anticipada', name: 'Anticipada', capacity: null, closesAt: NOW - HOUR }
				]
			})
		},
		{ slug: 'taller-hoy', config: tickets({ start: tallerStart }) },
		{
			slug: 'viernes',
			config: tickets({
				start: viernesStart,
				online: true,
				fondoEnabled: true,
				opensAt: NOW - 3 * DAY,
				closesAt: ar('2026-10-02T18:00')
			})
		},
		{ slug: 'borrador', config: tickets({ start: '2026-10-03T20:00-03:00' }) },
		{
			slug: 'cancelado',
			config: tickets({ start: '2026-10-04T20:00-03:00', status: 'cancelado' })
		},
		{ slug: 'lejos', config: tickets({ start: '2026-11-20T20:00-03:00', opensAt: NOW + DAY }) },
		{ slug: 'ayer', config: tickets({ start: '2026-09-29T21:00-03:00' }) }
	];

	// Ventas: la fiesta de hoy se pasó del cupo y tiene ingresos en la puerta.
	const fiestaOrders = [];
	for (let i = 0; i < 4; i++) {
		fiestaOrders.push(
			await insertOrder(t.db, {
				slug: 'fiesta-hoy',
				quantity: 1,
				name: `Persona Inventada ${i}`,
				created: NOW - (5 - i) * DAY,
				updated: NOW - (5 - i) * DAY,
				contribution: i === 0 ? 1500 : 0
			})
		);
	}
	await insertOrder(t.db, {
		slug: 'fiesta-hoy',
		type: 'anticipada',
		quantity: 2,
		created: NOW - 2 * HOUR,
		emailSentAt: null
	});
	for (const [i, id] of fiestaOrders.entries()) {
		await insertTicket(t.db, {
			orderId: id,
			slug: 'fiesta-hoy',
			checkedInAt: i < 3 ? NOW - (40 - i * 15) * 60 * 1000 : null
		});
	}
	// El taller vendió menos (el bloque de ventas elige la fiesta).
	await insertOrder(t.db, { slug: 'taller-hoy', created: NOW - DAY, pronouns: 'elle' });
	// Viernes: transferencias (una por vencer hoy, otra en dos días, una vencida), una orden para
	// revisar, un mail que no salió y una reservada con Mercado Pago.
	const transfer = { slug: 'viernes', status: 'awaiting_transfer', method: 'transferencia' };
	await insertOrder(t.db, { ...transfer, created: NOW - HOUR, expires: NOW + 5 * HOUR });
	await insertOrder(t.db, { ...transfer, created: NOW - 3 * HOUR, expires: NOW + 2 * DAY });
	await insertOrder(t.db, { ...transfer, created: NOW - 3 * DAY, expires: NOW - DAY });
	await insertOrder(t.db, {
		slug: 'viernes',
		created: NOW - 4 * DAY,
		needsReview: 'late_payment'
	});
	const unsentId = await insertOrder(t.db, {
		slug: 'viernes',
		created: NOW - 6 * HOUR,
		emailSentAt: null,
		fondoAmount: 500
	});
	await insertOrder(t.db, {
		slug: 'viernes',
		status: 'pending',
		created: NOW - 60_000,
		expires: NOW + 10 * 60_000
	});
	await insertOrder(t.db, { slug: 'ayer', status: 'refunded', created: NOW - 2 * DAY });
	// Link de la transmisión del viernes: a una orden no le llegó (con el link de ahora) y a otra no
	// le llegó uno viejo (no cuenta).
	await t.db
		.prepare(
			"INSERT INTO event_ticket_settings (event_slug, stream_link, updated_by) VALUES ('viernes', ?1, 'x')"
		)
		.bind(STREAM_LINK)
		.run();
	const sends = [
		[unsentId, await streamLinkHash(STREAM_LINK)],
		[fiestaOrders[0], await streamLinkHash('https://example.com/viejo')]
	];
	for (const [orderId, hash] of sends) {
		await t.db
			.prepare(
				"INSERT INTO stream_link_sends (order_id, link_hash, sent_at, status, attempts) VALUES (?1, ?2, ?3, 'failed', 5)"
			)
			.bind(orderId, hash, NOW - HOUR)
			.run();
	}
	// Recordatorios: uno que se rindió en la fiesta; el de las 9 de hoy no salió para nadie.
	await t.db
		.prepare(
			"INSERT INTO reminder_sends (order_id, reminder_id, sent_at, status, attempts) VALUES (?1, 'h48', ?2, 'failed', 5)"
		)
		.bind(fiestaOrders[1], NOW - 2 * DAY)
		.run();
	await t.db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES ('reminders', ?1, ?2, 'x')`
		)
		.bind(
			JSON.stringify([
				{ kind: 'hours_before', hours: 48, enabled: true },
				{ kind: 'day_at', days: 0, time: '09:00', enabled: true }
			]),
			NOW - 10 * DAY
		)
		.run();
	// Actividad: acciones de otre admin y mías, una cuenta nueva, una propina al Fondo.
	await logAdminAction(
		t.db,
		{ user: otherAdmin },
		{ action: 'event.edit', targetType: 'event', targetId: 'viernes', summary: 'Editó el viernes' },
		{ now: NOW - HOUR }
	);
	await logAdminAction(
		t.db,
		{ user: admin },
		{ action: 'event.edit', targetType: 'event', targetId: 'lejos', summary: 'Editó lejos' },
		{ now: NOW - 4 * HOUR }
	);
	await logAccountCreated(t.db, '00000000-0000-4000-8000-000000000000', { now: NOW - 5 * HOUR });
	const tip = await createTip(
		t.db,
		{ amount: 3000, message: null, category: 'material', slug: 'guia', destination: 'fondo' },
		{ now: NOW - 7 * HOUR }
	);
	await applyTipPayment(
		t.db,
		{
			id: 1,
			status: 'approved',
			external_reference: tipReference(tip.id),
			transaction_amount: 3000,
			currency_id: 'ARS'
		},
		{ now: NOW - 7 * HOUR }
	);
	// Un perfil nuevo de una cuenta, y otra cuenta que lo pide como suyo.
	const owner = await upsertVerifiedAccount(t.db, 'duene-inventade@example.com');
	await t.db
		.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1')
		.bind(owner.id)
		.run();
	const created = await createProfile(t.db, owner.id, { kind: 'persona', title: 'Perfil Nuevo' });
	if (!created.ok) throw new Error(created.message);
	const asker = await upsertVerifiedAccount(t.db, 'pide-inventade@example.com');
	await t.db
		.prepare(
			"INSERT INTO profile_claims (profile_id, account_id, message, status, created_at) VALUES (?1, ?2, 'Soy yo', 'pending', ?3)"
		)
		.bind(created.profile.id, asker.id, NOW - DAY)
		.run();
	// El chequeo nocturno encontró algo.
	await recordIntegrityRun(
		t.db,
		[{ code: 'edge_dangling', message: 'inventado', edgeId: 7 }],
		NOW - 8 * HOUR
	);
	// Última visita: hace dos horas (visita nueva), vista hasta hace tres días.
	await t.db
		.prepare('INSERT INTO admin_last_seen (admin_id, seen_at, last_at) VALUES (?1, ?2, ?3)')
		.bind(admin.id, NOW - 3 * DAY, NOW - 2 * HOUR)
		.run();
	// Un .md no listado (el contador del menú).
	fake.unlisted = [{ meta: { category: 'calendario', postID: 'no-listado-inventado-2031-09' } }];
}

/** La fila de la última visita, para volver a dejarla igual entre las dos corridas. */
async function lastSeenRow() {
	return t.db.prepare('SELECT * FROM admin_last_seen').all();
}
/** @param {Awaited<ReturnType<typeof lastSeenRow>>} saved */
async function restoreLastSeen(saved) {
	await t.db.prepare('DELETE FROM admin_last_seen').run();
	for (const r of saved.results) {
		await t.db
			.prepare('INSERT INTO admin_last_seen (admin_id, seen_at, last_at) VALUES (?1, ?2, ?3)')
			.bind(r.admin_id, r.seen_at, r.last_at)
			.run();
	}
}

/**
 * La base de pruebas contando las idas: cada `batch` es una, y cada sentencia que no va en una
 * tanda, otra.
 */
function countingPlatform() {
	const stats = { prepared: 0, batches: 0, batched: 0 };
	const db = /** @type {import('@cloudflare/workers-types').D1Database} */ (
		new Proxy(t.db, {
			get(target, prop) {
				if (prop === 'prepare') {
					return (/** @type {string} */ sql) => {
						stats.prepared++;
						return target.prepare(sql);
					};
				}
				if (prop === 'batch') {
					return (/** @type {any[]} */ statements) => {
						stats.batches++;
						stats.batched += statements.length;
						return target.batch(statements);
					};
				}
				const value = /** @type {any} */ (target)[prop];
				return typeof value === 'function' ? value.bind(target) : value;
			}
		})
	);
	return {
		platform: /** @type {App.Platform} */ (/** @type {unknown} */ ({ env: { DB: db } })),
		stats,
		/** Idas a la base. */
		trips: () => stats.batches + stats.prepared - stats.batched
	};
}

/** fondo.kinkyvibe.ar, de mentira. */
const fondoFetch = /** @type {typeof fetch} */ (
	async () => Response.json({ collected: 120000, goal: 500000, updatedAt: NOW - DAY })
);

/** @param {App.Platform | undefined} platform */
function fakeEvent(platform) {
	return /** @type {any} */ ({
		url: new URL('https://kinkyvibe.ar/admin'),
		// Sin PRs de contenido: `usesLocalRepo` da true.
		locals: { user: admin, user_token: 'token-de-prueba' },
		platform,
		fetch: fondoFetch,
		setHeaders: () => {}
	});
}

/**
 * Corre el load de antes y el de ahora sobre la misma base (con la misma última visita).
 * @param {App.Platform | undefined} platform
 */
async function bothLoads(platform) {
	const saved = await lastSeenRow();
	const before = await oldLoad(fakeEvent(platform));
	const seenAfterOld = await lastSeenRow();
	await restoreLastSeen(saved);
	const after = await load(fakeEvent(platform));
	// Las dos anotan la visita igual.
	expect((await lastSeenRow()).results).toEqual(seenAfterOld.results);
	return { before, after };
}

describe('Inicio en tanda: lo mismo que antes', () => {
	it('con datos de todo tipo: la página y los contadores del menú son idénticos', async () => {
		await seed();
		const { before, after } = await bothLoads(t.platform);
		expect(after).toEqual(before);
		// Que la comparación no sea entre dos cosas vacías.
		expect(before.upcoming.map((e) => e.slug)).toEqual([
			'taller-hoy',
			'fiesta-hoy',
			// Los eventos de prueba se ven en `vite dev` (y en los tests).
			'prueba-x',
			'viernes',
			'borrador',
			'cancelado',
			'sin-entradas',
			'lejos'
		]);
		const fiesta = before.upcoming.find((e) => e.slug === 'fiesta-hoy');
		expect(fiesta).toMatchObject({
			sold: 6,
			checkedIn: 3,
			issued: 4,
			missingStream: true,
			// h48 (3 órdenes, menos la que se rindió) y el de las 9 de hoy (las 4 de antes de las 9).
			failedReminders: 7,
			stuckReminders: 1
		});
		expect(before.upcoming.find((e) => e.slug === 'viernes')).toMatchObject({
			transfers: 2,
			review: 1,
			stuckStreamLinks: 1
		});
		expect(before.sales?.event.slug).toBe('fiesta-hoy');
		expect(before.sales?.trend?.days.some((d) => d.count > 0)).toBe(true);
		expect(before.money?.fondoTips).toBe(3000);
		expect(before.fondo).toMatchObject({ collected: 120000 });
		expect(before.activity.length).toBe(10);
		expect(before.since).toMatchObject({ first: false, since: NOW - 2 * HOUR, audit: 1 });
		expect(before.since?.items.length).toBeGreaterThan(0);
		expect(before.todo.length).toBeGreaterThan(4);
		expect(before.agenda.length).toBeGreaterThan(1);

		const counts = await panelCounts(t.platform);
		expect(counts).toEqual(await oldPanelCounts(t.platform));
		expect(counts).toEqual({
			transfers: 2,
			reviewOrders: 1,
			profilesToReview: 2,
			unlisted: 1,
			review: 5
		});
	});

	it('primera visita y base vacía: igual', async () => {
		fake.events = [event('fiesta-hoy', 'Fiesta Inventada', '2026-09-30T22:00-03:00')];
		const { before, after } = await bothLoads(t.platform);
		expect(after).toEqual(before);
		expect(before.since).toMatchObject({ first: true, since: NOW - 7 * DAY });
		expect(await panelCounts(t.platform)).toEqual(await oldPanelCounts(t.platform));
	});

	it('sin base de datos: igual (todo vacío, nunca rompe)', async () => {
		await seed();
		const none = /** @type {App.Platform} */ (/** @type {unknown} */ ({ env: {} }));
		const before = await oldLoad(fakeEvent(none));
		const after = await load(fakeEvent(none));
		expect(after).toEqual(before);
		expect(after).toMatchObject({ dbAvailable: false, money: null, since: null, activity: [] });
		expect(await panelCounts(none)).toEqual(await oldPanelCounts(none));
	});

	it('si a la base le falta una tabla, lo demás sale igual que antes', async () => {
		await seed();
		// Como una base sin la migración de propinas: la tanda falla y cada consulta va sola.
		await t.db.prepare('ALTER TABLE tips RENAME TO tips_aparte').run();
		try {
			const { before, after } = await bothLoads(t.platform);
			expect(after).toEqual(before);
			expect(after.money).toMatchObject({ fondoTips: 0 });
			expect(after.upcoming.find((e) => e.slug === 'fiesta-hoy')?.sold).toBe(6);
			expect(await panelCounts(t.platform)).toEqual(await oldPanelCounts(t.platform));
		} finally {
			await t.db.prepare('ALTER TABLE tips_aparte RENAME TO tips').run();
		}
	});
});

describe('Inicio en tanda: cuántas idas a la base', () => {
	it('la página hace 2 (antes, 33 consultas) y los contadores del menú 1 (antes, 5)', async () => {
		await seed();
		// fondo.kinkyvibe.ar ya leído en este isolate (lo normal: se recuerda unos minutos).
		await load(fakeEvent(t.platform));

		const page = countingPlatform();
		await load(fakeEvent(page.platform));
		expect(page.trips()).toBe(2);
		expect(page.stats.batches).toBe(2);
		// Las sentencias de este escenario (no crecen sin que se note): 16 en la primera tanda y 19
		// en la segunda (totales, ingresos, links, 3 de envíos fallidos, 4 recordatorios vencidos
		// —2 por evento de hoy—, 5 de la última visita y 2 por evento de hoy para el gráfico).
		expect(page.stats.prepared).toBe(16 + 19);

		// El de antes, con las mismas funciones: una ida por consulta (acá sin las de la lista de
		// eventos, que son de mentira).
		const old = countingPlatform();
		await oldLoad(fakeEvent(old.platform));
		expect(old.trips()).toBeGreaterThan(20);

		const layout = countingPlatform();
		await panelCounts(layout.platform);
		expect(layout.trips()).toBe(1);
		expect(layout.stats.prepared).toBe(4);
	});
});
