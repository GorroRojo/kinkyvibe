import { describe, expect, it } from 'vitest';
import {
	availabilityOf,
	chainCycle,
	currentTier,
	doorPrice,
	emptyTaken,
	stockOf,
	tierKey,
	tierOpen,
	unreachableAfter
} from './ticketTiers.js';

const NOW = Date.parse('2026-10-01T12:00:00-03:00');
const DAY = 24 * 60 * 60 * 1000;

/** @param {Partial<import('./ticketTiers.js').Tier>} o */
const tier = (o) => ({
	id: 't',
	name: 'T',
	price: 1000,
	fondo: 0,
	quantity: null,
	until: null,
	...o
});

/** 5 a $ 8.000, 10 a $ 9.000, 10 a $ 10.000 (sin cupo total). */
const BY_QUANTITY = {
	id: 'general',
	name: 'General',
	capacity: null,
	tiers: [
		tier({ id: 'p1', name: 'Preventa 1', price: 8000, quantity: 5 }),
		tier({ id: 'p2', name: 'Preventa 2', price: 9000, quantity: 10 }),
		tier({ id: 'p3', name: 'Preventa 3', price: 10000, quantity: 10 })
	]
};

/** Hasta mañana a $ 8.000, después $ 10.000. */
const BY_DATE = {
	id: 'general',
	name: 'General',
	capacity: 40,
	tiers: [
		tier({ id: 'early', name: 'Anticipada', price: 8000, until: NOW + DAY }),
		tier({ id: 'full', name: 'General', price: 10000 })
	]
};

/**
 * @param {Record<string, number>} [types]
 * @param {Record<string, number>} [tiers] por `tipo/tramo`
 */
function taken(types = {}, tiers = {}) {
	const t = emptyTaken();
	for (const [k, v] of Object.entries(types)) t.types.set(k, v);
	for (const [k, v] of Object.entries(tiers)) t.tiers.set(k, v);
	return t;
}

describe('tierOpen', () => {
	it('cierra justo al llegar a la cantidad (no antes) y justo en su fecha (no antes)', () => {
		const q = tier({ quantity: 5 });
		expect(tierOpen(q, 4, NOW)).toBe(true);
		expect(tierOpen(q, 5, NOW)).toBe(false);
		const d = tier({ until: NOW });
		expect(tierOpen(d, 0, NOW - 1)).toBe(true);
		expect(tierOpen(d, 0, NOW)).toBe(false);
		expect(tierOpen(tier({}), 1_000_000, NOW + 100 * DAY)).toBe(true);
	});
});

describe('currentTier: por cantidad', () => {
	it('arranca en el primero, con lo que queda', () => {
		const c = currentTier(BY_QUANTITY, taken(), NOW);
		expect(c).toMatchObject({ index: 0, taken: 0, remaining: 5 });
		expect(c?.tier.price).toBe(8000);
	});

	it('borde: con 4 vendidas queda 1 en Preventa 1; con 5 pasa a Preventa 2', () => {
		expect(currentTier(BY_QUANTITY, taken({}, { 'general/p1': 4 }), NOW)).toMatchObject({
			index: 0,
			remaining: 1
		});
		expect(currentTier(BY_QUANTITY, taken({}, { 'general/p1': 5 }), NOW)).toMatchObject({
			index: 1,
			remaining: 10
		});
	});

	it('se pasa de tramo en tramo y, sin ninguno vigente, no hay tramo (agotado)', () => {
		const t = taken({}, { 'general/p1': 5, 'general/p2': 10, 'general/p3': 9 });
		expect(currentTier(BY_QUANTITY, t, NOW)).toMatchObject({ index: 2, remaining: 1 });
		t.tiers.set('general/p3', 10);
		expect(currentTier(BY_QUANTITY, t, NOW)).toBeNull();
		expect(stockOf(BY_QUANTITY, t, NOW)).toBe(0);
	});

	it('si se libera un lugar de un tramo anterior (reserva vencida), vuelve a ese tramo', () => {
		const t = taken({}, { 'general/p1': 4, 'general/p2': 3 });
		expect(currentTier(BY_QUANTITY, t, NOW)?.tier.id).toBe('p1');
	});

	it('no mezcla tramos de otro tipo', () => {
		expect(currentTier(BY_QUANTITY, taken({}, { 'otro/p1': 5 }), NOW)?.tier.id).toBe('p1');
	});
});

