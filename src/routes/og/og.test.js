/**
 * La imagen de una tarjeta de vista previa (`/og/<tarjeta>/<hash>.jpg`, docs/compartir.md): JPEG
 * con caché para siempre, guardada en R2, con las portadas de los próximos eventos; redirige si el
 * hash es viejo o si no se puede dibujar. El dibujante (WebAssembly, solo en el Worker) y los
 * bindings son de mentira; el dibujo de verdad lo prueba src/lib/server/ogRender.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLinkPreviewCache, linkPreviewState } from '$lib/server/linkPreview.js';
import { OG_IMMUTABLE, OG_SHORT } from '$lib/server/ogImage.js';
import { COLLAGE_TILES } from '$lib/utils/ogCollage.js';

const NOW = Date.parse('2026-10-11T12:00:00-03:00');
const day = 24 * 3600 * 1000;
/** @param {number} n */
const cover = (n) => `/media/img/${String(n).padStart(64, '0')}.webp`;
/** @param {number} n @param {number} start */
const event = (n, start) => ({
	path: `/calendario/evento-${n}`,
	meta: {
		layout: 'calendario',
		title: `Evento ${n}`,
		start: new Date(start).toISOString(),
		featured: cover(n)
	}
});
let posts = [event(1, NOW + 2 * day), event(2, NOW + 5 * day), event(3, NOW - day)];
vi.mock('$lib/server/contenido/posts.js', () => ({ sitePosts: async () => posts }));

const { GET } = await import('./[card]/[file]/+server.js');

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const THUMB = new Uint8Array([0xff, 0xd8, 9, 9, 0xff, 0xd9]);

/** Una base con `ticket_settings` vacío (sin textos cambiados). */
const fakeDB = {
	prepare: () => ({ bind: () => ({ first: async () => null }) })
};

