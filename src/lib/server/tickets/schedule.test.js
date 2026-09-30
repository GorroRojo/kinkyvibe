/**
 * Horarios de venta: apertura, cierre del evento y cierre propio de un tipo, en hora de Argentina.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	formatSaleTime,
	parseSaleTime,
	saleWindowText,
	toArgentinaLocalInput
} from '$lib/utils/tickets.js';
import { parseTicketConfig, salesState, typeOpen, validatePurchase } from './config.js';
import { applyPayment, reserveOrder } from './orders.js';

/** 2 de octubre de 2026, 20:00 en Argentina = 23:00 UTC. */
const CLOSE = Date.UTC(2026, 9, 2, 23, 0);

describe('parseSaleTime', () => {
	it.each([
		['2026-10-02T20:00-03:00', CLOSE],
		['2026-10-02T23:00Z', CLOSE],
		['2026-10-02T23:00:00.000Z', CLOSE],
		// Sin zona: hora de Argentina.
		['2026-10-02T20:00', CLOSE],
		['2026-10-02 20:00', CLOSE],
		['2026-10-02T20:00:30', CLOSE + 30_000]
	])('%j → instante', (value, ms) => {
		expect(parseSaleTime(value)).toBe(ms);
	});

	it('solo fecha: fin del día en Argentina para los cierres, principio para la apertura', () => {
		// 2/10 23:59:59.999 en Argentina = 3/10 02:59:59.999 UTC.
		expect(parseSaleTime('2026-10-02', { endOfDay: true })).toBe(
			Date.UTC(2026, 9, 3, 2, 59, 59, 999)
		);
		expect(parseSaleTime('2026-10-02')).toBe(Date.UTC(2026, 9, 2, 3, 0));
		// Un Date de medianoche UTC (como lo deja un lector de YAML) se toma como "solo fecha".
		expect(parseSaleTime(new Date(Date.UTC(2026, 9, 2)), { endOfDay: true })).toBe(
			Date.UTC(2026, 9, 3, 2, 59, 59, 999)
		);
		expect(parseSaleTime(new Date(CLOSE))).toBe(CLOSE);
	});

	it('vacío = null; inválido = error', () => {
		expect(parseSaleTime(undefined)).toBeNull();
		expect(parseSaleTime('')).toBeNull();
		for (const bad of [
			'mañana',
			'2026-13-01',
			'2026-02-30',
			'02/10/2026 20:00',
			'2026-10-02T25:00'
		])
			expect(() => parseSaleTime(bad)).toThrow();
	});
});

describe('textos en hora de Argentina', () => {
	it('formatSaleTime: "jueves 2/10 a las 20:00" sin importar la zona del servidor', () => {
		expect(formatSaleTime(CLOSE)).toBe('viernes 2/10 a las 20:00');
		// Medianoche: 00:00, no 24:00.
		expect(formatSaleTime(Date.UTC(2026, 9, 1, 3, 0))).toBe('jueves 1/10 a las 00:00');
		expect(toArgentinaLocalInput(CLOSE)).toBe('2026-10-02T20:00');
	});

	it('saleWindowText antes, durante y después', () => {
		const w = { opensAt: CLOSE - 86_400_000, closesAt: CLOSE };
		expect(saleWindowText(w, CLOSE - 86_400_001)).toBe('Abre el jueves 1/10 a las 20:00');
		expect(saleWindowText(w, CLOSE - 86_400_000)).toBe(
			'La venta cierra el viernes 2/10 a las 20:00'
		);
		expect(saleWindowText(w, CLOSE - 1)).toBe('La venta cierra el viernes 2/10 a las 20:00');
		expect(saleWindowText(w, CLOSE)).toBe('Venta cerrada');
		expect(saleWindowText({}, CLOSE)).toBeNull();
	});
});

const META = {
	title: 'Fiesta',
	start: '2026-10-03T21:00-03:00',
	status: 'abierto',
	tickets_open: '2026-09-25T12:00-03:00',
	tickets_close: '2026-10-02T20:00-03:00',
	tickets: [
		{ id: 'general', name: 'General', price: 10000, capacity: 40 },
		{ id: 'anticipada', name: 'Anticipada', price: 8000, capacity: 10, close: '2026-09-30' }
	]
};

