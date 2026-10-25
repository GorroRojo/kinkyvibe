/**
 * Un pedido anónimo entero a cada página pública, con lo que suman `hooks.server.js` (el árbol de
 * etiquetas; sin cookie, `loadMember` no consulta) y los dos layouts: cuántas consultas hace a la
 * base y en cuántas tandas en fila (cada tanda es una ida y vuelta a D1, que está lejos).
 *
 * - **frío**: un isolate nuevo (nada recordado de otro pedido);
 * - **caliente**: un pedido antes en el mismo isolate;
 * - **tibio**: caliente, pero 31 s después (las cachés de 30 s del isolate, el árbol de etiquetas,
 *   los interruptores y la vista previa al compartir, vencidas). En un sitio con pocas visitas es
 *   el caso más común.
 *
 * Con `KV_CONSULTAS=1`, las cuentas; con `KV_CONSULTAS=detalle`, cada consulta por tanda y quién
 * la pidió. La semilla pública (src/lib/server/semilla) más un evento futuro inventado con venta,
 * lugar y autores. D1 de miniflare.
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

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

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
	await t?.dispose();
});
afterEach(() => {
	vi.useRealTimers();
});

/**
 * Lo más que puede hacer cada página (idas a la base: una tanda de D1 es una) en frío, en caliente
 * y en tibio. Entre paréntesis, lo que hacía antes de las tandas automáticas (consultas sueltas).
 * @type {Record<string, Record<string, number>>}
 */
const BOUNDS = {
	'/': { frío: 7, caliente: 2, tibio: 5 }, // (9, 2, 7)
	'/calendario': { frío: 7, caliente: 2, tibio: 5 }, // (10, 3, 8)
	'/material': { frío: 4, caliente: 1, tibio: 2 }, // (5, 1, 3)
	'/amigues': { frío: 4, caliente: 1, tibio: 2 }, // (7, 1, 3)
	'/wiki/BDSM': { frío: 8, caliente: 2, tibio: 6 }, // (10, 2, 8)
	[`/calendario/${EVENT}`]: { frío: 4, caliente: 3, tibio: 4 }, // (20, 15, 18)
	'/material/6-tips-para-tops': { frío: 4, caliente: 3, tibio: 4 }, // (10, 6, 8)
	'/amigues/autore-inventade': { frío: 5, caliente: 2, tibio: 3 } // (10, 5, 8)
};

/**
 * Las cuentas como quedan si cada una está dentro de su tope (si no, la cuenta tal cual: el
 * `toEqual` muestra cuál se pasó).
 * @param {Record<string, { queries: number, waves: number }>} out
 * @param {Record<string, number>} bounds
 * @returns {Record<string, unknown>}
 */
function withinBounds(out, bounds) {
	return Object.fromEntries(
		Object.entries(out).map(([k, v]) => [
			k,
			v.queries <= bounds[k] ? v : { ...v, queries: `≤ ${bounds[k]}` }
		])
	);
}

/** fetch de fondo.kinkyvibe.ar (20 %), sin red. */
const fondoFetch = async () =>
	new Response(JSON.stringify({ percent: 20 }), {
		headers: { 'content-type': 'application/json' }
	});

/**
 * Los módulos de un isolate (`vi.resetModules` antes: uno nuevo) y una base que cuenta.
 * @param {() => Promise<{ load: Function }>} page el `+page.server.js` de la ruta
 */
async function isolate(page) {
	vi.resetModules();
	const counted = countingDB(t.db, { delayMs: DELAY_MS, trace: DETAIL });
	return {
		counted,
		platform: { env: { ...t.env, DB: counted.db } },
		repo: await import('$lib/server/contenido/repo.js'),
		db: await import('$lib/server/db'),
		tags: await import('$lib/server/etiquetas/source.js'),
		member: await import('$lib/server/cuentas/web.js'),
		root: await import('../+layout.server.js'),
		content: await import('./+layout.server.js'),
		page: await page()
	};
}

/**
 * Un GET anónimo a `path`, como lo atiende SvelteKit: los hooks (en fila), después los dos layouts
 * y la página a la par (ninguno espera a `parent()`).
 * @param {Awaited<ReturnType<typeof isolate>>} iso
 * @param {string} path
 * @param {Record<string, string>} params
 */
