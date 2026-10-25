import { describe, expect, it, vi } from 'vitest';
import {
	CACHE_STATUS_HEADER,
	EDGE_CACHE_TTL,
	cookieNames,
	edgeCacheKey,
	isCacheableResponse,
	withEdgeCache
} from './edgeCache.js';
import { TOKEN_COOKIE } from './auth.js';
import { SESSION_COOKIE } from './cuentas/session.js';
import { DEMO_COOKIE } from './demo/identity.js';
import { ORDERS_COOKIE } from './tickets/checkout.js';

const VERSION = '1700000000000';
const HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

/**
 * @param {string} path
 * @param {{ method?: string, headers?: Record<string, string>, host?: string }} [opts]
 */
function req(path, { method = 'GET', headers = {}, host = 'https://kinkyvibe.ar' } = {}) {
	return new Request(host + path, { method, headers: { accept: HTML, ...headers } });
}

/** @param {string} path @param {Parameters<typeof req>[1]} [opts] */
const key = (path, opts) => edgeCacheKey(req(path, opts), { version: VERSION });

/**
 * @param {string} [body]
 * @param {ResponseInit} [init]
 */
function html(body = '<p>hola</p>', init = {}) {
	return new Response(body, {
		status: 200,
		...init,
		headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers ?? {}) }
	});
}

function fakeCache() {
	/** @type {Map<string, Response>} */
	const store = new Map();
	return {
		store,
		match: vi.fn(async (/** @type {string} */ k) => store.get(k)?.clone()),
		put: vi.fn(async (/** @type {string} */ k, /** @type {Response} */ r) => {
			// Como la Cache API: lee el cuerpo entero.
			store.set(k, new Response(await r.arrayBuffer(), r));
		})
	};
}

function fakeCtx() {
	/** @type {Promise<unknown>[]} */
	const pending = [];
	return {
		pending,
		waitUntil: (/** @type {Promise<unknown>} */ p) => void pending.push(p),
		flush: () => Promise.all(pending)
	};
}

describe('edgeCacheKey: qué pedidos pueden usar la caché', () => {
	it('una página pública, GET, sin cookies, en producción', () => {
		const k = key('/calendario/una-fiesta');
		expect(k).toBe(`https://kinkyvibe.ar/__kv-edge-cache/${VERSION}/calendario/una-fiesta`);
		expect(key('/')).not.toBeNull();
		expect(key('/material?q=soga&tags=bondage')).toContain('?q=soga&tags=bondage');
	});

	it('la versión del build va en la clave (un deploy empieza de cero)', () => {
		const a = edgeCacheKey(req('/wiki'), { version: '1' });
		const b = edgeCacheKey(req('/wiki'), { version: '2' });
		expect(a).not.toBe(b);
		expect(edgeCacheKey(req('/wiki'), { version: '' })).toBeNull();
	});

	it('apagada con la variable: nunca', () => {
		expect(edgeCacheKey(req('/wiki'), { version: VERSION, enabled: false })).toBeNull();
	});

	it.each(['POST', 'HEAD', 'PUT', 'DELETE', 'PATCH'])('%s: nunca', (method) => {
		expect(key('/wiki', { method })).toBeNull();
	});

	it.each([
		'/admin',
		'/admin/eventos',
		'/edit',
		'/edit/algo',
		'/api/visto',
		'/entradas/123/estado',
		'/calendario/una-fiesta/entradas',
		'/calendario/una-fiesta/entradas?lista=abc',
		'/mi-rincon',
		'/mi-rincon/perfiles',
		'/ingresar',
		'/login',
		'/logout',
		'/callback',
		'/mails/no-fui-yo/abc',
		'/avisos',
		'/lista-de-espera/confirmar/abc',
		'/propinas',
		'/telegram/app',
		'/auch',
		'/errores/404',
		'/imagenes',
		'/media/foto.jpg',
		'/og/evento.png',
		'/calendario/__data.json',
		'/ADMIN'
	])('ruta excluida %s: nunca', (path) => {
		expect(key(path)).toBeNull();
	});

	it('un prefijo excluido no tapa rutas que solo empiezan igual', () => {
		expect(key('/administracion-de-algo')).not.toBeNull();
	});

	it.each([TOKEN_COOKIE, SESSION_COOKIE, DEMO_COOKIE, ORDERS_COOKIE, 'oauthState', 'otra'])(
		'con la cookie %s: nunca',
		(name) => {
			expect(key('/wiki', { headers: { cookie: `${name}=x` } })).toBeNull();
			expect(key('/wiki', { headers: { cookie: `__cf_bm=a; ${name}=x` } })).toBeNull();
		}
	);

	it('las cookies de Cloudflare solas no impiden guardar', () => {
		expect(key('/wiki', { headers: { cookie: '__cf_bm=a; cf_clearance=b' } })).not.toBeNull();
	});

	it('las cookies que lee el sitio son exactamente las que se esperan', () => {
		expect([TOKEN_COOKIE, SESSION_COOKIE, DEMO_COOKIE, ORDERS_COOKIE]).toEqual([
			'userToken',
			'kvRincon',
			'kvDemo',
			'kv_orders'
		]);
	});

	it('con Authorization: nunca', () => {
		expect(key('/wiki', { headers: { authorization: 'Bearer x' } })).toBeNull();
	});

	it('pedidos internos de SvelteKit: nunca', () => {
		expect(key('/wiki', { headers: { 'x-sveltekit-invalidated': '01' } })).toBeNull();
	});

	it('si no pide HTML: nunca', () => {
		expect(key('/wiki', { headers: { accept: 'application/json' } })).toBeNull();
		expect(key('/wiki', { headers: { accept: '*/*' } })).toBeNull();
	});

	it('parámetros desconocidos (tokens, la lista de espera): nunca', () => {
		expect(key('/calendario/una-fiesta?lista=abc')).toBeNull();
		expect(key('/wiki?token=abc')).toBeNull();
		expect(key('/wiki?q=a&x=1')).toBeNull();
	});

	it('Previews, workers.dev, local y http: nunca', () => {
		expect(key('/wiki', { host: 'https://rama-kinkyvibe.algo.workers.dev' })).toBeNull();
		expect(key('/wiki', { host: 'http://localhost:5173' })).toBeNull();
		expect(key('/wiki', { host: 'http://kinkyvibe.ar' })).toBeNull();
		expect(key('/wiki', { host: 'https://kinkyvibe.ar.otro.com' })).toBeNull();
	});
});

