import { describe, expect, it, vi } from 'vitest';
import {
	DATASET,
	analyticsDataset,
	makePoint,
	pageViewPoint,
	trackFunnel,
	trackPageView,
	writePoint
} from './track.js';

// Datos inventados: una IP de documentación (RFC 5737), una cookie y un mail falsos.
const FAKE_IP = '203.0.113.7';
const FAKE_COOKIE = 'kv_session=cookie-falsa-123';
const FAKE_EMAIL = 'persona.inventada@example.com';
const UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, country?: string }} [o]
 */
function req(url, o = {}) {
	const r = new Request(url, {
		method: o.method ?? 'GET',
		headers: {
			'user-agent': UA,
			'cf-connecting-ip': FAKE_IP,
			'x-forwarded-for': FAKE_IP,
			cookie: FAKE_COOKIE,
			...o.headers
		}
	});
	Object.defineProperty(r, 'cf', { value: { country: o.country ?? 'AR', city: 'Ciudad Falsa' } });
	return r;
}
const html = (status = 200) =>
	new Response('<html></html>', {
		status,
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
const json = () =>
	new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

function fakeEnv() {
	/** @type {any[]} */
	const points = [];
	return {
		points,
		env: { ANALYTICS: { writeDataPoint: (/** @type {any} */ p) => points.push(p) } }
	};
}

describe('pageViewPoint', () => {
	it('una página HTML pública: ruta, origen, país, dispositivo y evento', () => {
		const point = pageViewPoint(
			req('https://kinkyvibe.ar/calendario/fiesta-rara?utm_source=ig&mail=' + FAKE_EMAIL, {
				headers: { referer: 'https://www.instagram.com/p/xyz?igsh=abc' }
			}),
			html()
		);
		expect(point).toEqual({
			indexes: ['view'],
			blobs: [
				'view',
				'/calendario/fiesta-rara',
				'instagram.com',
				'AR',
				'phone',
				'fiesta-rara',
				'evento',
				''
			],
			doubles: [1]
		});
	});

	it('la página de compra es el paso «abrio»', () => {
		const point = pageViewPoint(
			req('https://kinkyvibe.ar/calendario/fiesta-rara/entradas'),
			html()
		);
		expect(point?.blobs[6]).toBe('abrio');
	});

	it('no cuenta HEAD, POST, errores, no-HTML, bots, prefetch ni el panel', () => {
		const page = 'https://kinkyvibe.ar/calendario';
		expect(pageViewPoint(req(page, { method: 'HEAD' }), html())).toBeNull();
		expect(pageViewPoint(req(page, { method: 'POST' }), html())).toBeNull();
		expect(pageViewPoint(req(page), html(404))).toBeNull();
		expect(pageViewPoint(req(page), html(500))).toBeNull();
		expect(
			pageViewPoint(
				req('https://kinkyvibe.ar/rss'),
				new Response('<rss/>', { headers: { 'content-type': 'application/xml' } })
			)
		).toBeNull();
		expect(
			pageViewPoint(
				req('https://kinkyvibe.ar/favicon.png'),
				new Response('x', { headers: { 'content-type': 'image/png' } })
			)
		).toBeNull();
		expect(
			pageViewPoint(req(page, { headers: { 'user-agent': 'Googlebot/2.1' } }), html())
		).toBeNull();
		expect(pageViewPoint(req(page, { headers: { 'sec-purpose': 'prefetch' } }), html())).toBeNull();
		expect(pageViewPoint(req('https://kinkyvibe.ar/admin/estadisticas'), html())).toBeNull();
		expect(pageViewPoint(req('https://kinkyvibe.ar/entradas/t/token-falso'), html())).toBeNull();
		expect(pageViewPoint(req('https://kinkyvibe.ar/api/visto'), json())).toBeNull();
	});

	it('cuenta una navegación de SvelteKit (__data.json) una vez, como visita de su página', () => {
		const point = pageViewPoint(
			req('https://kinkyvibe.ar/calendario/fiesta-rara/__data.json?x-sveltekit-invalidated=01', {
				headers: { referer: 'https://kinkyvibe.ar/calendario' }
			}),
			json()
		);
		expect(point?.blobs.slice(0, 3)).toEqual(['view', '/calendario/fiesta-rara', '']);
		expect(point?.blobs[6]).toBe('evento');
	});

	it('no cuenta la recarga de datos de la misma página (invalidate) ni __data.json sin Referer', () => {
		const url =
			'https://kinkyvibe.ar/calendario/fiesta-rara/entradas/__data.json?x-sveltekit-invalidated=11';
		expect(
			pageViewPoint(
				req(url, {
					headers: { referer: 'https://kinkyvibe.ar/calendario/fiesta-rara/entradas?x=1' }
				}),
				json()
			)
		).toBeNull();
		expect(pageViewPoint(req(url), json())).toBeNull();
		// Referer de otro sitio: no es una navegación de SvelteKit.
		expect(
			pageViewPoint(req(url, { headers: { referer: 'https://otro.example/' } }), json())
		).toBeNull();
	});

	it('nunca guarda IP, User-Agent, cookies, query ni datos de la persona', () => {
		const point = pageViewPoint(
			req(`https://kinkyvibe.ar/amigues?email=${FAKE_EMAIL}&token=secreto`, {
				headers: { referer: `https://mail.example/?to=${FAKE_EMAIL}` }
			}),
			html()
		);
		const stored = JSON.stringify(point);
		for (const bad of [
			FAKE_IP,
			FAKE_COOKIE,
			'cookie-falsa',
			FAKE_EMAIL,
			'secreto',
			'iPhone',
			'Mozilla',
			'Ciudad Falsa',
			'?'
		]) {
			expect(stored).not.toContain(bad);
		}
		expect(point?.blobs).toHaveLength(8);
		expect(point?.doubles).toEqual([1]);
	});
});

describe('sin binding: no hace nada', () => {
	it('no tira ni escribe en dev, tests o Previews', () => {
		expect(analyticsDataset(undefined)).toBeNull();
		expect(analyticsDataset({})).toBeNull();
		expect(analyticsDataset({ ANALYTICS: {} })).toBeNull();
		expect(writePoint({}, makePoint({ kind: 'view' }))).toBe(false);
		expect(trackPageView(req('https://kinkyvibe.ar/'), html(), {})).toBe(false);
		expect(trackPageView(req('https://kinkyvibe.ar/'), html(), undefined)).toBe(false);
		expect(trackFunnel(undefined, { slug: 'fiesta-rara', step: 'orden', method: 'gratis' })).toBe(
			false
		);
	});

	it('un env cuyos getters tiran (prerender) tampoco rompe', () => {
		const env = Object.defineProperty({}, 'ANALYTICS', {
			get() {
				throw new Error('prerender');
			}
		});
		expect(analyticsDataset(env)).toBeNull();
	});

	it('si writeDataPoint tira, la página sigue', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const env = {
			ANALYTICS: {
				writeDataPoint: () => {
					throw new Error('caído');
				}
			}
		};
		expect(trackPageView(req('https://kinkyvibe.ar/'), html(), env)).toBe(false);
		spy.mockRestore();
	});
});

describe('con binding', () => {
	it('trackPageView escribe un punto', () => {
		const { env, points } = fakeEnv();
		expect(trackPageView(req('https://kinkyvibe.ar/wiki/bdsm'), html(), env)).toBe(true);
		expect(points).toHaveLength(1);
		expect(points[0].blobs[1]).toBe('/wiki/bdsm');
	});

	it('trackFunnel: solo evento, paso y medio; valida todo', () => {
		const { env, points } = fakeEnv();
		expect(trackFunnel(env, { slug: 'Fiesta-Rara', step: 'orden', method: 'mercadopago' })).toBe(
			true
		);
		expect(points[0]).toEqual({
			indexes: ['funnel'],
			blobs: ['funnel', '', '', '', '', 'fiesta-rara', 'orden', 'mercadopago'],
			doubles: [1]
		});
		expect(trackFunnel(env, { slug: 'fiesta-rara', step: 'aprobada', method: 'otra-cosa' })).toBe(
			true
		);
		expect(points[1].blobs[7]).toBe('');
		expect(trackFunnel(env, { slug: '../nada', step: 'orden' })).toBe(false);
		expect(trackFunnel(env, { slug: 'fiesta-rara', step: 'inventado' })).toBe(false);
		expect(points).toHaveLength(2);
	});

	it('el dataset se llama como en wrangler.toml', () => {
		expect(DATASET).toBe('kinkyvibe_visitas');
	});
});