function fakePlatform({ render = true, missing = /** @type {string[]} */ ([]) } = {}) {
	/** @type {Map<string, Uint8Array>} */
	const r2 = new Map();
	/** @type {Promise<unknown>[]} */
	const pending = [];
	const OG_RENDER = vi.fn(async () => JPEG);
	const env = {
		DB: fakeDB,
		MEDIA: {
			get: vi.fn(async (/** @type {string} */ key) => {
				if (r2.has(key)) {
					const bytes = /** @type {Uint8Array} */ (r2.get(key));
					return { arrayBuffer: async () => bytes.buffer };
				}
				if (key.startsWith('img/') && !missing.includes(key)) {
					return {
						body: new Response(new Uint8Array([1, 2, 3])).body,
						httpMetadata: { contentType: 'image/webp' },
						size: 3
					};
				}
				return null;
			}),
			put: vi.fn(async (/** @type {string} */ key, /** @type {Uint8Array} */ bytes) => {
				r2.set(key, bytes);
			})
		},
		IMAGES: {
			input: () => ({
				transform: () => ({
					output: async () => ({ response: () => new Response(THUMB) })
				})
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
		OG_RENDER,
		settle: () => Promise.all(pending)
	};
}

/**
 * @param {any} platform
 * @param {string} card
 * @param {string} file
 */
async function get(platform, card, file) {
	const url = new URL(`https://sitio.test/og/${card}/${file}`);
	try {
		return await GET(/** @type {any} */ ({ params: { card, file }, platform, url, fetch }));
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

/** @param {any} platform @param {'default' | 'calendario' | 'amigues'} card */
async function currentUrl(platform, card) {
	return /** @type {string} */ ((await linkPreviewState(platform, NOW)).cards[card]?.url);
}

beforeEach(() => {
	clearLinkPreviewCache();
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	posts = [event(1, NOW + 2 * day), event(2, NOW + 5 * day), event(3, NOW - day)];
});

describe('/og/<tarjeta>/<hash>.jpg', () => {
	it('dibuja un JPEG con caché para siempre y lo guarda en R2', async () => {
		const f = fakePlatform();
		const url = await currentUrl(f.platform, 'calendario');
		const [, , card, file] = url.split('/');
		const res = await get(f.platform, card, file);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(res.headers.get('cache-control')).toBe(OG_IMMUTABLE);
		expect(res.headers.get('cache-control')).toContain('immutable');
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
		// el árbol que se dibujó: las portadas (miniaturas JPEG), repetidas hasta llenar el mosaico
		expect(f.OG_RENDER).toHaveBeenCalledTimes(1);
		const [tree, opts] = /** @type {any} */ (f.OG_RENDER.mock.calls[0]);
		expect(opts).toMatchObject({ width: 1200, height: 630 });
		expect(opts.fonts.map((/** @type {any} */ x) => x.name)).toEqual(['Lilita One', 'Lato']);
		const json = JSON.stringify(tree);
		expect(json).toContain('Calendario');
		expect(json).toContain('Próximos talleres, encuentros y eventos cuir y kinky');
		expect(json.split('data:image/jpeg;base64,').length - 1).toBe(COLLAGE_TILES);
		await f.settle();
		expect([...f.r2.keys()]).toEqual([`og/calendario-${file.slice(0, 16)}.jpg`]);
	});

	it('la segunda vez sale de R2, sin volver a dibujar', async () => {
		const f = fakePlatform();
		const [, , card, file] = (await currentUrl(f.platform, 'default')).split('/');
		await get(f.platform, card, file);
		await f.settle();
		const res = await get(f.platform, card, file);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(OG_IMMUTABLE);
		expect(f.OG_RENDER).toHaveBeenCalledTimes(1);
	});

	it('cambian las portadas: otra dirección, y la vieja redirige a la nueva', async () => {
		const f = fakePlatform();
		const old = await currentUrl(f.platform, 'amigues');
		posts = [event(4, NOW + day), ...posts];
		clearLinkPreviewCache();
		const now = await currentUrl(f.platform, 'amigues');
		expect(now).not.toBe(old);
		const [, , card, file] = old.split('/');
		const res = await get(f.platform, card, file);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe(now);
		expect(res.headers.get('cache-control')).toBe(OG_SHORT);
	});

	it('sin dibujante (vite dev) o sin base: la tarjeta de static/, por un rato', async () => {
		const f = fakePlatform({ render: false });
		const [, , card, file] = (await currentUrl(f.platform, 'calendario')).split('/');
		const res = await get(f.platform, card, file);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/og-calendario.jpg');
		expect(res.headers.get('cache-control')).toBe(OG_SHORT);
		expect(res.headers.get('x-og-fallback')).toBe('no-renderer');
		const noDb = await get({ env: {} }, 'wiki', '0123456789abcdef.jpg');
		expect(noDb.status).toBe(302);
		expect(noDb.headers.get('location')).toBe('/og-kinkipedia.jpg');
		expect(noDb.headers.get('x-og-fallback')).toBe('no-db');
	});

	it('si falta una portada, la manda igual pero no la guarda', async () => {
		const f = fakePlatform({ missing: [cover(2).slice('/media/'.length)] });
		const [, , card, file] = (await currentUrl(f.platform, 'calendario')).split('/');
		const res = await get(f.platform, card, file);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(OG_SHORT);
		await f.settle();
		expect(f.r2.size).toBe(0);
	});

	it('ya en la caché de Cloudflare: sale de ahí sin mirar la base ni R2', async () => {
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
		const [, , card, file] = (await currentUrl(f.platform, 'calendario')).split('/');
		await get(f.platform, card, file);
		await f.settle();
		expect([...stored.keys()]).toEqual([`https://sitio.test/og/${card}/${file}`]);

		// Otro isolate (sin lo recordado de la vista previa) y una base que no se puede tocar.
		clearLinkPreviewCache();
		const prepare = vi.fn(() => {
			throw new Error('no debería leer la base');
		});
		f.platform.env.DB = { prepare };
		f.platform.env.MEDIA.get.mockClear();
		const res = await get(f.platform, card, file);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(OG_IMMUTABLE);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
		expect(prepare).not.toHaveBeenCalled();
		expect(f.platform.env.MEDIA.get).not.toHaveBeenCalled();
		expect(f.OG_RENDER).toHaveBeenCalledTimes(1);
	});

	it('una tarjeta que no existe o un archivo raro: 404', async () => {
		const f = fakePlatform();
		expect((await get(f.platform, 'otra', '0123456789abcdef.jpg')).status).toBe(404);
		expect((await get(f.platform, 'calendario', 'x.png')).status).toBe(404);
		expect((await get(f.platform, 'calendario', '0123456789abcdef.png')).status).toBe(404);
	});
});