describe('cookieNames', () => {
	it('lee los nombres', () => {
		expect(cookieNames('a=1; b=2;c=3=4; ')).toEqual(['a', 'b', 'c']);
	});
});

describe('isCacheableResponse: qué respuestas se guardan', () => {
	it('200 con HTML', () => {
		expect(isCacheableResponse(html())).toBe(true);
		expect(isCacheableResponse(html('', { headers: { vary: 'Accept-Encoding' } }))).toBe(true);
	});

	it.each([201, 206, 301, 302, 404, 500, 503])('status %i: no', (status) => {
		expect(isCacheableResponse(html('x', { status }))).toBe(false);
	});

	it('con Set-Cookie: no', () => {
		expect(isCacheableResponse(html('x', { headers: { 'set-cookie': 'a=1' } }))).toBe(false);
	});

	it.each(['private, no-store', 'no-store', 'private', 'no-cache', 'PRIVATE'])(
		'cache-control %s (p. ej. eventos ocultos): no',
		(cc) => {
			expect(isCacheableResponse(html('x', { headers: { 'cache-control': cc } }))).toBe(false);
		}
	);

	it('lo que no es HTML: no', () => {
		const json = new Response('{}', { headers: { 'content-type': 'application/json' } });
		expect(isCacheableResponse(json)).toBe(false);
		expect(isCacheableResponse(new Response('x'))).toBe(false);
	});

	it('Vary por otra cosa (cookie, *): no', () => {
		expect(isCacheableResponse(html('x', { headers: { vary: 'Cookie' } }))).toBe(false);
		expect(isCacheableResponse(html('x', { headers: { vary: '*' } }))).toBe(false);
	});
});

