import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { logAccountCreated } from './accountEvents.js';
import {
	EMAIL_GRACE_MS,
	agendaItems,
	arDay,
	arTime,
	dayLabel,
	eventSalesTrend,
	expiringTransfers,
	salesFocus,
	salesSummary,
	arMonthWindow,
	checkinTotals,
	failedReminders,
	monthMoney,
	pendingTransfers,
	recentActivity,
	groupReviewItems,
	profileReviewItems,
	integrityReviewRow,
	integrityRun,
	reviewItems,
	reviewOrders,
	sinceLastVisit,
	streamLinkSlugs,
	stuckSends,
	ticketTotals,
	unsentEmails,
	upcomingEvents,
	whenLabel
} from './inicio.js';
import { logAdminAction } from './audit.js';
import { insertOrder, insertTicket } from './testRows.js';
import { applyTipPayment, createTip, tipReference } from '$lib/server/propinas/index.js';

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
});

/** @param {string} local ej. '2026-09-30T12:00' (hora de Argentina) */
const ar = (local) => new Date(`${local}:00-03:00`).getTime();
const NOW = ar('2026-09-30T12:00');
const HOUR = 60 * 60 * 1000;

describe('fechas en hora de Argentina', () => {
	it('arDay usa UTC-3', () => {
		expect(arDay(Date.parse('2026-10-01T02:00:00Z'))).toBe('2026-09-30');
		expect(arDay('2026-10-01T21:00-03:00')).toBe('2026-10-01');
		expect(arDay('no es fecha')).toBe('');
	});
	it('arMonthWindow es el mes calendario de Argentina', () => {
		const w = arMonthWindow(Date.parse('2026-10-01T02:00:00Z'));
		expect(w.start).toBe(ar('2026-09-01T00:00'));
		expect(w.end).toBe(ar('2026-10-01T00:00'));
		expect(arMonthWindow(ar('2026-12-31T23:00')).end).toBe(ar('2027-01-01T00:00'));
	});
});

describe('consultas sin base de datos', () => {
	it('devuelven vacío, nunca tiran error', async () => {
		expect(await ticketTotals(null, ['x'], NOW)).toEqual(new Map());
		expect(await checkinTotals(null, ['x'])).toEqual(new Map());
		expect(await pendingTransfers(null, NOW)).toEqual([]);
		expect(await unsentEmails(null, NOW)).toEqual([]);
		expect(await reviewOrders(null)).toEqual([]);
		expect(await streamLinkSlugs(null, ['x'])).toEqual(new Set());
		expect(await monthMoney(null, NOW)).toBe(null);
		expect(await recentActivity(null)).toEqual([]);
		expect(await sinceLastVisit(null, { since: 0 })).toBe(null);
		expect(await failedReminders(null, { events: [], reminders: [], now: NOW })).toEqual(new Map());
	});
});

