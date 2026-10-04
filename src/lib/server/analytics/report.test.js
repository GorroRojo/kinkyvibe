/**
 * Visitas para el panel y resumen mensual en D1, con una API de Analytics Engine falsa y datos
 * inventados (eventos «fiesta-rara» y «taller-falso»).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '../db/testing.js';
import { analyticsConfig, clearSqlCache, runSql } from './sql.js';
import {
	argentineDay,
	buildFunnel,
	dailySql,
	loadVisits,
	monthKey,
	monthLabel,
	monthStart,
	readMonthly,
	runAnalyticsRollup,
	saveMonth
} from './report.js';

const ACCOUNT = 'f'.repeat(32);
const TOKEN = 'token-falso-de-prueba';
const env = { CF_ACCOUNT_ID: ACCOUNT, CF_ANALYTICS_TOKEN: TOKEN };

/**
 * API falsa: contesta según la consulta.
 * @param {(sql: string) => Record<string, unknown>[]} answer
 */
function fakeApi(answer) {
	/** @type {{ url: string, sql: string, auth: string }[]} */
	const calls = [];
	const fetchFn = vi.fn(async (/** @type {any} */ url, /** @type {any} */ init) => {
		const sql = String(init.body);
		calls.push({ url: String(url), sql, auth: init.headers.authorization });
		return Response.json({ meta: [], data: answer(sql), rows: 0 });
	});
	return { calls, fetch: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchFn)) };
}

/** Respuestas inventadas para cada consulta. @param {string} sql */
function sample(sql) {
	if (sql.includes('toStartOfInterval')) {
		return [
			{ day: '2026-09-02 00:00:00', n: '12' },
			{ day: '2026-10-03 00:00:00', n: 30 }
		];
	}
	if (sql.includes('blob6 AS slug')) {
		return [
			{ slug: 'fiesta-rara', step: 'evento', method: '', n: '100' },
			{ slug: 'fiesta-rara', step: 'abrio', method: '', n: 40 },
			{ slug: 'fiesta-rara', step: 'datos', method: '', n: 25 },
			{ slug: 'fiesta-rara', step: 'pagar', method: '', n: 20 },
			{ slug: 'fiesta-rara', step: 'orden', method: 'mercadopago', n: 9 },
			{ slug: 'fiesta-rara', step: 'orden', method: 'transferencia', n: 3 },
			{ slug: 'fiesta-rara', step: 'aprobada', method: 'mercadopago', n: 8 },
			// Un aviso con un slug inventado, sin visitas: no aparece.
			{ slug: 'no-existe', step: 'datos', method: '', n: 1 }
		];
	}
	if (sql.includes('blob2 AS k'))
		return [
			{ k: '/calendario/fiesta-rara', n: 100 },
			{ k: '/', n: 50 }
		];
	if (sql.includes('blob3 AS k'))
		return [
			{ k: '', n: 90 },
			{ k: 'instagram.com', n: 60 }
		];
	if (sql.includes('blob4 AS k'))
		return [
			{ k: 'AR', n: 140 },
			{ k: 'UY', n: 10 }
		];
	if (sql.includes('blob5 AS k'))
		return [
			{ k: 'phone', n: 120 },
			{ k: 'desktop', n: 30 }
		];
	if (sql.includes('SELECT SUM(_sample_interval) AS n')) return [{ n: '150' }];
	return [];
}

beforeEach(() => clearSqlCache());

describe('analyticsConfig', () => {
	it('dice exactamente qué falta', () => {
		const none = analyticsConfig({});
		expect(none.ok).toBe(false);
		expect(!none.ok && none.missing.map((m) => [m.name, m.kind])).toEqual([
			['CF_ACCOUNT_ID', 'Text'],
			['CF_ANALYTICS_TOKEN', 'Secret']
		]);
		const bad = analyticsConfig({ CF_ACCOUNT_ID: 'no-es-un-id', CF_ANALYTICS_TOKEN: TOKEN });
		expect(!bad.ok && bad.missing.map((m) => m.name)).toEqual(['CF_ACCOUNT_ID']);
		expect(analyticsConfig(env)).toEqual({ ok: true, accountId: ACCOUNT, token: TOKEN });
	});
});

