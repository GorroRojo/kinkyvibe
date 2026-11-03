/**
 * La cotización del dólar MEP (src/lib/server/paypal/rates.js): días de Argentina, validación de
 * lo que devuelven las APIs, la corrida diaria (idempotente, rellena los días que faltan, nunca
 * pisa un dato bueno) y la cotización de un día. D1 de miniflare; las APIs, simuladas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	BACKFILL_DAYS,
	DOLARAPI_URL,
	addDays,
	arDay,
	fetchJson,
	historyUrl,
	isStale,
	isValidDay,
	parseHistoryQuote,
	parseLiveQuote,
	parseRate,
	rateForDay,
	runMepRates,
	storeRate
} from './rates.js';
import { RATES_CRON, handleScheduled, runRates } from '../scheduled.js';

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

// Lunes 2/11/2026 a las 18:15 de Argentina.
const NOW = Date.parse('2026-11-02T21:15:00Z');

/**
 * Un fetch simulado: `routes` es URL → JSON (o un número = estado HTTP, o `throw`).
 * @param {Record<string, unknown>} routes
 */
function fakeFetch(routes) {
	const calls = /** @type {string[]} */ ([]);
	const fn = /** @type {typeof fetch} */ (
		/** @type {unknown} */ (
			async (/** @type {string} */ url) => {
				calls.push(url);
				const r = routes[url];
				if (r === undefined) return new Response('{"error":"Not found"}', { status: 404 });
				if (r === 'throw') throw new TypeError('red caída');
				if (typeof r === 'number') return new Response('', { status: r });
				return Response.json(r);
			}
		)
	);
	return { fn, calls };
}

/** @param {string} day @param {number} compra */
const history = (day, compra) => ({ casa: 'bolsa', compra, venta: compra + 10, fecha: day });
const live = (compra = 1567.4, fecha = '2026-11-02T18:58:00.000Z') => ({
	moneda: 'USD',
	casa: 'bolsa',
	nombre: 'Bolsa',
	compra,
	venta: compra + 3,
	fechaActualizacion: fecha
});

async function allRates() {
	const { results } = await t.db.prepare('SELECT * FROM mep_rates ORDER BY day').all();
	return results;
}

describe('días', () => {
	it('arDay: el día de Argentina (UTC−3)', () => {
		expect(arDay(Date.parse('2026-11-02T02:59:59Z'))).toBe('2026-11-01');
		expect(arDay(Date.parse('2026-11-02T03:00:00Z'))).toBe('2026-11-02');
	});

	it('isValidDay, addDays', () => {
		expect(isValidDay('2026-11-02')).toBe(true);
		expect(isValidDay('2028-02-29')).toBe(true);
		for (const v of ['2026-02-30', '2026-13-01', '2026-1-01', '02-11-2026', '', null, 20261102]) {
			expect(isValidDay(v), String(v)).toBe(false);
		}
		expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	});

	it('isStale: más de un día entre el dato y el día pedido', () => {
		expect(isStale('2026-11-02', '2026-11-02')).toBe(false);
		expect(isStale('2026-11-01', '2026-11-02')).toBe(false);
		expect(isStale('2026-10-31', '2026-11-02')).toBe(true);
	});
});

