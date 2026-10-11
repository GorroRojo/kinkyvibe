/**
 * Estadísticas en tres pestañas (gorrite, 11/10): cada `load` lee solo su fuente. Ventas y
 * Asistencia leen las órdenes y nunca llaman a Analytics Engine; Visitas al sitio llama a
 * Analytics Engine (y lee `analytics_monthly`) y nunca lee las órdenes. `/admin/estadisticas`
 * redirige a Ventas. Base y API de Cloudflare falsas; datos inventados (example.com).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMINS } from '$lib/server/auth';
import { clearSqlCache } from '$lib/server/analytics/sql.js';

vi.mock('$env/dynamic/private', () => ({
	env: { CF_ACCOUNT_ID: 'f'.repeat(32), CF_ANALYTICS_TOKEN: 'token-falso-de-prueba' }
}));
vi.mock('$lib/server/analytics/report.js', async (importOriginal) => {
	const original = /** @type {typeof import('$lib/server/analytics/report.js')} */ (
		await importOriginal()
	);
	return { ...original, loadVisits: vi.fn(original.loadVisits) };
});
vi.mock('$lib/server/admin/people.js', async (importOriginal) => {
	const original = /** @type {typeof import('$lib/server/admin/people.js')} */ (
		await importOriginal()
	);
	return { ...original, loadPeopleOrders: vi.fn(original.loadPeopleOrders) };
});
vi.mock('$lib/server/tickets/events.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	getEventInfo: async (/** @type {string} */ slug) => ({
		title: `Evento inventado ${slug}`,
		start: '2026-09-20T22:00-03:00',
		tags: []
	})
}));

const { loadVisits } = await import('$lib/server/analytics/report.js');
const { loadPeopleOrders } = await import('$lib/server/admin/people.js');
const { load: loadVentas } = await import('./ventas/+page.server.js');
const { load: loadAsistencia } = await import('./asistencia/+page.server.js');
const { load: loadVisitas } = await import('./visitas/+page.server.js');
const { GET: redirectGET } = await import('./+server.js');

const NOW = Date.parse('2026-10-11T15:00:00Z');
const DAY = 86_400_000;
const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const locals = /** @type {App.Locals} */ (
	/** @type {unknown} */ ({ user: admin, user_token: 'token-de-prueba' })
);

/** Una orden inventada, como la devuelve la consulta de people.js. */
const ROWS = [
	{
		id: 'o1',
		event_slug: 'fiesta-2026-09',
		ticket_type: 'general',
		quantity: 2,
		total: 2000,
		payment_method: 'mercadopago',
		fondo_option: 'completo',
		fondo_amount: 0,
		fondo_contribution: 0,
		surcharge_amount: 0,
		buyer_name: 'Persona Inventada',
		buyer_pronouns: null,
		buyer_email: 'persona@example.com',
		status: 'approved',
		created_at: NOW - 10 * DAY,
		checked: 2
	}
];

/** D1 falsa: anota cada consulta (y sus parámetros); a las órdenes les devuelve ROWS. */
function fakeDB() {
	/** @type {{ sql: string, args: unknown[] }[]} */
	const queries = [];
	const db = {
		prepare(/** @type {string} */ sql) {
			const q = { sql, args: /** @type {unknown[]} */ ([]) };
			queries.push(q);
			const stmt = {
				bind(/** @type {unknown[]} */ ...args) {
					q.args = args;
					return stmt;
				},
				all: async () => ({ results: /\bFROM orders\b/.test(sql) ? structuredClone(ROWS) : [] }),
				first: async () => null,
				run: async () => ({})
			};
			return stmt;
		}
	};
	return {
		queries,
		platform: /** @type {App.Platform} */ (/** @type {unknown} */ ({ env: { DB: db } }))
	};
}

/** API de Cloudflare falsa: anota a qué host se llamó. */
const fetchSpy = vi.fn(async (/** @type {any} */ url) => {
	void url;
	return Response.json({ meta: [], data: [], rows: 0 });
});

/**
 * Corre un load con la URL dada.
 * @param {(event: any) => any} load
 * @param {string} path
 */
async function run(load, path) {
	const { queries, platform } = fakeDB();
	/** @type {Record<string, string>} */
	const headers = {};
	const data = await load({
		url: new URL(path, 'https://kinkyvibe.test'),
		locals,
		platform,
		setHeaders: (/** @type {Record<string, string>} */ h) => Object.assign(headers, h)
	});
	return { data, queries, headers };
}

/** Los hosts a los que se llamó con fetch. */
const fetchedHosts = () => fetchSpy.mock.calls.map(([url]) => new URL(String(url)).hostname);

