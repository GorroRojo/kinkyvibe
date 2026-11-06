/**
 * Las visitas de una página (la tarjeta «Visitas» de las fichas): qué direcciones se consultan,
 * la consulta y lo que se arma con las filas. API de Analytics Engine falsa, datos inventados
 * (evento «fiesta-rara», material «cuerdas-falsas»).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSqlCache } from './sql.js';
import {
	MAX_PATHS,
	buildPageVisits,
	eventSlugsOf,
	loadPageVisits,
	pagePaths,
	pageStatsHref,
	pageVisitsSql,
	safePagePath
} from './page.js';

const env = { CF_ACCOUNT_ID: 'f'.repeat(32), CF_ANALYTICS_TOKEN: 'token-falso-de-prueba' };
// 15/10/2026 a las 12:00 de Argentina.
const NOW = new Date('2026-10-15T15:00:00Z');

/** @param {(sql: string) => Record<string, unknown>[] | Response} answer */
function fakeApi(answer) {
	/** @type {string[]} */
	const sqls = [];
	const fetchFn = vi.fn(async (/** @type {any} */ _url, /** @type {any} */ init) => {
		const sql = String(init.body);
		sqls.push(sql);
		const out = answer(sql);
		return out instanceof Response ? out : Response.json({ meta: [], data: out, rows: 0 });
	});
	return { sqls, fetch: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchFn)) };
}

beforeEach(() => clearSqlCache());

describe('safePagePath', () => {
	it('normaliza como el contador (minúsculas, sin barra final ni query)', () => {
		expect(safePagePath('/Calendario/Fiesta-Rara/')).toBe('/calendario/fiesta-rara');
		expect(safePagePath('/wiki/cuerdas?x=1')).toBe('/wiki/cuerdas');
		expect(safePagePath('/wiki/%C3%A1rbol')).toBe('/wiki/%c3%a1rbol');
	});

	it('nada que no se cuenta, sin barra o con algo que rompería el SQL', () => {
		for (const raw of [
			'/admin/inicio',
			'/entradas/abc',
			'/api/visto',
			'material/x',
			"/material/x'or'1",
			'/material/a b',
			'/material/(x)',
			'',
			null,
			42
		]) {
			expect(safePagePath(raw), String(raw)).toBeNull();
		}
	});
});

describe('pagePaths', () => {
	it('la canónica primero y las otras direcciones, sin repetir', () => {
		expect(pagePaths('evento', ['Fiesta-Rara', 'fiesta-rara', 'fiesta-rara-2026'])).toEqual([
			'/calendario/fiesta-rara',
			'/calendario/fiesta-rara-2026'
		]);
		expect(pagePaths('material', ['cuerdas-falsas', null, '', undefined])).toEqual([
			'/material/cuerdas-falsas'
		]);
		expect(pagePaths('perfil', ['persona-inventada', 'PersonaInventada'])).toEqual([
			'/amigues/persona-inventada',
			'/amigues/personainventada'
		]);
	});

	it('la Kinkipedia: el slug y el nombre de la etiqueta, codificado como lo manda el navegador', () => {
		expect(pagePaths('wiki', ['atadura-japonesa', 'Atadura japonesa', 'atadura-japonesa'])).toEqual(
			['/wiki/atadura-japonesa', '/wiki/atadura%20japonesa']
		);
		expect(pagePaths('wiki', ['árbol'])).toEqual(['/wiki/%c3%a1rbol']);
	});

	it('deja afuera lo que no se puede consultar y corta en MAX_PATHS', () => {
		expect(pagePaths('material', ["x'y", 'bien'])).toEqual(['/material/bien']);
		const many = Array.from({ length: MAX_PATHS + 3 }, (_, i) => `m-${i}`);
		expect(pagePaths('material', many)).toHaveLength(MAX_PATHS);
	});

	it('un tipo desconocido tira (es un error de programación)', () => {
		expect(() => pagePaths(/** @type {any} */ ('producto'), ['x'])).toThrow();
	});
});