describe('runSql', () => {
	it('POST a la API de SQL con el token, FORMAT JSON y caché de unos minutos', async () => {
		const api = fakeApi(() => [{ n: 1 }]);
		const config = { accountId: ACCOUNT, token: TOKEN };
		await runSql(config, 'SELECT 1', { fetch: api.fetch, now: 0 });
		await runSql(config, 'SELECT 1', { fetch: api.fetch, now: 60_000 });
		expect(api.calls).toHaveLength(1);
		expect(api.calls[0].url).toBe(
			`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`
		);
		expect(api.calls[0].auth).toBe(`Bearer ${TOKEN}`);
		expect(api.calls[0].sql).toMatch(/FORMAT JSON$/);
		await runSql(config, 'SELECT 1', { fetch: api.fetch, now: 6 * 60_000 });
		expect(api.calls).toHaveLength(2);
	});
});

describe('loadVisits', () => {
	it('sin configurar: «falta configurar» con lo que falta, sin llamar a Cloudflare', async () => {
		const api = fakeApi(sample);
		const v = await loadVisits({
			env: {},
			db: null,
			fetch: api.fetch,
			now: new Date('2026-10-04T12:00:00Z')
		});
		expect(api.calls).toHaveLength(0);
		expect(v.configured).toBe(false);
		expect(v.missing.map((m) => m.name)).toEqual(['CF_ACCOUNT_ID', 'CF_ANALYTICS_TOKEN']);
		expect(v.daily).toEqual([]);
		expect(v.funnel).toEqual([]);
	});

	it('configurado: días completos, rankings, embudo por evento con títulos', async () => {
		const api = fakeApi(sample);
		const v = await loadVisits({
			env,
			db: null,
			fetch: api.fetch,
			now: new Date('2026-10-04T12:00:00Z'),
			titleOf: async (slugs) => new Map(slugs.map((s) => [s, `Título de ${s}`]))
		});
		expect(v.error).toBeNull();
		expect(v.liveFrom).toBe('2026-09-01');
		// Del 1/9 al 4/10, con ceros donde no hubo visitas.
		expect(v.daily).toHaveLength(34);
		expect(v.daily[1]).toEqual({ day: '2026-09-02', label: '2/9', views: 12 });
		expect(v.daily[0].views).toBe(0);
		expect(v.months).toEqual([
			{ month: '2026-09', label: 'sep 2026', views: 12, saved: false },
			{ month: '2026-10', label: 'oct 2026', views: 30, saved: false }
		]);
		expect(v.sources[0]).toEqual({ key: '', n: 90 });
		expect(v.totals).toEqual({ views: 150, phoneShare: 0.8, countries: 2 });
		expect(v.funnel).toEqual([
			{
				slug: 'fiesta-rara',
				title: 'Título de fiesta-rara',
				evento: 100,
				abrio: 40,
				datos: 25,
				pagar: 20,
				orden: 12,
				aprobada: 8,
				rate: 0.08
			}
		]);
		// Las consultas en vivo arrancan el primer día del mes anterior, a la medianoche de
		// Argentina (03:00 UTC).
		expect(api.calls.some((c) => c.sql.includes("toDateTime('2026-09-01 03:00:00')"))).toBe(true);
	});

	it('si Cloudflare rechaza el token, lo dice (y no tira)', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetchFn = /** @type {typeof fetch} */ (
			/** @type {unknown} */ (async () => new Response('no', { status: 403 }))
		);
		const v = await loadVisits({ env, db: null, fetch: fetchFn });
		expect(v.configured).toBe(true);
		expect(v.error).toMatch(/CF_ANALYTICS_TOKEN/);
		spy.mockRestore();
	});
});

