/**
 * Un GET anónimo entero a cada página pública (con lo que suman `hooks.server.js` y los dos
 * layouts), en más situaciones que src/routes/(content)/pedido-consultas.test.js (la prueba de la
 * CI, que mide frío, caliente y tibio): cuántas idas a D1 hace y en cuántas tandas en fila (cada
 * tanda en fila es una ida y vuelta a la base, que está lejos: ~130 ms desde Buenos Aires).
 *
 * - **frío**: un isolate nuevo, sin nada en la caché de Cloudflare (`caches.default`);
 * - **frío+caché**: un isolate nuevo, con las listas ya guardadas en la caché de Cloudflare por
 *   otro isolate (lo común después de un deploy o de un rato sin visitas);
 * - **caliente**: un pedido a la misma página antes, en el mismo isolate;
 * - **vecino**: el isolate ya atendió otra página (el inicio; para el inicio, /material), pero no
 *   esta;
 * - **tibio**: caliente, pero 31 s después (las cachés de 30 s del isolate, vencidas);
 * - **tibio-25**: caliente, pero 25 s después (las cachés de 30 s por vencer: se renuevan sin
 *   esperar).
 *
 * Es una medición a pedido, no una prueba de la CI: `npm run medir:publico`
 * (vitest.medir.config.js). Imprime la tabla (idas/tandas en fila); con `KV_CONSULTAS=detalle`,
 * además cada consulta por tanda; con `KV_D1_TANDAS=off`, sin las tandas automáticas (y quién pidió
 * cada consulta). Falla si una página hace más tandas en fila que su tope. La semilla pública
 * (src/lib/server/semilla) más un evento futuro inventado con venta, lugar y autores. D1 de
 * miniflare.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { loadSeed } from '$lib/server/semilla/index.js';
import etiquetas from '$lib/server/semilla/etiquetas.json';
import wiki from '$lib/server/semilla/wiki.json';
import amigues from '$lib/server/semilla/amigues.json';
import calendario from '$lib/server/semilla/calendario.json';
import material from '$lib/server/semilla/material.json';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 300_000 });

const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

/** Cada consulta tarda esto de más, para contar bien lo que sale a la par. */
const DELAY_MS = 15;
const DETAIL = process.env.KV_CONSULTAS === 'detalle';
const TANDAS_OFF = process.env.KV_D1_TANDAS === 'off';
const BY = 'admin-de-prueba';
const EVENT = 'encuentro-futuro-inventado';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;

beforeAll(async () => {
	t = await createTestDB();
	const seeded = await loadSeed(
		t.db,
		{ etiquetas, wiki, amigues, calendario, material },
		{ actor: BY }
	);
	expect(seeded.errors).toEqual([]);
	await makeProfile(t.db, { title: 'Autore Inventade', slug: 'autore-inventade' });
	const venue = await makeProfile(t.db, {
		title: 'Galpón Inventado',
		kind: 'lugar',
		data: { address: 'Calle Del Lugar 222', city: 'Ciudad Inventada', venue_privacy: 'public' }
	});
	await seedPosts(t.db, [
		{
			category: 'calendario',
			postID: EVENT,
			title: 'Encuentro Futuro Inventado',
			summary: 'Un evento de prueba',
			published_date: '2026-09-01Z-03:00',
			start: '2099-03-06T20:00-03:00',
			status: 'abierto',
			modalidad: 'presencial',
			tags: ['BDSM'],
			authors: ['autore-inventade'],
			payment_methods: ['transferencia'],
			tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
		}
	]);
	const venues = await import('$lib/server/amigues/venues.js');
	await venues.setEventVenue(t.db, { eventSlug: EVENT, venueId: venue.id, privacy: null, by: BY });
});
afterAll(async () => {
	fake.event = null;
	vi.unstubAllGlobals();
	await t?.dispose();
});
afterEach(() => {
	vi.useRealTimers();
});