describe('validación de lo que devuelven las APIs', () => {
	it('parseRate: finito, > 0 y < tope, con 2 decimales', () => {
		expect(parseRate(1567.4)).toBe(1567.4);
		expect(parseRate(1567.456)).toBe(1567.46);
		for (const v of [0, -1, NaN, Infinity, '1567', null, undefined, 10_000_000]) {
			expect(parseRate(v), String(v)).toBeNull();
		}
	});

	it('parseLiveQuote', () => {
		expect(parseLiveQuote(live())).toEqual({
			compra: 1567.4,
			venta: 1570.4,
			updatedAt: Date.parse('2026-11-02T18:58:00.000Z')
		});
		expect(parseLiveQuote(null)).toBeNull();
		expect(parseLiveQuote('texto')).toBeNull();
		expect(parseLiveQuote({ ...live(), compra: 0 })).toBeNull();
		expect(parseLiveQuote({ ...live(), venta: 'mucho' })).toBeNull();
		expect(parseLiveQuote({ ...live(), fechaActualizacion: 'ayer' })).toBeNull();
		expect(parseLiveQuote({ compra: 1, venta: 1 })).toBeNull();
	});

	it('parseHistoryQuote: también la fecha tiene que ser el día pedido', () => {
		expect(parseHistoryQuote(history('2026-10-31', 1565.4), '2026-10-31')).toEqual({
			compra: 1565.4,
			venta: 1575.4
		});
		expect(parseHistoryQuote(history('2026-10-30', 1565.4), '2026-10-31')).toBeNull();
		expect(parseHistoryQuote({ error: 'Not found' }, '2026-10-31')).toBeNull();
		expect(parseHistoryQuote(history('2026-10-31', -3), '2026-10-31')).toBeNull();
	});

	it('historyUrl', () => {
		expect(historyUrl('2026-10-31')).toBe(
			'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa/2026/10/31'
		);
	});

	it('fetchJson: null con error de red, estado malo, JSON roto o si tarda demasiado', async () => {
		expect(await fetchJson(fakeFetch({ a: 'throw' }).fn, 'a')).toBeNull();
		expect(await fetchJson(fakeFetch({ a: 500 }).fn, 'a')).toBeNull();
		const broken = /** @type {typeof fetch} */ (
			/** @type {unknown} */ (async () => new Response('{no', { status: 200 }))
		);
		expect(await fetchJson(broken, 'a')).toBeNull();
		// Uno que no contesta hasta que lo cortan.
		const hanging = /** @type {typeof fetch} */ (
			/** @type {unknown} */ (
				(/** @type {string} */ _url, /** @type {RequestInit} */ init) =>
					new Promise((_resolve, reject) => {
						init.signal?.addEventListener('abort', () => reject(new Error('abortado')));
					})
			)
		);
		expect(await fetchJson(hanging, 'a', 20)).toBeNull();
		expect(await fetchJson(fakeFetch({ a: { ok: 1 } }).fn, 'a')).toEqual({ ok: 1 });
	});
});

describe('runMepRates', () => {
	/** Todas las APIs andando: hoy de DolarApi y los 10 días anteriores de ArgentinaDatos. */
	function allGood() {
		/** @type {Record<string, unknown>} */
		const routes = { [DOLARAPI_URL]: live() };
		for (let i = 1; i <= BACKFILL_DAYS; i++) {
			const day = addDays('2026-11-02', -i);
			routes[historyUrl(day)] = history(day, 1500 + i);
		}
		return routes;
	}

	it('guarda hoy desde DolarApi y rellena los días que faltan desde ArgentinaDatos', async () => {
		const { fn } = fakeFetch(allGood());
		const r = await runMepRates({ db: t.db, fetch: fn, now: NOW });
		expect(r.today).toBe('2026-11-02');
		expect(r.todayResult).toBe('stored');
		expect(r.backfilled).toHaveLength(BACKFILL_DAYS);
		expect(r.missing).toEqual([]);
		const rows = await allRates();
		expect(rows).toHaveLength(BACKFILL_DAYS + 1);
		expect(rows.at(-1)).toMatchObject({
			day: '2026-11-02',
			compra: 1567.4,
			venta: 1570.4,
			source: 'dolarapi',
			fetched_at: NOW
		});
		expect(rows.at(-2)).toMatchObject({
			day: '2026-11-01',
			compra: 1501,
			source: 'argentinadatos'
		});
	});

	it('idempotente: la segunda corrida no pide nada ni cambia nada', async () => {
		await runMepRates({ db: t.db, fetch: fakeFetch(allGood()).fn, now: NOW });
		const before = await allRates();
		// Otra corrida el mismo día, con otros números: no pisa.
		const changed = fakeFetch({ [DOLARAPI_URL]: live(9999) });
		const r = await runMepRates({ db: t.db, fetch: changed.fn, now: NOW + 60_000 });
		expect(r).toMatchObject({ todayResult: 'exists', backfilled: [], missing: [] });
		expect(changed.calls).toEqual([]);
		expect(await allRates()).toEqual(before);
	});

	it('solo pide los días que faltan', async () => {
		await storeRate(t.db, {
			day: '2026-11-01',
			compra: 1555,
			venta: 1560,
			source: 'dolarapi',
			fetchedAt: 1
		});
		const { fn, calls } = fakeFetch(allGood());
		const r = await runMepRates({ db: t.db, fetch: fn, now: NOW });
		expect(r.backfilled).not.toContain('2026-11-01');
		expect(calls).not.toContain(historyUrl('2026-11-01'));
		expect(await rateForDay(t.db, '2026-11-01')).toMatchObject({
			compra: 1555,
			source: 'dolarapi'
		});
	});

	it('si DolarApi falla o manda basura: no guarda nada para hoy y queda lo último', async () => {
		await storeRate(t.db, {
			day: '2026-11-01',
			compra: 1555,
			venta: 1560,
			source: 'dolarapi',
			fetchedAt: 1
		});
		for (const bad of [
			'throw',
			503,
			{ compra: 0, venta: 1, fechaActualizacion: '2026-11-02' },
			{ compra: 'x' }
		]) {
			const r = await runMepRates({
				db: t.db,
				fetch: fakeFetch({ [DOLARAPI_URL]: bad }).fn,
				now: NOW,
				backfillDays: 1
			});
			expect(r.todayResult, JSON.stringify(bad)).toBe('failed');
		}
		expect(await rateForDay(t.db, '2026-11-02')).toMatchObject({ day: '2026-11-01', compra: 1555 });
	});

	it('un dato de DolarApi de hace más de 5 días no se guarda como el de hoy', async () => {
		const old = fakeFetch({ [DOLARAPI_URL]: live(1400, '2026-10-20T18:00:00.000Z') });
		const r = await runMepRates({ db: t.db, fetch: old.fn, now: NOW, backfillDays: 0 });
		expect(r.todayResult).toBe('failed');
		expect(await allRates()).toEqual([]);
		// El del viernes, un lunes antes del cierre, sí (fin de semana largo).
		const friday = fakeFetch({ [DOLARAPI_URL]: live(1400, '2026-10-30T20:00:00.000Z') });
		expect(
			(await runMepRates({ db: t.db, fetch: friday.fn, now: NOW, backfillDays: 0 })).todayResult
		).toBe('stored');
	});

	it('los días que ArgentinaDatos no tiene (o devuelve mal) quedan en `missing`', async () => {
		const routes = allGood();
		delete routes[historyUrl('2026-10-30')];
		routes[historyUrl('2026-10-29')] = history('2026-10-28', 1500); // otra fecha: no sirve
		const r = await runMepRates({ db: t.db, fetch: fakeFetch(routes).fn, now: NOW });
		expect(r.missing.sort()).toEqual(['2026-10-29', '2026-10-30']);
		expect(await rateForDay(t.db, '2026-10-30')).toMatchObject({ day: '2026-10-28' });
	});
});