async function request(iso, path, params) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	const cookies = { get: () => undefined, delete: () => {}, set: () => {} };
	const event = /** @type {any} */ ({
		url,
		params,
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
		// hooks.server.js
		iso.repo.setContentDB(iso.db.getDB(iso.platform));
		await iso.tags.applySiteTags(iso.platform);
		await iso.member.loadMember(event);
		const [, , page] = await Promise.all([
			iso.root.load(event),
			iso.content.load(event),
			iso.page.load(event)
		]);
		// «Por …» de un evento o un material: les autores pueden llegar como promesa.
		await page?.post?.authorsProfiles;
		return page;
	} finally {
		fake.event = null;
	}
}

/**
 * Las cuentas de `path` en frío, en caliente y en tibio.
 * @param {string} path
 * @param {Record<string, string>} params
 * @param {() => Promise<any>} page
 */
async function measure(path, params, page) {
	const iso = await isolate(page);
	/** @type {Record<string, { queries: number, waves: number }>} */
	const out = {};
	for (const when of ['frío', 'caliente', 'tibio']) {
		if (when === 'tibio') {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(Date.now() + 31_000);
		}
		iso.counted.reset();
		await request(iso, path, params);
		out[when] = { queries: iso.counted.queries, waves: iso.counted.waves };
		if (DETAIL) console.info(`[${path}, ${when}]\n${iso.counted.describe()}`);
	}
	// Idas a la base (una tanda es una): con las tandas automáticas, a lo sumo una por tanda en fila.
	// En main, antes de las tandas, eran más (entre paréntesis, frío/caliente/tibio).
	expect(out).toEqual(withinBounds(out, BOUNDS[path]));
	if (process.env.KV_CONSULTAS) {
		console.info(
			`[${path}] ` +
				Object.entries(out)
					.map(([k, v]) => `${k}: ${v.queries} consultas en ${v.waves} tandas`)
					.join('; ')
		);
	}
	return out;
}

describe('un pedido anónimo a cada página pública, en pocas tandas', () => {
	it('/', async () => {
		const r = await measure('/', {}, () => import('./+page.server.js'));
		expect(r['caliente'].waves).toBeLessThanOrEqual(r['frío'].waves);
	});

	it('/calendario', async () => {
		const r = await measure('/calendario', {}, () => import('./calendario/+page.server.js'));
		expect(r['caliente'].waves).toBeLessThanOrEqual(r['frío'].waves);
	});

	it('/material', async () => {
		const r = await measure('/material', {}, () => import('./material/+page.server.js'));
		expect(r['caliente'].waves).toBeLessThanOrEqual(r['frío'].waves);
	});

	it('/amigues', async () => {
		const r = await measure('/amigues', {}, () => import('./amigues/+page.server.js'));
		expect(r['caliente'].waves).toBeLessThanOrEqual(r['frío'].waves);
	});

	it('/wiki/BDSM', async () => {
		const r = await measure(
			'/wiki/BDSM',
			{ term: 'BDSM' },
			() => import('./wiki/[term]/+page.server.js')
		);
		expect(r['caliente'].waves).toBeLessThanOrEqual(r['frío'].waves);
	});

	it('/calendario/<evento>', async () => {
		const r = await measure(
			`/calendario/${EVENT}`,
			{ event: EVENT },
			() => import('./calendario/[event]/+page.server.js')
		);
		expect(r['caliente'].waves).toBeLessThanOrEqual(r['frío'].waves);
	});

	it('/material/<post>', async () => {
		const r = await measure(
			'/material/6-tips-para-tops',
			{ post: '6-tips-para-tops' },
			() => import('./material/[post]/+page.server.js')
		);
		expect(r['caliente'].waves).toBeLessThanOrEqual(r['frío'].waves);
	});

	it('/amigues/<perfil>', async () => {
		const r = await measure(
			'/amigues/autore-inventade',
			{ profile: 'autore-inventade' },
			() => import('./amigues/[profile]/+page.server.js')
		);
		expect(r['caliente'].waves).toBeLessThanOrEqual(r['frío'].waves);
	});
});