describe('totales', () => {
	it('ticketTotals suma por evento y tipo (vendidas, reservadas vigentes, plata y fondo)', async () => {
		await insertOrder(t.db, {
			slug: 'a',
			type: 'general',
			quantity: 2,
			unitPrice: 10000,
			created: NOW - HOUR
		});
		await insertOrder(t.db, {
			slug: 'a',
			type: 'general',
			quantity: 1,
			unitPrice: 10000,
			fondoAmount: 2000,
			created: NOW - HOUR
		});
		await insertOrder(t.db, {
			slug: 'a',
			type: 'anticipada',
			contribution: 3000,
			created: NOW - HOUR
		});
		// Reservada vigente y reservada vencida.
		await insertOrder(t.db, {
			slug: 'a',
			status: 'pending',
			created: NOW - 60_000,
			expires: NOW + HOUR
		});
		await insertOrder(t.db, {
			slug: 'a',
			status: 'pending',
			created: NOW - 2 * HOUR,
			expires: NOW - HOUR
		});
		await insertOrder(t.db, { slug: 'b', quantity: 5 });
		const totals = await ticketTotals(t.db, ['a'], NOW);
		expect(totals.has('b')).toBe(false);
		expect(totals.get('a')?.get('general')).toEqual({
			sold: 3,
			held: 1,
			revenue: 28000,
			fondo: 2000,
			contribution: 0
		});
		expect(totals.get('a')?.get('anticipada')).toMatchObject({ sold: 1, contribution: 3000 });
		expect(await ticketTotals(t.db, [], NOW)).toEqual(new Map());
	});

	it('checkinTotals cuenta entradas de órdenes aprobadas e ingresos', async () => {
		const o = await insertOrder(t.db, { slug: 'hoy', quantity: 3 });
		await insertTicket(t.db, { orderId: o, slug: 'hoy', checkedInAt: NOW });
		await insertTicket(t.db, { orderId: o, slug: 'hoy' });
		await insertTicket(t.db, { orderId: o, slug: 'hoy', checkedInAt: NOW });
		const r = await insertOrder(t.db, { slug: 'hoy', status: 'refunded' });
		await insertTicket(t.db, { orderId: r, slug: 'hoy', checkedInAt: NOW });
		expect((await checkinTotals(t.db, ['hoy'])).get('hoy')).toEqual({ tickets: 3, checkedIn: 2 });
	});

	it('monthMoney suma lo aprobado del mes (y el neto del fondo)', async () => {
		await insertOrder(t.db, { unitPrice: 10000, created: ar('2026-09-02T10:00') });
		await insertOrder(t.db, {
			unitPrice: 8000,
			quantity: 2,
			fondoAmount: 1600,
			created: ar('2026-09-29T10:00')
		});
		await insertOrder(t.db, { contribution: 2000, created: ar('2026-09-15T10:00') });
		// Fuera del mes o no aprobadas: no cuentan.
		await insertOrder(t.db, { created: ar('2026-08-31T23:59') });
		await insertOrder(t.db, { status: 'refunded', created: ar('2026-09-10T10:00') });
		await insertOrder(t.db, { status: 'awaiting_transfer', created: ar('2026-09-10T10:00') });
		expect(await monthMoney(t.db, NOW)).toEqual({
			start: ar('2026-09-01T00:00'),
			total: 10000 + 14400 + 12000,
			orders: 3,
			tickets: 4,
			fondoNet: 2000 - 1600,
			fondoTips: 0
		});
	});

	it('monthMoney suma a los aportes al fondo las propinas "Para el Fondo" aprobadas este mes (solo esas)', async () => {
		await insertOrder(t.db, { contribution: 2000, created: ar('2026-09-15T10:00') });
		await insertOrder(t.db, { fondoAmount: 500, created: ar('2026-09-16T10:00') });
		let paymentId = 0;
		/**
		 * @param {number} amount
		 * @param {'kinkyvibe' | 'fondo'} destination
		 * @param {string[]} statuses estados de MP que se aplican en orden
		 * @param {number} at
		 */
		async function tip(amount, destination, statuses, at) {
			const tip = await createTip(
				t.db,
				{ amount, message: null, category: 'material', slug: 'guia', destination },
				{ now: at }
			);
			const id = ++paymentId;
			for (const status of statuses) {
				await applyTipPayment(
					t.db,
					{
						id,
						status,
						external_reference: tipReference(tip.id),
						transaction_amount: amount,
						currency_id: 'ARS'
					},
					{ now: at }
				);
			}
		}
		await tip(3000, 'fondo', ['approved'], ar('2026-09-10T10:00'));
		await tip(1000, 'fondo', ['approved'], ar('2026-09-29T23:00'));
		// No suman: pendiente, rechazada, reembolsada, de KinkyVibe o aprobada en otro mes.
		await tip(7000, 'fondo', [], ar('2026-09-10T10:00'));
		await tip(5000, 'fondo', ['rejected'], ar('2026-09-10T10:00'));
		await tip(4000, 'fondo', ['approved', 'refunded'], ar('2026-09-10T10:00'));
		await tip(9000, 'kinkyvibe', ['approved'], ar('2026-09-10T10:00'));
		await tip(8000, 'fondo', ['approved'], ar('2026-08-31T23:00'));
		const money = await monthMoney(t.db, NOW);
		expect(money).toMatchObject({
			orders: 2,
			fondoTips: 4000,
			// Aportes (entrada solidaria + propinas al Fondo) − lo que cubrió el fondo.
			fondoNet: 2000 + 4000 - 500
		});
	});
});

describe('para revisar', () => {
	it('pendingTransfers: solo vigentes, por evento, con el vencimiento más cercano', async () => {
		await insertOrder(t.db, {
			slug: 'a',
			status: 'awaiting_transfer',
			method: 'transferencia',
			expires: NOW + 5 * HOUR
		});
		await insertOrder(t.db, {
			slug: 'a',
			status: 'awaiting_transfer',
			method: 'transferencia',
			expires: NOW + 2 * HOUR
		});
		await insertOrder(t.db, {
			slug: 'b',
			status: 'awaiting_transfer',
			method: 'transferencia',
			expires: NOW - HOUR
		});
		expect(await pendingTransfers(t.db, NOW)).toEqual([
			{ slug: 'a', count: 2, oldestExpiry: NOW + 2 * HOUR }
		]);
	});

	it('unsentEmails: aprobadas sin mail, pasado el margen del envío', async () => {
		const late = await insertOrder(t.db, {
			name: 'Sin Mail',
			emailSentAt: null,
			created: NOW - HOUR
		});
		await insertOrder(t.db, { emailSentAt: null, created: NOW - EMAIL_GRACE_MS / 2 });
		await insertOrder(t.db, { emailSentAt: NOW - HOUR, created: NOW - HOUR });
		await insertOrder(t.db, {
			status: 'awaiting_transfer',
			emailSentAt: null,
			created: NOW - HOUR
		});
		const r = await unsentEmails(t.db, NOW);
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({ id: late, buyerName: 'Sin Mail' });
		expect(r[0].ref).toMatch(/^KV-[0-9A-F]{8}$/);
	});

	it('reviewOrders y streamLinkSlugs', async () => {
		await insertOrder(t.db, { slug: 'a', needsReview: 'late_payment', name: 'Tarde' });
		await insertOrder(t.db, { slug: 'a' });
		expect(await reviewOrders(t.db)).toEqual([
			expect.objectContaining({ slug: 'a', reason: 'late_payment', buyerName: 'Tarde' })
		]);
		await t.db
			.prepare(
				"INSERT INTO event_ticket_settings (event_slug, stream_link) VALUES ('on', 'https://example.com/sala')"
			)
			.run();
		await t.db
			.prepare("INSERT INTO event_ticket_settings (event_slug, stream_link) VALUES ('vacio', '')")
			.run();
		expect(await streamLinkSlugs(t.db, ['on', 'vacio', 'otro'])).toEqual(new Set(['on']));
	});

	it('failedReminders: órdenes cuyo recordatorio ya tendría que haber salido y no salió', async () => {
		const start = NOW + 20 * HOUR;
		const o = await insertOrder(t.db, { slug: 'r', created: NOW - 72 * HOUR });
		await insertOrder(t.db, { slug: 'r', created: NOW - 72 * HOUR });
		// A una ya le salió.
		await t.db
			.prepare("INSERT INTO reminder_sends (order_id, reminder_id, sent_at) VALUES (?1, 'h48', ?2)")
			.bind(o, NOW - 28 * HOUR)
			.run();
		const events = [{ slug: 'r', start, reminders: true, cancelled: false }];
		const reminders = /** @type {any[]} */ ([
			{ kind: 'hours_before', hours: 48, enabled: true },
			// Este todavía no tocó (vence en 4 h): no cuenta.
			{ kind: 'hours_before', hours: 16, enabled: true }
		]);
		expect(await failedReminders(t.db, { events, reminders, now: NOW })).toEqual(
			new Map([['r', 1]])
		);
	});
});