describe('resumen mensual en D1', () => {
	it('el cron guarda el mes anterior y el actual; el panel lee los viejos de D1', async () => {
		const { db, dispose } = await createTestDB();
		try {
			const api = fakeApi(sample);
			const log = vi.spyOn(console, 'log').mockImplementation(() => {});
			const result = await runAnalyticsRollup(
				{ ...env, DB: db },
				{ now: new Date('2026-10-04T06:00:00Z'), fetch: api.fetch }
			);
			log.mockRestore();
			expect(result).toEqual({ months: ['2026-09', '2026-10'] });
			// Las consultas del mes van con los dos bordes: medianoche de Argentina (03:00 UTC).
			expect(
				api.calls.some(
					(c) =>
						c.sql.includes("timestamp >= toDateTime('2026-09-01 03:00:00')") &&
						c.sql.includes("timestamp < toDateTime('2026-10-01 03:00:00')")
				)
			).toBe(true);
			const rows = await readMonthly(db, '2026-11');
			const sept = rows.filter((r) => r.month === '2026-09');
			expect(sept.find((r) => r.dimension === 'total')?.value).toBe(150);
			expect(sept.filter((r) => r.dimension === 'page').map((r) => r.key)).toEqual(
				expect.arrayContaining(['/calendario/fiesta-rara', '/'])
			);
			expect(sept.find((r) => r.key === 'fiesta-rara|orden|mercadopago')?.value).toBe(9);
			// Nada que identifique a alguien: solo rutas, dominios, países, dispositivos y eventos.
			expect(JSON.stringify(rows)).not.toMatch(/@|token|cookie|\d+\.\d+\.\d+\.\d+/i);

			// Volver a correr reemplaza (no duplica) y borra lo que ya no está.
			await saveMonth(
				db,
				'2026-09',
				[{ month: '2026-09', dimension: 'total', key: '', value: 7 }],
				1
			);
			const again = (await readMonthly(db, '2026-10')).filter((r) => r.month === '2026-09');
			expect(again).toEqual([{ month: '2026-09', dimension: 'total', key: '', value: 7 }]);
		} finally {
			await dispose();
		}
	});

	it('el panel junta los meses de D1 (viejos) con los de Analytics Engine (en vivo)', async () => {
		const { db, dispose } = await createTestDB();
		try {
			await saveMonth(
				db,
				'2026-06',
				[
					{ month: '2026-06', dimension: 'total', key: '', value: 500 },
					{ month: '2026-06', dimension: 'funnel', key: 'taller-falso|evento|', value: 80 },
					{ month: '2026-06', dimension: 'funnel', key: 'taller-falso|aprobada|gratis', value: 4 }
				],
				1
			);
			// Agosto está en D1 pero también en vivo: como arranca el 1/9, agosto sale de D1.
			await saveMonth(
				db,
				'2026-08',
				[{ month: '2026-08', dimension: 'total', key: '', value: 70 }],
				1
			);
			// Septiembre está en D1 pero ya es «en vivo»: no se suma dos veces.
			await saveMonth(
				db,
				'2026-09',
				[{ month: '2026-09', dimension: 'total', key: '', value: 999 }],
				1
			);
			const api = fakeApi(sample);
			const v = await loadVisits({
				env,
				db,
				fetch: api.fetch,
				now: new Date('2026-10-04T12:00:00Z')
			});
			expect(v.months.map((m) => [m.month, m.views, m.saved])).toEqual([
				['2026-06', 500, true],
				['2026-08', 70, true],
				['2026-09', 12, false],
				['2026-10', 30, false]
			]);
			expect(v.funnel.map((f) => f.slug)).toEqual(['fiesta-rara', 'taller-falso']);
			expect(v.funnel[1]).toMatchObject({ evento: 80, aprobada: 4, rate: 0.05 });

			// Sin token: igual muestra la historia guardada.
			const offline = await loadVisits({ env: {}, db, now: new Date('2026-10-04T12:00:00Z') });
			expect(offline.configured).toBe(false);
			expect(offline.months.map((m) => m.month)).toEqual(['2026-06', '2026-08', '2026-09']);
		} finally {
			await dispose();
		}
	});

	it('sin token o sin base, el cron no hace nada y no tira', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await runAnalyticsRollup({})).toBeNull();
		expect(await runAnalyticsRollup(env)).toBeNull();
		const failing = /** @type {typeof fetch} */ (
			/** @type {unknown} */ (async () => new Response('caído', { status: 500 }))
		);
		expect(
			await runAnalyticsRollup({ ...env, DB: /** @type {any} */ ({}) }, { fetch: failing })
		).toBeNull();
		log.mockRestore();
		err.mockRestore();
	});
});