describe('salesState y cierres por tipo (bordes)', () => {
	const c = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
		parseTicketConfig(META)
	);
	const opens = Date.UTC(2026, 8, 25, 15, 0); // 25/9 12:00 en Argentina
	const anticipadaCloses = Date.UTC(2026, 9, 1, 2, 59, 59, 999); // 30/9 23:59:59.999 AR

	it('lee los horarios', () => {
		expect(c.opensAt).toBe(opens);
		expect(c.closesAt).toBe(CLOSE);
		expect(c.types[1].closesAt).toBe(anticipadaCloses);
		expect(c.types[0].closesAt).toBeNull();
	});

	it('abre justo en tickets_open y cierra justo en tickets_close', () => {
		expect(salesState(c, opens - 1)).toEqual({ open: false, reason: 'notyet' });
		expect(salesState(c, opens)).toEqual({ open: true });
		expect(salesState(c, CLOSE - 1)).toEqual({ open: true });
		expect(salesState(c, CLOSE)).toEqual({ open: false, reason: 'closed' });
	});

	it('la anticipada cierra al terminar el 30/9 en Argentina; la general sigue', () => {
		expect(typeOpen(c, c.types[1], anticipadaCloses - 1)).toBe(true);
		expect(typeOpen(c, c.types[1], anticipadaCloses)).toBe(false);
		expect(typeOpen(c, c.types[0], anticipadaCloses + 1)).toBe(true);
		const buy = (/** @type {number} */ now) =>
			/** @type {any} */ (
				validatePurchase(c, {
					type: 'anticipada',
					quantity: '1',
					buyer: {
						name: 'Ale Prueba',
						pronouns: 'elle',
						email: 'ale@example.com',
						dni: '20111222'
					},
					holders: [{ name: 'Ale Prueba', pronouns: 'elle' }],
					accept: 'on',
					now
				})
			);
		expect(buy(anticipadaCloses - 1).ok).toBe(true);
		expect(buy(anticipadaCloses).errors.type).toMatch(/La venta de «Anticipada» ya cerró/);
	});

	it('si todos los tipos cerraron, la venta está cerrada', () => {
		const only = /** @type {any} */ (parseTicketConfig({ ...META, tickets: [META.tickets[1]] }));
		expect(salesState(only, anticipadaCloses + 1)).toEqual({ open: false, reason: 'closed' });
	});

	it('el cierre propio no puede estirar la venta más allá del evento', () => {
		const late = /** @type {any} */ (
			parseTicketConfig({
				...META,
				tickets: [{ ...META.tickets[1], close: '2026-10-10T20:00-03:00' }]
			})
		);
		expect(typeOpen(late, late.types[0], CLOSE)).toBe(false);
	});

	it('compatibilidad: tickets_close con fecha sola = hasta el fin de ese día', () => {
		const old = /** @type {any} */ (
			parseTicketConfig({ ...META, tickets_open: undefined, tickets_close: '2026-10-02' })
		);
		const endOfDay = Date.UTC(2026, 9, 3, 2, 59, 59, 999);
		expect(old.closesAt).toBe(endOfDay);
		expect(salesState(old, endOfDay - 1)).toEqual({ open: true });
		expect(salesState(old, endOfDay)).toEqual({ open: false, reason: 'closed' });
	});

	it('sin tickets_close, cierra al empezar el evento', () => {
		const c2 = /** @type {any} */ (
			parseTicketConfig({ ...META, tickets_open: undefined, tickets_close: undefined })
		);
		expect(c2.closesAt).toBe(Date.UTC(2026, 9, 4, 0, 0));
	});

	it('errores de configuración', () => {
		expect(() => parseTicketConfig({ ...META, tickets_open: 'pronto' })).toThrow(/tickets_open/);
		expect(() => parseTicketConfig({ ...META, tickets_close: '2026-10-02T99:00' })).toThrow(
			/tickets_close/
		);
		expect(() => parseTicketConfig({ ...META, tickets_open: '2026-10-03T00:00-03:00' })).toThrow(
			/abrir/
		);
		expect(() =>
			parseTicketConfig({ ...META, tickets: [{ ...META.tickets[0], close: 'ayer' }] })
		).toThrow(/close/);
	});
});

describe('una compra empezada antes del cierre se completa después', () => {
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

	it('el pago aprobado por Mercado Pago después del cierre emite las entradas', async () => {
		const reserved = /** @type {any} */ (
			await reserveOrder(t.db, {
				eventSlug: 'fiesta',
				type: { id: 'general', price: 10000, capacity: 40 },
				quantity: 1,
				holders: [{ name: 'Ale Prueba', pronouns: 'elle' }],
				buyer: { name: 'Ale Prueba', email: 'ale@example.com', dni: '20111222' },
				now: CLOSE - 60_000
			})
		);
		const r = await applyPayment(
			t.db,
			{
				id: 1,
				status: 'approved',
				external_reference: reserved.order.id,
				transaction_amount: 10000,
				currency_id: 'ARS'
			},
			{ now: CLOSE + 5 * 60_000, capacityOf: async () => 40 }
		);
		expect(r.newlyApproved).toBe(true);
		expect(r.tickets).toHaveLength(1);
		expect(r.order?.needs_review).toBeNull();
	});
});
