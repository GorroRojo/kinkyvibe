/**
 * La imagen de un objeto sin imagen propia (`/og/objeto/<tipo>/<dirección>/<hash>.jpg`,
 * docs/compartir.md): JPEG con caché para siempre, guardado en R2; redirige si el hash es viejo,
 * si el objeto ya no se ve sin cuenta o si no se puede dibujar. Lo que ve alguien sin cuenta
 * (`objectCardSpecFor`) y el dibujante (WebAssembly, solo en el Worker) son de mentira; el dibujo de
 * verdad lo prueba src/lib/server/ogRender.test.js. Datos inventados.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OG_IMMUTABLE, OG_SHORT } from '$lib/server/ogImage.js';
import { eventCardSpec, objectCardHash, wikiCardSpec } from '$lib/utils/ogObjeto.js';

/** @type {Record<string, import('$lib/utils/ogObjeto.js').ObjectCardSpec | null>} */
let specs = {};
const specFor = vi.fn(async (_platform, kind, slug) => specs[`${kind}/${slug}`] ?? null);
vi.mock('$lib/server/ogObjeto.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	objectCardSpecFor: (/** @type {any[]} */ ...args) => specFor(...args)
}));

const { GET } = await import('./[kind]/[slug]/[file]/+server.js');

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const EVENT = eventCardSpec({
	meta: { title: 'Taller Inventado', start: '2026-11-12T21:00-03:00', summary: 'Para probar.' }
});

function fakePlatform({ render = true } = {}) {
	/** @type {Map<string, Uint8Array>} */
	const r2 = new Map();
	/** @type {Promise<unknown>[]} */
	const pending = [];
	/** @type {unknown[]} */
	const trees = [];
	// Como el de verdad: si recibe una función, la llama con una medida (acá, de mentira).
	const OG_RENDER = vi.fn(async (/** @type {any} */ tree) => {
		trees.push(typeof tree === 'function' ? await tree(async () => 1) : tree);
		return JPEG;
	});
	const env = {
		DB: { prepare: () => ({}) },
		MEDIA: {
			get: vi.fn(async (/** @type {string} */ key) => {
				const bytes = r2.get(key);
				return bytes ? { arrayBuffer: async () => bytes.buffer } : null;
			}),
			put: vi.fn(async (/** @type {string} */ key, /** @type {Uint8Array} */ bytes) => {
				r2.set(key, bytes);
			})
		},
		ASSETS: { fetch: async () => new Response(new Uint8Array([7, 7, 7])) },
		...(render ? { OG_RENDER } : {})
	};
	return {
		platform: /** @type {any} */ ({
			env,
			ctx: { waitUntil: (/** @type {Promise<unknown>} */ p) => pending.push(p) }
		}),
		r2,
		trees,
		OG_RENDER,
		settle: () => Promise.all(pending)
	};
}

/**
 * @param {any} platform
 * @param {string} kind
 * @param {string} slug
 * @param {string} file
 */