/**
 * Una caché de Cloudflare de mentira (`caches.default`), compartida por los isolates de la
 * medición: solo `match` y `put`, como la usa src/lib/server/contenido/posts.js.
 */
function fakeEdgeCache() {
	/** @type {Map<string, { body: string, headers: [string, string][] }>} */
	const saved = new Map();
	return {
		/** @param {string} key */
		match: async (key) => {
			const hit = saved.get(String(key));
			return hit ? new Response(hit.body, { headers: hit.headers }) : undefined;
		},
		/** @param {string} key @param {Response} response */
		put: async (key, response) => {
			saved.set(String(key), {
				body: await response.text(),
				headers: [...response.headers.entries()]
			});
		}
	};
}

/** fetch de fondo.kinkyvibe.ar (20 %), sin red. */
const fondoFetch = async () =>
	new Response(JSON.stringify({ percent: 20 }), {
		headers: { 'content-type': 'application/json' }
	});

/**
 * @typedef {{ path: string, route: string, params: Record<string, string>, page: () => Promise<{ load: Function }> }} Page
 */

/** @type {Page[]} */
const PAGES = [
	{ path: '/', route: '/(content)', params: {}, page: () => import('./+page.server.js') },
	{
		path: '/calendario',
		route: '/(content)/calendario',
		params: {},
		page: () => import('./calendario/+page.server.js')
	},
	{
		path: `/calendario/${EVENT}`,
		route: '/(content)/calendario/[event]',
		params: { event: EVENT },
		page: () => import('./calendario/[event]/+page.server.js')
	},
	{
		path: '/material',
		route: '/(content)/material',
		params: {},
		page: () => import('./material/+page.server.js')
	},
	{
		path: '/material/6-tips-para-tops',
		route: '/(content)/material/[post]',
		params: { post: '6-tips-para-tops' },
		page: () => import('./material/[post]/+page.server.js')
	},
	{
		path: '/amigues',
		route: '/(content)/amigues',
		params: {},
		page: () => import('./amigues/+page.server.js')
	},
	{
		path: '/amigues/autore-inventade',
		route: '/(content)/amigues/[profile]',
		params: { profile: 'autore-inventade' },
		page: () => import('./amigues/[profile]/+page.server.js')
	},
	{
		path: '/wiki/BDSM',
		route: '/(content)/wiki/[term]',
		params: { term: 'BDSM' },
		page: () => import('./wiki/[term]/+page.server.js')
	},
	{
		path: '/todo',
		route: '/(content)/todo',
		params: {},
		page: () => import('./todo/+page.server.js')
	}
];

const MODES = ['frío', 'frío+caché', 'caliente', 'vecino', 'tibio', 'tibio-25'];

/**
 * Lo más que puede hacer cada página en tandas en fila (lo medido, para ver si empeoró): con las
 * tandas automáticas, 1 en caliente y 2 como mucho en frío o con las cachés de 30 s vencidas.
 * Sin tandas (`KV_D1_TANDAS=off`) son más: solo se imprimen.
 * @type {Record<string, Record<string, number>>}
 */
const MAX_WAVES = Object.fromEntries(
	PAGES.map((p) => [
		p.path,
		{
			frío: p.path === '/material' ? 1 : 2,
			'frío+caché': p.path === '/material' ? 1 : 2,
			caliente: 1,
			vecino: 1,
			tibio: p.path === '/material' || p.path === '/amigues' ? 1 : 2,
			'tibio-25': 1
		}
	])
);

/**
 * Los módulos de un isolate (`vi.resetModules` antes: uno nuevo) y una base que cuenta.
 * @param {() => Promise<{ load: Function }>} page
 */
async function isolate(page) {
	vi.resetModules();
	const counted = countingDB(t.db, { delayMs: DELAY_MS, trace: DETAIL });
	return {
		counted,
		platform: {
			env: { ...t.env, DB: counted.db, ...(TANDAS_OFF ? { KV_D1_TANDAS: 'off' } : {}) }
		},
		hooks: await import('../../hooks.server.js'),
		root: await import('../+layout.server.js'),
		content: await import('./+layout.server.js'),
		/** @type {Map<string, { load: Function }>} */
		pages: new Map([[page.toString(), await page()]])
	};
}