describe('eventSlugsOf y pageStatsHref', () => {
	it('solo los slugs de las páginas de evento', () => {
		expect(
			eventSlugsOf(['/calendario/fiesta-rara', '/calendario/fiesta-rara/entradas', '/material/x'])
		).toEqual(['fiesta-rara']);
	});

	it('el link a Estadísticas › Visitas filtrado', () => {
		expect(pageStatsHref('/calendario/fiesta-rara')).toBe(
			'/admin/estadisticas/visitas?pagina=%2Fcalendario%2Ffiesta-rara'
		);
	});
});

describe('pageVisitsSql', () => {
	const from = new Date('2026-07-18T03:00:00Z');

	it('solo esas direcciones (y el evento, si se pide), por día de Argentina', () => {
		const sql = pageVisitsSql({
			paths: ['/calendario/fiesta-rara', '/calendario/fiesta-vieja'],
			eventSlugs: ['fiesta-rara'],
			from
		});
		expect(sql).toContain("timestamp >= toDateTime('2026-07-18 03:00:00')");
		expect(sql).toContain(
			"(blob2 = '/calendario/fiesta-rara' OR blob2 = '/calendario/fiesta-vieja' OR blob6 = 'fiesta-rara')"
		);
		expect(sql).toContain("timestamp - INTERVAL '3' HOUR");
		expect(sql).toContain('GROUP BY kind, path, source, step, day');
		expect(sql).toContain('FROM kinkyvibe_visitas');
	});

	it('nunca mete en el SQL una dirección o un slug raro', () => {
		const sql = pageVisitsSql({
			paths: ['/material/bien', "/material/x' OR '1'='1"],
			eventSlugs: ["x' OR 1=1 --"],
			from
		});
		expect(sql).toContain("blob2 = '/material/bien'");
		expect(sql).not.toContain('OR 1=1');
		expect(sql).not.toContain("'1'='1");
		expect(() => pageVisitsSql({ paths: ["/x'"], from })).toThrow();
	});
});

describe('buildPageVisits', () => {
	/** Filas inventadas como las devuelve la API (números a veces como texto). */
	const rows = [
		{
			kind: 'view',
			path: '/calendario/fiesta-rara',
			source: '',
			step: 'evento',
			day: '2026-10-15 00:00:00',
			n: '10'
		},
		{
			kind: 'view',
			path: '/calendario/fiesta-rara',
			source: 'instagram.com',
			step: 'evento',
			day: '2026-10-14 00:00:00',
			n: 6
		},
		{
			kind: 'view',
			path: '/calendario/fiesta-vieja',
			source: 'whatsapp.com',
			step: 'evento',
			day: '2026-10-01 00:00:00',
			n: 4
		},
		{
			kind: 'view',
			path: '/calendario/fiesta-rara',
			source: 't.co',
			step: 'evento',
			day: '2026-09-20 00:00:00',
			n: 1
		},
		{
			kind: 'view',
			path: '/calendario/fiesta-rara',
			source: 'a.example',
			step: 'evento',
			day: '2026-09-20 00:00:00',
			n: 1
		},
		{
			kind: 'view',
			path: '/calendario/fiesta-rara',
			source: 'b.example',
			step: 'evento',
			day: '2026-09-20 00:00:00',
			n: 1
		},
		// Más de 30 días: cuenta para la compra, no para las visitas.
		{
			kind: 'view',
			path: '/calendario/fiesta-rara',
			source: '',
			step: 'evento',
			day: '2026-08-01 00:00:00',
			n: 7
		},
		// La página de compra: es un paso, no una visita a la página.
		{
			kind: 'view',
			path: '/calendario/fiesta-rara/entradas',
			source: '',
			step: 'abrio',
			day: '2026-10-15 00:00:00',
			n: 8
		},
		{ kind: 'funnel', path: '', source: '', step: 'datos', day: '2026-10-15 00:00:00', n: 5 },
		{ kind: 'funnel', path: '', source: '', step: 'pagar', day: '2026-10-15 00:00:00', n: 4 },
		{ kind: 'funnel', path: '', source: '', step: 'orden', day: '2026-10-15 00:00:00', n: 3 },
		{ kind: 'funnel', path: '', source: '', step: 'aprobada', day: '2026-10-15 00:00:00', n: 2 },
		{ kind: 'funnel', path: '', source: '', step: 'inventado', day: '2026-10-15 00:00:00', n: 99 }
	];
	const paths = ['/calendario/fiesta-rara', '/calendario/fiesta-vieja'];

	it('7 y 30 días, por día (30 columnas, la última hoy) y los orígenes con su parte', () => {
		const v = buildPageVisits(rows, { paths, now: NOW, funnel: false });
		expect(v.week).toBe(16);
		expect(v.month).toBe(23);
		expect(v.daily).toHaveLength(30);
		expect(v.daily.at(-1)).toEqual({ day: '2026-10-15', label: '15/10', views: 10 });
		expect(v.daily[0].day).toBe('2026-09-16');
		expect(v.daily.find((d) => d.day === '2026-09-20')?.views).toBe(3);
		expect(v.sources.map((s) => [s.label, s.n])).toEqual([
			['Directo o desde el mismo sitio', 10],
			['instagram.com', 6],
			['whatsapp.com', 4],
			['t.co', 1],
			['Otros', 2]
		]);
		expect(v.sources[0].share).toBeCloseTo(10 / 23);
		expect(v.funnel).toBeNull();
	});

	it('en un evento con entradas, los pasos de la compra (todo lo guardado)', () => {
		const v = buildPageVisits(rows, { paths, now: NOW, funnel: true });
		expect(v.funnel).toEqual({ evento: 30, abrio: 8, datos: 5, pagar: 4, orden: 3, aprobada: 2 });
	});

	it('sin filas: todo en cero, sin orígenes', () => {
		const v = buildPageVisits([], { paths, now: NOW, funnel: false });
		expect(v).toMatchObject({ week: 0, month: 0, sources: [] });
		expect(v.daily.every((d) => d.views === 0)).toBe(true);
	});
});