describe('withEdgeCache con una caché de mentira', () => {
	const opts = (/** @type {ReturnType<typeof fakeCache>} */ cache) => ({ cache, version: VERSION });

	it('sin sesión: MISS la primera vez, HIT después, sin volver a dibujar', async () => {
		const cache = fakeCache();
		const ctx = fakeCtx();
		const render = vi.fn(async () => html('<p>pública</p>'));
		const first = await withEdgeCache(req('/wiki'), ctx, render, opts(cache));
		expect(first.headers.get(CACHE_STATUS_HEADER)).toBe('MISS');
		expect(await first.text()).toBe('<p>pública</p>');
		await ctx.flush();
		expect(cache.put).toHaveBeenCalledTimes(1);
		const stored = [...cache.store.values()][0];
		expect(stored.headers.get('cache-control')).toBe(`public, max-age=${EDGE_CACHE_TTL}`);

		const second = await withEdgeCache(req('/wiki'), ctx, render, opts(cache));
		expect(second.headers.get(CACHE_STATUS_HEADER)).toBe('HIT');
		expect(await second.text()).toBe('<p>pública</p>');
		// El navegador no recibe el max-age de la caché.
		expect(second.headers.get('cache-control')).toBeNull();
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('el cache-control original vuelve igual en un HIT', async () => {
		const cache = fakeCache();
		const ctx = fakeCtx();
		const render = async () => html('x', { headers: { 'cache-control': 'max-age=0' } });
		await withEdgeCache(req('/wiki'), ctx, render, opts(cache));
		await ctx.flush();
		const hit = await withEdgeCache(req('/wiki'), ctx, render, opts(cache));
		expect(hit.headers.get(CACHE_STATUS_HEADER)).toBe('HIT');
		expect(hit.headers.get('cache-control')).toBe('max-age=0');
	});

	it.each([TOKEN_COOKIE, SESSION_COOKIE, DEMO_COOKIE, ORDERS_COOKIE])(
		'con la cookie %s nunca lee ni escribe la caché, aunque haya una página guardada',
		async (name) => {
			const cache = fakeCache();
			const ctx = fakeCtx();
			// Una página anónima ya guardada para la misma URL.
			await withEdgeCache(req('/wiki'), ctx, async () => html('<p>anónima</p>'), opts(cache));
			await ctx.flush();
			cache.match.mockClear();
			cache.put.mockClear();

			const render = vi.fn(async () => html('<p>tu página</p>'));
			const res = await withEdgeCache(
				req('/wiki', { headers: { cookie: `${name}=secreto` } }),
				ctx,
				render,
				opts(cache)
			);
			await ctx.flush();
			expect(await res.text()).toBe('<p>tu página</p>');
			expect(res.headers.get(CACHE_STATUS_HEADER)).toBe('BYPASS');
			expect(render).toHaveBeenCalledTimes(1);
			expect(cache.match).not.toHaveBeenCalled();
			expect(cache.put).not.toHaveBeenCalled();
		}
	);

	it('una respuesta con Set-Cookie nunca se guarda', async () => {
		const cache = fakeCache();
		const ctx = fakeCtx();
		const render = vi.fn(async () => html('x', { headers: { 'set-cookie': 'kvRincon=a' } }));
		const res = await withEdgeCache(req('/wiki'), ctx, render, opts(cache));
		await ctx.flush();
		expect(res.headers.get(CACHE_STATUS_HEADER)).toBe('BYPASS');
		expect(res.headers.get('set-cookie')).toBe('kvRincon=a');
		expect(cache.put).not.toHaveBeenCalled();
		expect(cache.store.size).toBe(0);
	});

	it('una página oculta (private, no-store) nunca se guarda', async () => {
		const cache = fakeCache();
		const ctx = fakeCtx();
		const render = async () => html('x', { headers: { 'cache-control': 'private, no-store' } });
		const res = await withEdgeCache(req('/calendario/oculto'), ctx, render, opts(cache));
		await ctx.flush();
		expect(res.headers.get(CACHE_STATUS_HEADER)).toBe('BYPASS');
		expect(cache.put).not.toHaveBeenCalled();
	});

	it('un 404 nunca se guarda', async () => {
		const cache = fakeCache();
		const ctx = fakeCtx();
		await withEdgeCache(
			req('/wiki/nada'),
			ctx,
			async () => html('x', { status: 404 }),
			opts(cache)
		);
		await ctx.flush();
		expect(cache.put).not.toHaveBeenCalled();
	});

	it('sin Cache API (local, tests): BYPASS y dibuja', async () => {
		const res = await withEdgeCache(req('/wiki'), fakeCtx(), async () => html(), {
			cache: undefined,
			version: VERSION
		});
		expect(res.headers.get(CACHE_STATUS_HEADER)).toBe('BYPASS');
	});

	it('si la caché falla, la página sale igual', async () => {
		const ctx = fakeCtx();
		const cache = {
			match: vi.fn(async () => {
				throw new Error('caída');
			}),
			put: vi.fn(async () => {
				throw new Error('caída');
			})
		};
		const res = await withEdgeCache(req('/wiki'), ctx, async () => html('ok'), {
			cache,
			version: VERSION
		});
		await ctx.flush();
		expect(await res.text()).toBe('ok');
	});
});