/**
 * Un GET anónimo a `p`, como lo atiende SvelteKit: `handle` de hooks.server.js y, adentro de su
 * `resolve`, los dos layouts y la página a la par (ninguno espera a `parent()`).
 * @param {Awaited<ReturnType<typeof isolate>>} iso
 * @param {Page} p
 */
async function request(iso, p) {
	const key = p.page.toString();
	if (!iso.pages.has(key)) iso.pages.set(key, await p.page());
	const page = /** @type {{ load: Function }} */ (iso.pages.get(key));
	const url = new URL(p.path, 'https://kinkyvibe.ar');
	const cookies = { get: () => undefined, delete: () => {}, set: () => {} };
	const event = /** @type {any} */ ({
		url,
		params: p.params,
		route: { id: p.route },
		request: new Request(url),
		platform: iso.platform,
		cookies,
		fetch: fondoFetch,
		locals: { user: undefined, user_token: '' },
		setHeaders: () => {},
		parent: async () => ({})
	});
	fake.event = event;
	try {
		await iso.hooks.handle({
			event,
			resolve: async () => {
				const [, , data] = await Promise.all([
					iso.root.load(event),
					iso.content.load(event),
					page.load(event)
				]);
				// «Por …» de un evento o un material: les autores pueden llegar como promesa.
				await data?.post?.authorsProfiles;
				return new Response('ok');
			}
		});
	} finally {
		fake.event = null;
	}
}

/**
 * Las cuentas de una página en un modo.
 * @param {Page} p
 * @param {string} mode
 * @param {ReturnType<typeof fakeEdgeCache>} edge
 */
async function measure(p, mode, edge) {
	vi.stubGlobal('caches', mode === 'frío+caché' ? { default: edge } : undefined);
	if (mode === 'frío+caché') {
		// Otro isolate guarda las listas en la caché de Cloudflare; el que se mide es nuevo.
		await request(await isolate(p.page), p);
	}
	const iso = await isolate(p.page);
	/** @param {Page} q */
	const warm = async (q) => {
		await request(iso, q);
	};
	if (mode === 'caliente' || mode === 'tibio' || mode === 'tibio-25') await warm(p);
	if (mode === 'vecino') await warm(p.path === '/' ? PAGES[3] : PAGES[0]);
	if (mode === 'tibio' || mode === 'tibio-25') {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(Date.now() + (mode === 'tibio' ? 31_000 : 25_000));
	}
	iso.counted.reset();
	await request(iso, p);
	vi.useRealTimers();
	if (DETAIL) console.info(`[${p.path}, ${mode}]\n${iso.counted.describe()}`);
	return { queries: iso.counted.queries, waves: iso.counted.waves };
}

describe('un pedido anónimo a cada página pública', () => {
	it('idas y tandas en fila', async () => {
		const edge = fakeEdgeCache();
		/** @type {string[]} */
		const rows = [];
		/** @type {string[]} */
		const over = [];
		for (const p of PAGES) {
			/** @type {string[]} */
			const cells = [];
			for (const mode of MODES) {
				const r = await measure(p, mode, edge);
				cells.push(`${r.queries}/${r.waves}`);
				const max = MAX_WAVES[p.path]?.[mode];
				if (!TANDAS_OFF && max !== undefined && r.waves > max)
					over.push(`${p.path} ${mode}: ${r.waves} > ${max}`);
			}
			rows.push(`| ${p.path} | ${cells.join(' | ')} |`);
		}
		console.info(
			[
				`Idas/tandas en fila${TANDAS_OFF ? ' (KV_D1_TANDAS=off)' : ''}:`,
				`| página | ${MODES.join(' | ')} |`,
				`| --- | ${MODES.map(() => '---').join(' | ')} |`,
				...rows
			].join('\n')
		);
		expect(over).toEqual([]);
	});
});