describe('actividad', () => {
	it('recentActivity mezcla compras (con nombre) y acciones de admins, de la más nueva a la más vieja', async () => {
		await insertOrder(t.db, {
			slug: 'a',
			name: 'Ana Inventada',
			pronouns: 'ella',
			created: NOW - 3 * HOUR
		});
		await insertOrder(t.db, {
			slug: 'a',
			name: 'Bruno Ficticio',
			status: 'awaiting_transfer',
			method: 'transferencia',
			created: NOW - HOUR
		});
		await insertOrder(t.db, { slug: 'a', status: 'expired', created: NOW - 30 * 60_000 });
		await logAdminAction(
			t.db,
			{ user: { id: 1, login: 'admin-uno' } },
			{ action: 'event.publish', targetType: 'event', targetId: 'a', summary: 'Publicó el evento' },
			{ now: NOW - 2 * HOUR }
		);
		const items = await recentActivity(t.db, { titles: new Map([['a', 'Evento A']]) });
		expect(items.map((i) => i.kind)).toEqual(['transfer', 'audit', 'order']);
		expect(items[2]).toMatchObject({ title: 'Compra', who: 'Ana Inventada (ella)', slug: 'a' });
		expect(items[2].detail).toContain('Evento A');
		expect(items[1]).toMatchObject({ who: 'admin-uno', title: 'Publicó el evento', slug: 'a' });
		// Nunca trae el DNI.
		expect(JSON.stringify(items)).not.toMatch(/dni/i);
	});

	it('sinceLastVisit cuenta lo nuevo y excluye mis propias acciones del conteo', async () => {
		await insertOrder(t.db, { unitPrice: 5000, created: NOW - 10 * HOUR });
		await insertOrder(t.db, { unitPrice: 7000, created: NOW - HOUR });
		await insertOrder(t.db, {
			status: 'awaiting_transfer',
			method: 'transferencia',
			created: NOW - HOUR
		});
		await logAdminAction(
			t.db,
			{ user: { id: 1, login: 'yo' } },
			{ action: 'x.y', summary: 'mío' },
			{ now: NOW - HOUR }
		);
		await logAdminAction(
			t.db,
			{ user: { id: 2, login: 'otre' } },
			{ action: 'x.y', summary: 'de otre' },
			{ now: NOW - HOUR }
		);
		// Una cuenta nueva va en la lista, pero no es un cambio de otre admin.
		await logAccountCreated(t.db, '00000000-0000-4000-8000-000000000000', { now: NOW - HOUR });
		const s = await sinceLastVisit(t.db, { since: NOW - 2 * HOUR, login: 'yo' });
		expect(s).toMatchObject({ orders: 1, money: 7000, transfers: 1, audit: 1 });
		expect(s?.items.length).toBe(5);
		expect(s?.items.filter((i) => i.kind === 'account').map((i) => i.title)).toEqual([
			'Se creó una cuenta nueva'
		]);
	});
});