describe('currentTier: por fecha', () => {
	it('antes de la fecha, la anticipada; desde la fecha exacta, la general', () => {
		expect(currentTier(BY_DATE, taken(), NOW + DAY - 1)?.tier.id).toBe('early');
		expect(currentTier(BY_DATE, taken(), NOW + DAY)?.tier.id).toBe('full');
	});

	it('cantidad y fecha juntas: lo que llegue primero', () => {
		const type = {
			id: 'x',
			name: 'X',
			capacity: null,
			tiers: [tier({ id: 'a', quantity: 3, until: NOW + DAY }), tier({ id: 'b' })]
		};
		expect(currentTier(type, taken({}, { 'x/a': 3 }), NOW)?.tier.id).toBe('b');
		expect(currentTier(type, taken({}, { 'x/a': 1 }), NOW + DAY)?.tier.id).toBe('b');
		expect(currentTier(type, taken({}, { 'x/a': 1 }), NOW)?.tier.id).toBe('a');
	});
});

describe('stockOf (cupo opcional + tramo)', () => {
	it('sin cupo y sin tramos: sin límite (null)', () => {
		expect(stockOf({ id: 'g', name: 'G', capacity: null }, taken({ g: 10_000 }), NOW)).toBeNull();
	});

	it('con cupo: lo que queda del cupo', () => {
		expect(stockOf({ id: 'g', name: 'G', capacity: 10 }, taken({ g: 7 }), NOW)).toBe(3);
		expect(stockOf({ id: 'g', name: 'G', capacity: 10 }, taken({ g: 12 }), NOW)).toBe(0);
	});

	it('con tramos: el menor entre el cupo y lo que queda del tramo', () => {
		// Tramo con 5 y cupo total 40 con 38 tomadas: quedan 2.
		const capped = { ...BY_QUANTITY, capacity: 40 };
		expect(stockOf(capped, taken({ general: 38 }, { 'general/p1': 0 }), NOW)).toBe(2);
		// Cupo holgado: manda el tramo.
		expect(stockOf(capped, taken({ general: 3 }, { 'general/p1': 3 }), NOW)).toBe(2);
		// Último tramo sin cantidad y sin cupo: sin límite.
		expect(stockOf(BY_DATE, taken(), NOW + 2 * DAY)).toBe(40);
		expect(stockOf({ ...BY_DATE, capacity: null }, taken(), NOW + 2 * DAY)).toBeNull();
	});
});

describe('availabilityOf: tipos encadenados', () => {
	const general = { id: 'general', name: 'General', capacity: 10 };
	const ultima = { id: 'ultima', name: 'Última tanda', capacity: 5, after: 'general' };
	const types = [general, ultima];
	const neverClosed = () => false;

	it('espera mientras el anterior se vende', () => {
		const a = availabilityOf(types, ultima, taken({ general: 9 }), NOW, neverClosed);
		expect(a).toMatchObject({ state: 'waiting', remaining: 0 });
		expect(a.waitingFor?.id).toBe('general');
	});

	it('se habilita cuando el anterior se agota', () => {
		const a = availabilityOf(types, ultima, taken({ general: 10 }), NOW, neverClosed);
		expect(a).toMatchObject({ state: 'open', remaining: 5, waitingFor: null });
	});

	it('se habilita cuando el anterior cierra (aunque le queden)', () => {
		const a = availabilityOf(types, ultima, taken(), NOW, (t) => t.id === 'general');
		expect(a.state).toBe('open');
	});

	it('se habilita cuando al anterior se le terminan los tramos', () => {
		const prev = { ...BY_QUANTITY, id: 'general' };
		const t = taken({}, { 'general/p1': 5, 'general/p2': 10, 'general/p3': 10 });
		expect(availabilityOf([prev, ultima], ultima, t, NOW, neverClosed).state).toBe('open');
		t.tiers.set('general/p3', 9);
		expect(availabilityOf([prev, ultima], ultima, t, NOW, neverClosed).state).toBe('waiting');
	});

	it('cerrado por horario gana; agotado si no queda', () => {
		expect(availabilityOf(types, general, taken(), NOW, () => true).state).toBe('closed');
		expect(availabilityOf(types, general, taken({ general: 10 }), NOW, neverClosed).state).toBe(
			'soldout'
		);
	});

	it('devuelve el tramo vigente para mostrar el precio', () => {
		const a = availabilityOf([BY_QUANTITY], BY_QUANTITY, taken(), NOW, neverClosed);
		expect(a.tier?.tier.name).toBe('Preventa 1');
	});
});

