import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	EMAIL_GRACE_MS,
	arDay,
	arMonthWindow,
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
	upcomingEvents
} from './inicio.js';
import { logAdminAction } from './audit.js';
import { insertOrder, insertTicket } from './testRows.js';

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
			fondoNet: 2000 - 1600
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
		const s = await sinceLastVisit(t.db, { since: NOW - 2 * HOUR, login: 'yo' });
		expect(s).toMatchObject({ orders: 1, money: 7000, transfers: 1, audit: 1 });
		expect(s?.items.length).toBe(4);
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
			'draft-borrador'
		]);
		expect(items[0]).toMatchObject({ href: '/t/hoy', text: 'Hoy · la más vieja vence en 1 h' });
		expect(items[2]).toMatchObject({ action: 'Reenviar', resend: { orderId: 'o1' } });
		expect(items[1].title).toContain('duplicado');
	});
});