describe('upcomingEvents y reviewItems', () => {
	/** @type {any} */
	const config = (o = {}) => ({
		types: [
			{ id: 'general', name: 'General', capacity: 10 },
			{ id: 'anticipada', name: 'Anticipada', capacity: 2 }
		],
		fondoEnabled: true,
		online: false,
		opensAt: null,
		status: 'abierto',
		...o
	});
	/** @type {any[]} */
	const events = [
		{
			slug: 'pasado',
			title: 'Pasado',
			start: '2026-09-29T20:00-03:00',
			unlisted: false,
			unpublished: false,
			thumb: 'x.jpg',
			location: '',
			status: 'abierto'
		},
		{
			slug: 'hoy',
			title: 'Hoy',
			start: '2026-09-30T21:00-03:00',
			unlisted: false,
			unpublished: false,
			thumb: 'x.jpg',
			location: 'Lugar',
			status: 'abierto'
		},
		{
			slug: 'online',
			title: 'Online',
			start: '2026-10-10T19:00-03:00',
			unlisted: false,
			unpublished: false,
			thumb: undefined,
			location: '',
			status: 'abierto'
		},
		{
			slug: 'borrador',
			title: 'Borrador',
			start: '2026-11-01T19:00-03:00',
			unlisted: true,
			unpublished: false,
			thumb: undefined,
			location: '',
			status: 'anunciado'
		},
		{
			slug: 'oculto',
			title: 'Oculto',
			start: '2026-11-02T19:00-03:00',
			unlisted: false,
			unpublished: true,
			thumb: undefined,
			location: '',
			status: 'abierto'
		},
		{
			slug: 'prueba-entradas-x',
			title: 'Prueba',
			start: '2026-11-03T19:00-03:00',
			unlisted: true,
			unpublished: false,
			location: '',
			status: 'abierto'
		}
	];
	const ticketed = new Map([
		['hoy', config()],
		['online', config({ online: true, fondoEnabled: false })]
	]);
	const totals = new Map([
		[
			'hoy',
			new Map([
				['general', { sold: 8, held: 1, revenue: 80000, fondo: 4000, contribution: 1000 }],
				['anticipada', { sold: 3, held: 0, revenue: 24000, fondo: 0, contribution: 0 }]
			])
		],
		[
			'online',
			new Map([['general', { sold: 4, held: 0, revenue: 20000, fondo: 0, contribution: 0 }]])
		]
	]);

	const upcoming = upcomingEvents({
		events,
		ticketed,
		totals,
		checkins: new Map([['hoy', { tickets: 11, checkedIn: 5 }]]),
		transfers: [{ slug: 'hoy', count: 2 }],
		review: [{ slug: 'hoy' }],
		streamLinks: new Set(),
		reminders: new Map([['online', 3]]),
		now: NOW,
		skip: (slug) => slug.startsWith('prueba-entradas')
	});

	it('todos los próximos (desde hoy), ordenados; sin los no publicados ni los salteados', () => {
		expect(upcoming.map((e) => e.slug)).toEqual(['hoy', 'online', 'borrador']);
	});

	it('números por evento: cupo, vendidas, plata, fondo, hoy, sobreventa', () => {
		const hoy = upcoming[0];
		expect(hoy).toMatchObject({
			today: true,
			capacity: 12,
			sold: 11,
			held: 1,
			revenue: 104000,
			fondoNet: -3000,
			transfers: 2,
			review: 1,
			checkedIn: 5,
			issued: 11,
			ticketed: true
		});
		expect(hoy.oversold).toEqual([{ type: 'Anticipada', sold: 3, capacity: 2 }]);
		expect(upcoming[1]).toMatchObject({ missingStream: true, failedReminders: 3, hasImage: false });
		expect(upcoming[2]).toMatchObject({ draft: true, ticketed: false, capacity: 0 });
	});

	it('un tipo sin cupo (capacity null): el evento no tiene cupo total y ese tipo no se pasa', () => {
		const [e] = upcomingEvents({
			events: [events[1]],
			ticketed: new Map([
				[
					'hoy',
					config({
						types: [
							{ id: 'general', name: 'General', capacity: null },
							{ id: 'anticipada', name: 'Anticipada', capacity: 2 }
						]
					})
				]
			]),
			totals,
			now: NOW
		});
		expect(e).toMatchObject({ capacity: null, sold: 11 });
		// La anticipada sí tiene cupo: sigue marcada; la general (8 vendidas, sin cupo) no.
		expect(e.oversold).toEqual([{ type: 'Anticipada', sold: 3, capacity: 2 }]);
	});

	it('reviewItems arma un ítem con acción por cada cosa para revisar', () => {
		const items = reviewItems({
			upcoming,
			transfers: [{ slug: 'hoy', count: 2, oldestExpiry: NOW + HOUR }],
			unsent: [{ id: 'o1', ref: 'KV-O1', slug: 'hoy', buyerName: 'Sin Mail' }],
			review: [
				{ id: 'o2', ref: 'KV-O2', slug: 'hoy', reason: 'duplicate_payment', buyerName: 'Doble' }
			],
			titles: new Map([['hoy', 'Hoy']]),
			links: {
				transfers: (s) => `/t/${s}`,
				order: (s, id) => `/o/${s}/${id ?? ''}`,
				stream: (s) => `/s/${s}`,
				edit: (s) => `/e/${s}`
			},
			formatWhen: () => 'en 1 h'
		});
		const ids = items.map((i) => i.id);
		expect(ids).toEqual([
			'transfer-hoy',
			'review-o2',
			'mail-o1',
			'oversold-hoy-Anticipada',
			'stream-online',
			'reminder-online',
			'image-online',
			'image-borrador',
			'draft-borrador'
		]);
		expect(items[0]).toMatchObject({ href: '/t/hoy', text: 'Hoy · la más vieja vence en 1 h' });
		expect(items[2]).toMatchObject({ action: 'Reenviar', resend: { orderId: 'o1' } });
		expect(items[1].title).toContain('duplicado');
		// Los borradores sin imagen también cuentan como "sin imagen" (igual que el filtro de Eventos).
		expect(items.find((i) => i.id === 'image-borrador')).toMatchObject({
			group: 'image',
			name: 'Borrador'
		});
		expect(items.find((i) => i.id === 'draft-borrador')).toMatchObject({ group: 'draft' });
		expect(items.filter((i) => i.group).map((i) => i.id)).toEqual([
			'image-online',
			'image-borrador',
			'draft-borrador'
		]);
	});
	it('envíos que fallaron todos sus intentos: recordatorios con "Reintentar", link al evento', async () => {
		expect(await stuckSends(null, ['online'])).toEqual({
			reminders: new Map(),
			streamLinks: new Map()
		});
		const withStuck = upcomingEvents({
			events,
			ticketed,
			totals,
			streamLinks: new Set(['online']),
			stuck: { reminders: new Map([['online', 2]]), streamLinks: new Map([['online', 1]]) },
			now: NOW,
			skip: (slug) => slug.startsWith('prueba-entradas')
		});
		expect(withStuck.find((e) => e.slug === 'online')).toMatchObject({
			stuckReminders: 2,
			stuckStreamLinks: 1
		});
		const items = reviewItems({
			upcoming: withStuck,
			transfers: [],
			unsent: [],
			review: [],
			titles: new Map(),
			links: {
				transfers: (s) => `/t/${s}`,
				order: (s, id) => `/o/${s}/${id ?? ''}`,
				stream: (s) => `/s/${s}`,
				edit: (s) => `/e/${s}`
			},
			formatWhen: () => ''
		});
		expect(items.find((i) => i.id === 'reminder-failed-online')).toMatchObject({
			action: 'Reintentar',
			retryReminders: { slug: 'online' }
		});
		expect(items.find((i) => i.id === 'reminder-failed-online')?.text).toMatch(/^2 órdenes/);
		expect(items.find((i) => i.id === 'stream-failed-online')).toMatchObject({ href: '/s/online' });
	});
});