describe('rateForDay', () => {
	it('el día pedido o el último guardado antes; sin ninguno, null', async () => {
		expect(await rateForDay(t.db, '2026-11-02')).toBeNull();
		await storeRate(t.db, {
			day: '2026-10-30',
			compra: 1557.8,
			venta: 1568.8,
			source: 'argentinadatos',
			fetchedAt: 5
		});
		await storeRate(t.db, {
			day: '2026-11-02',
			compra: 1567.4,
			venta: 1570.1,
			source: 'dolarapi',
			fetchedAt: 6
		});
		expect(await rateForDay(t.db, '2026-11-02')).toEqual({
			day: '2026-11-02',
			compra: 1567.4,
			venta: 1570.1,
			source: 'dolarapi',
			fetchedAt: 6
		});
		expect(await rateForDay(t.db, '2026-11-01')).toMatchObject({ day: '2026-10-30' });
		expect(await rateForDay(t.db, '2027-01-01')).toMatchObject({ day: '2026-11-02' });
		expect(await rateForDay(t.db, '2026-10-29')).toBeNull();
	});
});

describe('el cron', () => {
	it('RATES_CRON llama a runRates; falla si no pudo traer la de hoy', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const ok = await runRates(
			{ DB: t.db },
			new Date(NOW),
			fakeFetch({ [DOLARAPI_URL]: live() }).fn
		);
		expect(ok.todayResult).toBe('stored');
		await resetDB(t.db);
		await expect(runRates({ DB: t.db }, new Date(NOW), fakeFetch({}).fn)).rejects.toThrow(
			/cotización: hoy \(2026-11-02\) failed/
		);
		await expect(runRates({}, new Date(NOW))).rejects.toThrow(/falta el binding DB/);
		// handleScheduled conoce el cron (sin base: el error de runRates, no «cron desconocido»).
		const ctx = /** @type {any} */ ({ waitUntil() {}, passThroughOnException() {} });
		await expect(
			handleScheduled({ cron: RATES_CRON, scheduledTime: NOW }, {}, ctx, /** @type {any} */ (null))
		).rejects.toThrow(/falta el binding DB/);
		log.mockRestore();
	});
});