async function get(platform, kind, slug, file) {
	const url = new URL(`https://sitio.test/og/objeto/${kind}/${encodeURIComponent(slug)}/${file}`);
	try {
		return await GET(/** @type {any} */ ({ params: { kind, slug, file }, platform, url, fetch }));
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

beforeEach(() => {
	specs = { 'evento/taller-inventado': EVENT };
	specFor.mockClear();
});

describe('/og/objeto/<tipo>/<dirección>/<hash>.jpg', () => {
	it('dibuja un JPEG con caché para siempre y lo guarda en R2', async () => {
		const f = fakePlatform();
		const hash = await objectCardHash(EVENT);
		const res = await get(f.platform, 'evento', 'taller-inventado', `${hash}.jpg`);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(res.headers.get('cache-control')).toBe(OG_IMMUTABLE);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
		// lo que se pidió es lo que ve alguien sin cuenta
		expect(specFor).toHaveBeenCalledWith(f.platform, 'evento', 'taller-inventado');
		// el árbol dibujado: el título, el día y las fuentes del sitio
		const [, opts] = /** @type {any} */ (f.OG_RENDER.mock.calls[0]);
		expect(opts).toMatchObject({ width: 1200, height: 630 });
		expect(opts.fonts.map((/** @type {any} */ x) => x.name)).toEqual(['Lilita One', 'Lato']);
		const json = JSON.stringify(f.trees[0]);
		expect(json).toContain('Taller Inventado');
		expect(json).toContain('Jueves · 21:00');
		await f.settle();
		expect([...f.r2.keys()]).toEqual([`og/objeto-${hash}.jpg`]);
	});

	it('la segunda vez sale de R2, sin volver a dibujar', async () => {
		const f = fakePlatform();
		const file = `${await objectCardHash(EVENT)}.jpg`;
		await get(f.platform, 'evento', 'taller-inventado', file);
		await f.settle();
		const res = await get(f.platform, 'evento', 'taller-inventado', file);
		expect(res.status).toBe(200);
		expect(f.OG_RENDER).toHaveBeenCalledTimes(1);
	});

	it('cambió el evento (otra fecha): la dirección vieja redirige a la de ahora', async () => {
		const f = fakePlatform();
		const old = await objectCardHash(EVENT);
		const changed = { ...EVENT, date: { month: 'DIC', day: '3', sub: 'Jueves · 20:00' } };
		specs['evento/taller-inventado'] = changed;
		const res = await get(f.platform, 'evento', 'taller-inventado', `${old}.jpg`);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe(
			`/og/objeto/evento/taller-inventado/${await objectCardHash(changed)}.jpg`
		);
		expect(res.headers.get('cache-control')).toBe(OG_SHORT);
		expect(f.OG_RENDER).not.toHaveBeenCalled();
	});

	it('un objeto que no se ve sin cuenta (oculto, borrado, con imagen): la tarjeta de static/', async () => {
		const f = fakePlatform();
		const res = await get(f.platform, 'evento', 'oculto', '0123456789abcdef.jpg');
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/og-default.jpg');
		expect(res.headers.get('x-og-fallback')).toBe('no-object');
		// una entrada de la Kinkipedia vuelve a la de la Kinkipedia
		const wiki = await get(f.platform, 'wiki', 'nada', '0123456789abcdef.jpg');
		expect(wiki.headers.get('location')).toBe('/og-kinkipedia.jpg');
		expect(f.OG_RENDER).not.toHaveBeenCalled();
	});

	it('sin dibujante (vite dev) o sin base: la tarjeta de static/, por un rato', async () => {
		specs['wiki/Termino'] = wikiCardSpec({ title: 'Término', summary: 'Qué es.' });
		const f = fakePlatform({ render: false });
		const file = `${await objectCardHash(/** @type {any} */ (specs['wiki/Termino']))}.jpg`;
		const res = await get(f.platform, 'wiki', 'Termino', file);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/og-kinkipedia.jpg');
		expect(res.headers.get('cache-control')).toBe(OG_SHORT);
		expect(res.headers.get('x-og-fallback')).toBe('no-renderer');
		const noDb = await get({ env: {} }, 'evento', 'taller-inventado', file);
		expect(noDb.headers.get('location')).toBe('/og-default.jpg');
		expect(noDb.headers.get('x-og-fallback')).toBe('no-db');
	});

	it('si el dibujo falla: la tarjeta de static/, sin guardar nada', async () => {
		const f = fakePlatform();
		f.OG_RENDER.mockRejectedValueOnce(new Error('se rompio'));
		const res = await get(
			f.platform,
			'evento',
			'taller-inventado',
			`${await objectCardHash(EVENT)}.jpg`
		);
		expect(res.status).toBe(302);
		expect(res.headers.get('x-og-fallback')).toBe('render-error: Error: se rompio');
		await f.settle();
		expect(f.r2.size).toBe(0);
	});

	it('ya en la caché de Cloudflare: sale de ahí sin mirar la base', async () => {
		const f = fakePlatform();
		/** @type {Map<string, Response>} */
		const stored = new Map();
		f.platform.caches = {
			default: {
				match: vi.fn(async (/** @type {Request} */ req) => stored.get(req.url)?.clone()),
				put: vi.fn(async (/** @type {Request} */ req, /** @type {Response} */ res) => {
					stored.set(req.url, res);
				})
			}
		};
		const file = `${await objectCardHash(EVENT)}.jpg`;
		await get(f.platform, 'evento', 'taller-inventado', file);
		await f.settle();
		specFor.mockClear();
		const res = await get(f.platform, 'evento', 'taller-inventado', file);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(OG_IMMUTABLE);
		expect(specFor).not.toHaveBeenCalled();
	});

	it('un tipo que no existe o un archivo raro: 404', async () => {
		const f = fakePlatform();
		expect((await get(f.platform, 'default', 'x', '0123456789abcdef.jpg')).status).toBe(404);
		expect((await get(f.platform, 'evento', 'x', 'x.png')).status).toBe(404);
		expect((await get(f.platform, 'evento', 'x', '0123456789ABCDEF.jpg')).status).toBe(404);
	});
});