describe('groupReviewItems', () => {
	/**
	 * @param {string} id
	 * @param {any} [o]
	 * @returns {import('./inicio.js').ReviewItem}
	 */
	const item = (id, o = {}) => ({
		id,
		tone: 'bad',
		icon: 'alert',
		title: id,
		text: '',
		action: 'Ver',
		href: `/${id}`,
		...o
	});
	const links = { noImage: '/admin/eventos?filtro=sin-imagen' };
	const image = (/** @type {string} */ s) =>
		item(`image-${s}`, { tone: 'info', icon: 'image', group: 'image', name: s });
	const draft = (/** @type {string} */ s) =>
		item(`draft-${s}`, { tone: 'info', icon: 'draft', group: 'draft', name: s });

	it('lo urgente queda de a uno; lo repetitivo, una fila por tipo con la cuenta', () => {
		const items = [
			item('transfer-a', { tone: 'warn' }),
			item('mail-1', { resend: { orderId: '1' } }),
			item('stream-b', { tone: 'warn' }),
			image('a'),
			image('b'),
			image('c'),
			draft('x'),
			draft('y')
		];
		const rows = groupReviewItems(items, { links });
		expect(rows.map((r) => `${r.kind}:${r.id}`)).toEqual([
			'item:transfer-a',
			'item:mail-1',
			'item:stream-b',
			'group:group-image',
			'group:group-draft'
		]);
		expect(rows[1]).toMatchObject({ kind: 'item', resend: { orderId: '1' } });
		const [img, dr] = rows.slice(3);
		expect(img).toMatchObject({
			kind: 'group',
			title: '3 eventos próximos sin imagen',
			action: 'Ver',
			href: '/admin/eventos?filtro=sin-imagen'
		});
		expect(img.kind === 'group' && img.items.map((i) => i.id)).toEqual([
			'image-a',
			'image-b',
			'image-c'
		]);
		// Sin una lista filtrada que muestre justo esos borradores: sin href (se despliega).
		expect(dr).toMatchObject({ kind: 'group', title: '2 borradores sin publicar' });
		expect(dr).not.toHaveProperty('href');
		expect(dr.kind === 'group' && dr.items.map((i) => i.name)).toEqual(['x', 'y']);
	});

	it('un solo ítem de un tipo queda suelto, con su acción directa', () => {
		const rows = groupReviewItems([image('a'), draft('x'), draft('y')], { links });
		expect(rows.map((r) => `${r.kind}:${r.id}`)).toEqual(['item:image-a', 'group:group-draft']);
		expect(rows[0]).toMatchObject({ href: '/image-a', action: 'Ver' });
	});

	it('los grupos van donde estaba su primer ítem y no pierden ninguno', () => {
		const items = [image('a'), item('urgente'), image('b'), draft('x'), draft('y'), image('c')];
		const rows = groupReviewItems(items, { links });
		expect(rows.map((r) => r.id)).toEqual(['group-image', 'urgente', 'group-draft']);
		const total = rows.reduce((n, r) => n + (r.kind === 'group' ? r.items.length : 1), 0);
		expect(total).toBe(items.length);
	});

	it('min configurable; sin ítems, sin filas', () => {
		expect(groupReviewItems([], { links })).toEqual([]);
		const rows = groupReviewItems([image('a'), image('b')], { links, min: 3 });
		expect(rows.map((r) => r.kind)).toEqual(['item', 'item']);
		expect(groupReviewItems([image('a')], { links, min: 1 })[0]).toMatchObject({
			kind: 'group',
			title: '1 evento próximo sin imagen'
		});
	});
});

describe('perfiles nuevos en "Para revisar"', () => {
	const profile = (
		/** @type {number} */ id,
		kind = /** @type {'persona' | 'proyecto'} */ ('persona')
	) => ({
		id,
		title: `Perfil Inventado ${id}`,
		kind,
		createdAt: NOW - HOUR
	});

	it('un ítem por perfil, con link a su ficha', () => {
		const items = profileReviewItems([profile(7, 'proyecto')], { formatWhen: () => 'hace 1 h' });
		expect(items).toEqual([
			{
				id: 'profile-7',
				tone: 'info',
				icon: 'profile',
				title: 'Perfil nuevo: Perfil Inventado 7',
				text: 'Proyecto · creado desde Mi rincón hace 1 h',
				action: 'Revisar',
				href: '/admin/comunidad/cuentas/perfiles/7',
				group: 'profile',
				name: 'Perfil Inventado 7'
			}
		]);
		expect(profileReviewItems([])).toEqual([]);
	});

	it('uno solo queda de a uno; varios, una fila que lleva a Perfiles filtrado', () => {
		const links = { noImage: '/admin/eventos?filtro=sin-imagen' };
		const one = groupReviewItems(profileReviewItems([profile(1)]), { links });
		expect(one.map((r) => `${r.kind}:${r.id}`)).toEqual(['item:profile-1']);
		const many = groupReviewItems(profileReviewItems([profile(1), profile(2), profile(3)]), {
			links
		});
		expect(many).toHaveLength(1);
		expect(many[0]).toMatchObject({
			kind: 'group',
			id: 'group-profile',
			title: '3 perfiles nuevos para revisar',
			href: '/admin/comunidad/perfiles?estado=sin-revisar'
		});
	});
});