describe('validaciones de la forma', () => {
	it('unreachableAfter: un tramo sin cantidad ni fecha que no es el último', () => {
		expect(
			unreachableAfter([
				{ quantity: 5, until: null },
				{ quantity: null, until: null }
			])
		).toBe(-1);
		expect(
			unreachableAfter([
				{ quantity: null, until: null },
				{ quantity: 5, until: null }
			])
		).toBe(0);
		expect(
			unreachableAfter([
				{ quantity: null, until: NOW },
				{ quantity: null, until: null }
			])
		).toBe(-1);
	});

	it('chainCycle: detecta círculos, también largos', () => {
		expect(chainCycle([{ id: 'a' }, { id: 'b', after: 'a' }])).toBeNull();
		expect(
			chainCycle([
				{ id: 'a', after: 'b' },
				{ id: 'b', after: 'a' }
			])
		).not.toBeNull();
		expect(
			chainCycle([
				{ id: 'a', after: 'c' },
				{ id: 'b', after: 'a' },
				{ id: 'c', after: 'b' }
			])
		).not.toBeNull();
	});

	it('tierKey', () => {
		expect(tierKey('general', 'p1')).toBe('general/p1');
	});
});

describe('doorPrice: puerta y carga a mano (por tipo)', () => {
	const fixed = { price: 10000, fondo: 2000 };
	const tiered = {
		price: 10000,
		fondo: 2000,
		tiers: [
			{ price: 8000, fondo: 1600 },
			{ price: 9000, fondo: 1800 },
			{ price: 10000, fondo: 2000 }
		]
	};

	it('sin tramos ni door_price: el precio fijo del tipo', () => {
		expect(doorPrice(fixed)).toEqual({ price: 10000, fondo: 2000, source: 'type' });
		expect(doorPrice({ ...fixed, door: null })).toMatchObject({ price: 10000, source: 'type' });
	});

	it('con tramos y sin door_price: el del último tramo (no el vigente)', () => {
		expect(doorPrice({ ...tiered, price: 1 })).toEqual({
			price: 10000,
			fondo: 2000,
			source: 'tier'
		});
	});

	it('con door_price: ese, con o sin tramos', () => {
		const door = { price: 12000, fondo: 2400 };
		expect(doorPrice({ ...tiered, door })).toEqual({ price: 12000, fondo: 2400, source: 'door' });
		expect(doorPrice({ ...fixed, door })).toEqual({ price: 12000, fondo: 2400, source: 'door' });
		// Una entrada sin cargo en la puerta también es un precio.
		expect(doorPrice({ ...fixed, door: { price: 0, fondo: 0 } })).toMatchObject({
			price: 0,
			source: 'door'
		});
	});

	it('dos tipos del mismo evento, cada uno con su precio en la puerta', () => {
		const general = { ...tiered, door: { price: 12000, fondo: 0 } };
		const pareja = { price: 18000, fondo: 0, door: { price: 20000, fondo: 0 } };
		const sinPuerta = { price: 7000, fondo: 0 };
		expect([general, pareja, sinPuerta].map((t) => doorPrice(t)?.price)).toEqual([
			12000, 20000, 7000
		]);
	});

	it('a la gorra: null (el monto lo elige quien paga)', () => {
		expect(doorPrice({ price: 0, gorra: { min: 0, suggested: 5000 } })).toBeNull();
	});
});