beforeEach(() => {
	clearSqlCache();
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	vi.stubGlobal('fetch', fetchSpy);
	fetchSpy.mockClear();
	vi.mocked(loadVisits).mockClear();
	vi.mocked(loadPeopleOrders).mockClear();
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('Ventas (/admin/estadisticas/ventas)', () => {
	it('lee solo las órdenes, filtradas por fecha en SQL; nunca Analytics Engine', async () => {
		const { data, queries, headers } = await run(
			loadVentas,
			'/admin/estadisticas/ventas?periodo=30d'
		);
		expect(loadPeopleOrders).toHaveBeenCalledTimes(1);
		expect(loadVisits).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(queries.some((q) => q.sql.includes('analytics_monthly'))).toBe(false);
		// Una consulta a las órdenes, desde el comienzo del período anterior (para comparar).
		const ordersQuery = queries.filter((q) => /\bFROM orders\b/.test(q.sql));
		expect(ordersQuery).toHaveLength(1);
		expect(ordersQuery[0].sql).toContain('o.created_at >= ?1');
		expect(ordersQuery[0].args).toEqual([NOW - 60 * DAY]);
		expect(headers['cache-control']).toBe('private, no-store');
		expect(data).toMatchObject({ dbAvailable: true, period: '30d', serie: '' });
		expect(data.sales.kpis).toMatchObject({ tickets: 2, revenue: 2000 });
	});

	it('por defecto, 12 meses; con «todo», sin filtro de fecha; la serie viene de la URL', async () => {
		const def = await run(loadVentas, '/admin/estadisticas/ventas');
		expect(def.data.period).toBe('12m');
		const all = await run(loadVentas, '/admin/estadisticas/ventas?periodo=todo&serie=fiesta');
		expect(all.data).toMatchObject({ period: 'todo', serie: 'fiesta' });
		const q = all.queries.find((x) => /\bFROM orders\b/.test(x.sql));
		expect(q?.sql).not.toContain('created_at >=');
		expect(q?.args).toEqual([]);
		expect(all.data.sales.kpis.tickets).toBe(2);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('un período inválido vuelve al de por defecto', async () => {
		const { data } = await run(loadVentas, '/admin/estadisticas/ventas?periodo=7d');
		expect(data.period).toBe('12m');
	});

	it('sin base: avisa, sin tirar', async () => {
		const data = await loadVentas(
			/** @type {any} */ ({
				url: new URL('https://kinkyvibe.test/admin/estadisticas/ventas'),
				locals,
				platform: { env: {} },
				setHeaders: () => {}
			})
		);
		expect(data).toMatchObject({ dbAvailable: false, sales: null });
	});
});

describe('Asistencia (/admin/estadisticas/asistencia)', () => {
	it('lee todas las órdenes (hace falta la historia); nunca Analytics Engine', async () => {
		const { data, queries } = await run(
			loadAsistencia,
			'/admin/estadisticas/asistencia?periodo=90d'
		);
		expect(loadPeopleOrders).toHaveBeenCalledTimes(1);
		expect(loadVisits).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
		const ordersQuery = queries.filter((q) => /\bFROM orders\b/.test(q.sql));
		expect(ordersQuery).toHaveLength(1);
		expect(ordersQuery[0].sql).not.toContain('created_at >=');
		expect(queries.some((q) => q.sql.includes('analytics_monthly'))).toBe(false);
		expect(data).toMatchObject({ dbAvailable: true, period: '90d' });
		expect(data.attendance.kpis).toMatchObject({ sold: 2, checked: 2, people: 1 });
	});

	it('por defecto, 12 meses', async () => {
		const { data } = await run(loadAsistencia, '/admin/estadisticas/asistencia');
		expect(data.period).toBe('12m');
	});
});

describe('Visitas al sitio (/admin/estadisticas/visitas)', () => {
	it('llama a Analytics Engine y lee analytics_monthly; nunca las órdenes', async () => {
		const { data, queries } = await run(loadVisitas, '/admin/estadisticas/visitas?periodo=7d');
		expect(loadPeopleOrders).not.toHaveBeenCalled();
		expect(queries.some((q) => /\borders\b/.test(q.sql))).toBe(false);
		expect(queries.length).toBeGreaterThan(0);
		expect(queries.every((q) => q.sql.includes('analytics_monthly'))).toBe(true);
		expect(loadVisits).toHaveBeenCalledTimes(1);
		expect(vi.mocked(loadVisits).mock.calls[0][0]).toMatchObject({ days: 7 });
		expect(fetchSpy).toHaveBeenCalled();
		expect(new Set(fetchedHosts())).toEqual(new Set(['api.cloudflare.com']));
		expect(data.period).toBe('7d');
		expect(data.visits).toMatchObject({ configured: true, error: null, topDays: 7 });
	});

	it('por defecto, 30 días; «12m» o «todo» no son opciones de Visitas', async () => {
		for (const path of [
			'/admin/estadisticas/visitas',
			'/admin/estadisticas/visitas?periodo=12m',
			'/admin/estadisticas/visitas?periodo=todo'
		]) {
			const { data } = await run(loadVisitas, path);
			expect(data.period, path).toBe('30d');
			expect(data.visits.topDays, path).toBe(30);
		}
	});
});

describe('/admin/estadisticas redirige a Ventas (307)', () => {
	/** @param {string} path @param {App.Locals} who */
	function thrown(path, who) {
		try {
			redirectGET(
				/** @type {any} */ ({ url: new URL(path, 'https://kinkyvibe.test'), locals: who })
			);
		} catch (e) {
			return /** @type {{ status: number, location: string }} */ (e);
		}
		throw new Error('no redirigió');
	}

	it('a /admin/estadisticas/ventas, con el mismo período', () => {
		const plain = thrown('/admin/estadisticas', locals);
		expect(plain.status).toBe(307);
		expect(plain.location).toBe('/admin/estadisticas/ventas');
		const withPeriod = thrown('/admin/estadisticas?periodo=30d', locals);
		expect(withPeriod.status).toBe(307);
		const to = new URL(withPeriod.location, 'https://kinkyvibe.test');
		expect(to.pathname).toBe('/admin/estadisticas/ventas');
		expect(to.searchParams.get('periodo')).toBe('30d');
	});

	it('sin sesión, primero al login (y de ahí vuelve a /admin/estadisticas)', () => {
		const anon = /** @type {App.Locals} */ (/** @type {unknown} */ ({}));
		const r = thrown('/admin/estadisticas', anon);
		expect(r.status).toBe(303);
		const to = new URL(r.location, 'https://kinkyvibe.test');
		expect(to.pathname).toBe('/login');
		expect(to.searchParams.get('redirectTo')).toBe('/admin/estadisticas');
	});
});