describe('columna de la derecha: agenda, ventas y actividad', () => {
	it('dayLabel y arTime (hora de Argentina)', () => {
		expect(dayLabel('2026-09-30', '2026-09-30')).toBe('Hoy');
		expect(dayLabel('2026-10-01', '2026-09-30')).toBe('Mañana');
		expect(dayLabel('2026-09-29', '2026-09-30')).toBe('Ayer');
		expect(dayLabel('2026-10-02', '2026-09-30')).toBe('vie 2/10');
		expect(dayLabel('2026-10-04', '2026-09-30')).toBe('dom 4/10');
		expect(arTime(ar('2026-09-30T21:05'))).toBe('21:05');
		expect(arTime(ar('2026-10-01T00:00'))).toBe('0:00');
	});

	it('sin base: vacío', async () => {
		expect(await expiringTransfers(null, NOW, NOW + HOUR)).toEqual([]);
		expect(await eventSalesTrend(null, 'x', NOW)).toBe(null);
	});

	it('expiringTransfers agrupa por evento y día, solo las vigentes dentro de la ventana', async () => {
		const transfer = { status: 'awaiting_transfer', method: 'transferencia', created: NOW - HOUR };
		await insertOrder(t.db, { ...transfer, slug: 'a', expires: ar('2026-09-30T18:00') });
		await insertOrder(t.db, { ...transfer, slug: 'a', expires: ar('2026-09-30T23:30') });
		// 00:30 del 1/10 en Argentina (03:30 UTC): otro día.
		await insertOrder(t.db, { ...transfer, slug: 'a', expires: ar('2026-10-01T00:30') });
		await insertOrder(t.db, { ...transfer, slug: 'b', expires: ar('2026-09-30T20:00') });
		await insertOrder(t.db, { ...transfer, slug: 'a', expires: NOW - 60_000 }); // vencida
		await insertOrder(t.db, { ...transfer, slug: 'a', expires: ar('2026-10-09T12:00') }); // afuera
		await insertOrder(t.db, { slug: 'a', expires: ar('2026-09-30T19:00') }); // aprobada
		const rows = await expiringTransfers(t.db, NOW, ar('2026-10-07T00:00'));
		expect(rows).toEqual([
			{ slug: 'a', day: '2026-09-30', count: 2, first: ar('2026-09-30T18:00') },
			{ slug: 'b', day: '2026-09-30', count: 1, first: ar('2026-09-30T20:00') },
			{ slug: 'a', day: '2026-10-01', count: 1, first: ar('2026-10-01T00:30') }
		]);
	});

	/** @type {any[]} */
	const agendaEvents = [
		{ slug: 'ayer', title: 'Ayer', start: '2026-09-29T21:00-03:00', status: 'abierto' },
		{ slug: 'manana', title: 'Temprano', start: '2026-09-30T10:00-03:00', status: 'abierto' },
		{
			slug: 'noche',
			title: 'Noche',
			start: '2026-09-30T22:00-03:00',
			location: 'Lugar',
			status: 'abierto'
		},
		{ slug: 'viernes', title: 'Viernes', start: '2026-10-02T21:00-03:00', status: 'abierto' },
		{ slug: 'cancelado', title: 'Cancelado', start: '2026-10-03T21:00-03:00', status: 'abierto' },
		{ slug: 'lejos', title: 'Lejos', start: '2026-10-07T21:00-03:00', status: 'abierto' },
		{ slug: 'oculto', title: 'Oculto', start: '2026-10-01T21:00-03:00', unpublished: true },
		{ slug: 'prueba-x', title: 'Prueba', start: '2026-10-01T21:00-03:00', status: 'abierto' }
	].map((e) => ({ location: '', unlisted: false, unpublished: false, ...e }));
	/** @param {any} o @returns {any} */
	const tconfig = (o) => ({
		types: [],
		opensAt: null,
		closesAt: null,
		online: false,
		reminders: true,
		status: 'abierto',
		...o
	});
	const links = {
		event: (/** @type {string} */ s) => `/ev/${s}`,
		orders: (/** @type {string} */ s) => `/o/${s}`,
		transfers: (/** @type {string} */ s) => `/t/${s}`,
		reminders: '/ajustes'
	};

	it('agendaItems: 7 días desde hoy, por día, con cierres, transferencias y recordatorios', () => {
		const days = agendaItems({
			events: agendaEvents,
			ticketed: new Map([
				[
					'noche',
					tconfig({
						closesAt: ar('2026-09-30T22:00'), // cierra al empezar: no se repite
						types: [
							{
								id: 'anticipada',
								name: 'Anticipada',
								capacity: 10,
								closesAt: ar('2026-09-30T18:00')
							},
							{ id: 'general', name: 'General', capacity: null, closesAt: null }
						]
					})
				],
				[
					'viernes',
					tconfig({
						opensAt: ar('2026-10-01T12:00'),
						closesAt: ar('2026-10-02T18:00'),
						online: true
					})
				],
				['cancelado', tconfig({ status: 'cancelado', closesAt: ar('2026-10-03T12:00') })]
			]),
			transfers: [
				{ slug: 'noche', count: 2, first: ar('2026-09-30T15:00') },
				{ slug: 'noche', count: 1, first: ar('2026-10-09T15:00') }
			],
			reminders: [
				{ kind: 'hours_before', hours: 48, enabled: true },
				{ kind: 'day_at', days: 0, time: '09:00', enabled: true },
				{ kind: 'hours_before', hours: 3, enabled: false }
			],
			now: NOW,
			skip: (s) => s.startsWith('prueba-'),
			links
		});
		expect(days.map((d) => [d.label, d.items.map((i) => i.id)])).toEqual([
			[
				'Hoy',
				[
					'reminder-noche-d0-0900',
					'event-manana',
					'transfers-noche-2026-09-30',
					'type-noche-anticipada',
					// 48 h antes del viernes a las 21:00.
					'reminder-viernes-h48',
					'event-noche'
				]
			],
			['Mañana', ['open-viernes']],
			['vie 2/10', ['reminder-viernes-d0-0900', 'close-viernes', 'event-viernes']],
			['sáb 3/10', ['event-cancelado']]
		]);
		const today = days[0].items;
		// Lo de hoy que ya pasó queda marcado; el recordatorio de 48 h de "noche" salió antes de hoy.
		expect(today.find((i) => i.id === 'event-manana')).toMatchObject({
			past: true,
			time: '10:00'
		});
		expect(today.find((i) => i.id === 'event-noche')).toMatchObject({
			past: false,
			time: '22:00',
			text: 'Lugar',
			href: '/ev/noche'
		});
		expect(today.find((i) => i.kind === 'transfers')).toMatchObject({
			title: 'Vencen 2 transferencias',
			text: 'Noche · sin confirmar',
			href: '/t/noche'
		});
		expect(today.find((i) => i.kind === 'type-close')).toMatchObject({
			title: 'Cierra «Anticipada»: Noche',
			href: '/o/noche'
		});
		expect(days[2].items.find((i) => i.kind === 'event')?.text).toBe('Online');
		expect(days[2].items[0]).toMatchObject({ href: '/ajustes', text: 'el mismo día a las 9:00' });
		// Cancelado: aparece el evento (marcado) pero no su cierre de venta ni recordatorios.
		expect(days[3].items[0].text).toBe('Cancelado');
	});

	it('agendaItems sin nada en la semana: vacío', () => {
		expect(agendaItems({ events: [], ticketed: new Map(), now: NOW, links })).toEqual([]);
	});

	it('eventSalesTrend: entradas aprobadas por día (7 días hasta hoy) y online/puerta', async () => {
		await insertOrder(t.db, { slug: 'a', quantity: 2, created: ar('2026-09-30T00:10') });
		await insertOrder(t.db, { slug: 'a', quantity: 1, created: ar('2026-09-30T11:00') });
		await insertOrder(t.db, { slug: 'a', quantity: 3, created: ar('2026-09-29T23:59') });
		await insertOrder(t.db, { slug: 'a', quantity: 4, created: ar('2026-09-24T00:00') });
		await insertOrder(t.db, { slug: 'a', quantity: 9, created: ar('2026-09-23T23:59') }); // antes
		await insertOrder(t.db, { slug: 'a', status: 'pending', created: ar('2026-09-30T11:00') });
		await insertOrder(t.db, { slug: 'b', quantity: 5, created: ar('2026-09-30T11:00') });
		const trend = await eventSalesTrend(t.db, 'a', NOW);
		expect(trend?.days).toEqual([
			{ day: '2026-09-24', count: 4 },
			{ day: '2026-09-25', count: 0 },
			{ day: '2026-09-26', count: 0 },
			{ day: '2026-09-27', count: 0 },
			{ day: '2026-09-28', count: 0 },
			{ day: '2026-09-29', count: 3 },
			{ day: '2026-09-30', count: 3 }
		]);
		// Sin la columna `channel` (llega con el modo puerta) todo cuenta como online.
		expect(trend).toMatchObject({ online: 19, door: 0 });
	});

	/** @param {any} o @returns {any} */
	const up = (o) => ({
		ticketed: true,
		draft: false,
		status: 'abierto',
		today: false,
		sold: 0,
		day: '2026-10-02',
		start: '2026-10-02T21:00-03:00',
		...o
	});

	it('salesFocus: de hoy, el que más vendió; si no hay de hoy, el próximo con entradas', () => {
		const a = up({ slug: 'a', title: 'A', today: true, sold: 2 });
		const b = up({ slug: 'b', title: 'B', today: true, sold: 9 });
		const c = up({ slug: 'c', title: 'C' });
		expect(salesFocus([a, b, c])).toEqual({ event: b, others: [{ slug: 'a', title: 'A' }] });
		const cancelled = up({ slug: 'x', today: true, sold: 50, status: 'cancelado' });
		const draft = up({ slug: 'y', draft: true });
		const free = up({ slug: 'z', ticketed: false });
		expect(salesFocus([cancelled, draft, free, c])).toEqual({ event: c, others: [] });
		expect(salesFocus([free])).toBe(null);
	});

	it('salesSummary: por tipo con cupo, sin cupo, sobrevendido y cerrado', () => {
		const event = up({ slug: 'a', title: 'A', capacity: null, sold: 15 });
		const s = salesSummary({
			focus: { event, others: [] },
			config: tconfig({
				types: [
					{ id: 'anticipada', name: 'Anticipada', capacity: 5, closesAt: NOW - HOUR },
					{ id: 'general', name: 'General', capacity: null, closesAt: null },
					{ id: 'vip', name: 'VIP', capacity: 0 }
				]
			}),
			totals: new Map([
				[
					'a',
					new Map([
						['anticipada', { sold: 7, held: 0, revenue: 0, fondo: 0, contribution: 0 }],
						['general', { sold: 8, held: 2, revenue: 0, fondo: 0, contribution: 0 }]
					])
				]
			]),
			trend: { days: [{ day: '2026-09-30', count: 3 }], online: 3, door: 0 },
			now: NOW
		});
		expect(s.when).toBe('vie 2/10 · 21:00');
		expect(s.types).toEqual([
			{
				id: 'anticipada',
				name: 'Anticipada',
				sold: 7,
				held: 0,
				capacity: 5,
				over: 2,
				closed: true
			},
			{ id: 'general', name: 'General', sold: 8, held: 2, capacity: null, over: 0, closed: false },
			{ id: 'vip', name: 'VIP', sold: 0, held: 0, capacity: 0, over: 0, closed: false }
		]);
		expect(s.trend?.days).toEqual([{ day: '2026-09-30', count: 3, label: 'Hoy' }]);
	});

	it('recentActivity junta los ingresos en la puerta por evento y media hora', async () => {
		const o = await insertOrder(t.db, { slug: 'a', quantity: 4, created: NOW - 5 * HOUR });
		await insertTicket(t.db, { orderId: o, slug: 'a', checkedInAt: ar('2026-09-30T11:05') });
		await insertTicket(t.db, { orderId: o, slug: 'a', checkedInAt: ar('2026-09-30T11:20') });
		await insertTicket(t.db, { orderId: o, slug: 'a', checkedInAt: ar('2026-09-30T11:40') });
		await insertTicket(t.db, { orderId: o, slug: 'a' }); // no entró
		const items = await recentActivity(t.db, { titles: new Map([['a', 'Evento A']]) });
		expect(items.filter((i) => i.kind === 'checkin')).toEqual([
			{
				at: ar('2026-09-30T11:40'),
				kind: 'checkin',
				title: '1 ingreso en la puerta',
				who: 'Evento A',
				detail: '11:40',
				slug: 'a',
				orderId: null
			},
			{
				at: ar('2026-09-30T11:20'),
				kind: 'checkin',
				title: '2 ingresos en la puerta',
				who: 'Evento A',
				detail: '11:05 a 11:20',
				slug: 'a',
				orderId: null
			}
		]);
		expect(items.at(-1)?.kind).toBe('order');
	});
});

