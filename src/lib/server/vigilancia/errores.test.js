/**
 * El conteo de errores 5xx (./errores.js), con el D1 de miniflare:
 *
 * - la ruta se guarda como patrón, sin grupos ni datos; las de compra se marcan;
 * - cuenta por tramo de 10 minutos, ruta y estado, con el último código;
 * - «la última hora» deja afuera lo viejo; los umbrales (10 en el sitio, 2 en compras);
 * - la limpieza borra lo de más de 7 días.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '../db/testing.js';
import {
	ERROR_ALERT_THRESHOLD,
	NO_ROUTE,
	PURCHASE_ALERT_THRESHOLD,
	alertKind,
	isPurchaseRoute,
	pruneErrorCounts,
	recentErrors,
	recordServerError,
	routeLabel
} from './errores.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
/** Un comienzo de tramo de 10 minutos. */
const T0 = Date.parse('2031-01-08T15:00:00Z');

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

describe('routeLabel e isPurchaseRoute', () => {
	it('el patrón de SvelteKit sin los grupos; sin ruta, «(sin ruta)»', () => {
		expect(routeLabel('/(content)/calendario/[event]/entradas')).toBe(
			'/calendario/[event]/entradas'
		);
		expect(routeLabel('/(content)')).toBe('/');
		expect(routeLabel('/(authed)/admin/eventos/[slug]')).toBe('/admin/eventos/[slug]');
		expect(routeLabel('/api/mercadopago/webhook')).toBe('/api/mercadopago/webhook');
		expect(routeLabel(null)).toBe(NO_ROUTE);
		expect(routeLabel(undefined)).toBe(NO_ROUTE);
		expect(routeLabel(`/${'x'.repeat(300)}`)).toHaveLength(200);
	});

	it('las rutas de compra: el webhook de MP, el formulario, la orden, la puerta y las propinas', () => {
		for (const route of [
			'/api/mercadopago/webhook',
			'/calendario/[event]/entradas',
			'/entradas/[order]/estado',
			'/entradas/[order]/confirmar',
			'/puerta/[slug]/compra',
			'/propinas',
			'/propinas/[id]/gracias'
		]) {
			expect(isPurchaseRoute(route), route).toBe(true);
		}
		for (const route of ['/calendario/[event]', '/', NO_ROUTE, '/entradasx', '/admin/ventas']) {
			expect(isPurchaseRoute(route), route).toBe(false);
		}
	});
});

describe('recordServerError y recentErrors', () => {
	it('suma por ruta y estado, con el último código y si es de compra', async () => {
		const webhook = '/api/mercadopago/webhook';
		await recordServerError(t.db, {
			now: T0 + MIN,
			route: webhook,
			status: 500,
			errorId: 'aaaa1111'
		});
		await recordServerError(t.db, { now: T0 + 2 * MIN, route: webhook, status: 500 });
		await recordServerError(t.db, {
			now: T0 + 15 * MIN,
			route: webhook,
			status: 500,
			errorId: 'bbbb2222'
		});
		await recordServerError(t.db, { now: T0 + 16 * MIN, route: webhook, status: 502 });
		await recordServerError(t.db, { now: T0 + 3 * MIN, route: '/calendario/[event]', status: 500 });
		// Un código raro no se guarda (solo minúsculas y números, como los de errorLog.js).
		await recordServerError(t.db, {
			now: T0 + 4 * MIN,
			route: '/calendario/[event]',
			status: 500,
			errorId: 'mail@ejemplo.test'
		});
		expect(await recentErrors(t.db, T0 + 20 * MIN)).toEqual({
			total: 6,
			purchase: 4,
			rows: [
				{ route: webhook, status: 500, hits: 3, purchase: true, lastErrorId: 'bbbb2222' },
				{ route: '/calendario/[event]', status: 500, hits: 2, purchase: false, lastErrorId: null },
				{ route: webhook, status: 502, hits: 1, purchase: true, lastErrorId: null }
			]
		});
	});

	it('la última hora: lo de hace más de una hora no cuenta', async () => {
		await recordServerError(t.db, { now: T0 - 61 * MIN, route: '/', status: 500 });
		await recordServerError(t.db, { now: T0 - 30 * MIN, route: '/', status: 500 });
		expect((await recentErrors(t.db, T0)).total).toBe(1);
	});

	it('pruneErrorCounts borra lo de más de 7 días', async () => {
		await recordServerError(t.db, { now: T0 - 8 * DAY, route: '/', status: 500 });
		await recordServerError(t.db, { now: T0 - 6 * DAY, route: '/', status: 500 });
		expect(await pruneErrorCounts(t.db, T0)).toBe(1);
		const left = await t.db.prepare('SELECT count(*) AS n FROM error_counts').first();
		expect(left?.n).toBe(1);
	});
});

describe('alertKind', () => {
	it('10 en todo el sitio, o 2 en las compras (las compras primero)', () => {
		expect(ERROR_ALERT_THRESHOLD).toBe(10);
		expect(PURCHASE_ALERT_THRESHOLD).toBe(2);
		expect(alertKind({ total: 9, purchase: 1 })).toBeNull();
		expect(alertKind({ total: 10, purchase: 0 })).toBe('site');
		expect(alertKind({ total: 2, purchase: 2 })).toBe('purchase');
		expect(alertKind({ total: 30, purchase: 5 })).toBe('purchase');
	});
});