describe('loadPageVisits', () => {
	it('sin configurar: lo dice, sin llamar a nadie', async () => {
		const api = fakeApi(() => []);
		const v = await loadPageVisits({
			env: {},
			paths: ['/material/cuerdas-falsas'],
			fetch: api.fetch
		});
		expect(v.status).toBe('unconfigured');
		expect(v.message).toContain('falta configurarlas');
		expect(api.sqls).toEqual([]);
	});

	it('sin direcciones que se cuenten: no consulta', async () => {
		const api = fakeApi(() => []);
		const v = await loadPageVisits({ env, paths: ['/admin/x'], fetch: api.fetch });
		expect(v.status).toBe('nopath');
		expect(api.sqls).toEqual([]);
	});

	it('una sola consulta, con caché: abrir la ficha otra vez no vuelve a preguntar', async () => {
		const api = fakeApi(() => [
			{
				kind: 'view',
				path: '/material/cuerdas-falsas',
				source: '',
				step: '',
				day: '2026-10-15 00:00:00',
				n: 3
			}
		]);
		const input = { env, paths: ['/material/cuerdas-falsas'], now: NOW, fetch: api.fetch };
		const v = await loadPageVisits(input);
		await loadPageVisits(input);
		expect(api.sqls).toHaveLength(1);
		expect(api.sqls[0]).not.toContain('blob6');
		expect(v).toMatchObject({
			status: 'ok',
			path: '/material/cuerdas-falsas',
			statsHref: '/admin/estadisticas/visitas?pagina=%2Fmaterial%2Fcuerdas-falsas',
			week: 3,
			month: 3,
			funnel: null
		});
	});

	it('un evento con entradas suma los pasos por slug', async () => {
		const api = fakeApi(() => []);
		const v = await loadPageVisits({
			env,
			paths: ['/calendario/fiesta-rara'],
			tickets: true,
			now: NOW,
			fetch: api.fetch
		});
		expect(api.sqls[0]).toContain("blob6 = 'fiesta-rara'");
		expect(v.funnel).toEqual({ evento: 0, abrio: 0, datos: 0, pagar: 0, orden: 0, aprobada: 0 });
	});

	it('si Cloudflare falla, un mensaje corto (nunca tira)', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const api = fakeApi(() => new Response('no', { status: 403 }));
		const v = await loadPageVisits({ env, paths: ['/wiki/cuerdas'], now: NOW, fetch: api.fetch });
		expect(v.status).toBe('error');
		expect(v.message).toContain('rechazó el token');
	});
});