describe('chequeo nocturno de los datos en "Para revisar"', () => {
	it('con problemas: una sola fila que se despliega con código y slug', () => {
		const row = integrityReviewRow(
			{
				ranAt: 1000,
				count: 3,
				problems: [
					{ code: 'invalid_data', objectId: 4, slug: 'salon-inventado', type: 'lugar' },
					{ code: 'invalid_data', objectId: 5 },
					{ code: 'dangling_edge', edgeId: 9 }
				]
			},
			{ formatWhen: () => 'jue 1 oct, 03:00' }
		);
		expect(row).toMatchObject({
			kind: 'group',
			id: 'group-integrity',
			tone: 'bad',
			title: 'Chequeo nocturno: 3 problemas en los datos',
			text: 'invalid_data ×2, dangling_edge · revisado jue 1 oct, 03:00. No se arregla solo.',
			action: 'Ver'
		});
		expect(row && 'href' in row ? row.href : undefined).toBeUndefined();
		expect(row?.kind === 'group' ? row.items.map((i) => i.name) : []).toEqual([
			'invalid_data · salon-inventado',
			'invalid_data · objeto 5',
			'dangling_edge · relación 9'
		]);
	});

	it('singular, y avisa si hay más problemas que los guardados', () => {
		const one = integrityReviewRow({ ranAt: 0, count: 1, problems: [{ code: 'fts_out_of_sync' }] });
		expect(one?.title).toBe('Chequeo nocturno: 1 problema en los datos');
		const more = integrityReviewRow({
			ranAt: 0,
			count: 60,
			problems: [{ code: 'orphan', objectId: 1 }]
		});
		expect(more?.kind === 'group' ? more.items.at(-1)?.name : '').toBe(
			'y 59 problemas más (ver los logs del cron)'
		);
	});

	it('sin problemas o sin corridas: nada', () => {
		expect(integrityReviewRow({ ranAt: 0, count: 0, problems: [] })).toBeNull();
		expect(integrityReviewRow(null)).toBeNull();
	});

	it('integrityRun: null sin base, sin corridas o sin la migración 0012 (no tira error)', async () => {
		expect(await integrityRun(null)).toBeNull();
		expect(await integrityRun(t.db)).toBeNull();
		const bare = await createTestDB({ migrate: false });
		try {
			expect(await integrityRun(bare.db)).toBeNull();
		} finally {
			await bare.dispose();
		}
	}, 30_000);

	it('integrityRun: la última corrida guardada', async () => {
		const { recordIntegrityRun } = await import('$lib/server/objects/integrity.js');
		await recordIntegrityRun(t.db, [{ code: 'orphan', message: 'x', objectId: 3 }], 5000);
		expect(await integrityRun(t.db)).toEqual({
			ranAt: 5000,
			count: 1,
			problems: [{ code: 'orphan', objectId: 3 }]
		});
	});
});

describe('whenLabel', () => {
	it('shows far-off times on a 24-hour clock, in Argentina time', () => {
		const now = Date.parse('2026-10-01T12:00:00-03:00');
		const label = whenLabel(Date.parse('2026-10-11T22:00:00-03:00'), now);
		expect(label).toContain('22:00');
		expect(label).not.toMatch(/[ap]\.\s?m\./i);
	});
});