describe('días y meses de Argentina (UTC−3)', () => {
	it('una visita a la 01:00 UTC es del día (y del mes) anterior en Argentina', () => {
		const late = new Date('2026-10-01T01:00:00Z'); // 30/9, 22:00 en Argentina
		expect(argentineDay(late)).toBe('2026-09-30');
		expect(monthKey(late)).toBe('2026-09');
		expect(argentineDay(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10-01');
		// El mes de Argentina arranca a las 03:00 UTC del día 1.
		expect(monthStart(late).toISOString()).toBe('2026-09-01T03:00:00.000Z');
		expect(monthStart(late, 1).toISOString()).toBe('2026-10-01T03:00:00.000Z');
		expect(monthStart(new Date('2026-01-15T12:00:00Z'), -1).toISOString()).toBe(
			'2025-12-01T03:00:00.000Z'
		);
	});

	it('la consulta por día agrupa con la hora corrida 3 horas (sin depender del huso de la API)', async () => {
		const sql = dailySql(new Date('2026-09-01T03:00:00Z'));
		expect(sql).toContain("toStartOfInterval(timestamp - INTERVAL '3' HOUR, INTERVAL '1' DAY)");
		// Una API falsa que guarda visitas con su hora UTC y agrupa como dice la consulta.
		const visits = ['2026-10-01T01:00:00Z', '2026-10-01T02:59:00Z', '2026-10-01T03:00:00Z'];
		const api = fakeApi((q) => {
			if (!q.includes('toStartOfInterval')) return [];
			const shift = /timestamp - INTERVAL '(\d+)' HOUR/.exec(q);
			const hours = shift ? Number(shift[1]) : 0;
			/** @type {Map<string, number>} */
			const byDay = new Map();
			for (const v of visits) {
				const day = new Date(Date.parse(v) - hours * 3_600_000).toISOString().slice(0, 10);
				byDay.set(day, (byDay.get(day) ?? 0) + 1);
			}
			return [...byDay].map(([day, n]) => ({ day: `${day} 00:00:00`, n }));
		});
		const v = await loadVisits({
			env,
			db: null,
			fetch: api.fetch,
			now: new Date('2026-10-01T12:00:00Z')
		});
		const views = Object.fromEntries(v.daily.map((d) => [d.day, d.views]));
		expect(views['2026-09-30']).toBe(2);
		expect(views['2026-10-01']).toBe(1);
		expect(v.months.map((m) => [m.month, m.views])).toEqual([
			['2026-09', 2],
			['2026-10', 1]
		]);
	});

	it('el cron de la noche del 30/9 en Argentina (01:00 UTC del 1/10) resume agosto y septiembre', async () => {
		const { db, dispose } = await createTestDB();
		try {
			const api = fakeApi(sample);
			const log = vi.spyOn(console, 'log').mockImplementation(() => {});
			const result = await runAnalyticsRollup(
				{ ...env, DB: db },
				{ now: new Date('2026-10-01T01:00:00Z'), fetch: api.fetch }
			);
			log.mockRestore();
			expect(result).toEqual({ months: ['2026-08', '2026-09'] });
		} finally {
			await dispose();
		}
	});
});

describe('buildFunnel y monthLabel', () => {
	it('suma por evento y paso, ignora pasos desconocidos', () => {
		const rows = buildFunnel(
			[
				{ slug: 'a', step: 'evento', n: 10 },
				{ slug: 'a', step: 'aprobada', n: 1 },
				{ slug: 'a', step: 'aprobada', n: 1 },
				{ slug: 'a', step: 'raro', n: 99 }
			],
			() => ''
		);
		expect(rows).toEqual([
			{
				slug: 'a',
				title: 'a',
				evento: 10,
				abrio: 0,
				datos: 0,
				pagar: 0,
				orden: 0,
				aprobada: 2,
				rate: 0.2
			}
		]);
		expect(monthLabel('2026-01')).toBe('ene 2026');
	});
});
