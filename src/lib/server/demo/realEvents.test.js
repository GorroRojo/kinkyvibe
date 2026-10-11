/**
 * Copias de eventos públicos en el modo demo (./realEvents.js, docs/demo.md «Copias de
 * producción»). Nunca usa la red: `fetch` es siempre un doble con datos obviamente inventados.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createTestDB } from '../db/testing.js';
import { splitMarkdown } from '../../utils/eventDraft.js';
import { parseTicketConfig } from '../tickets/config.js';
import {
	COPY_MARK_KEY,
	COPY_MARKER,
	PUBLIC_SITE,
	REAL_EVENTS_MAX,
	loadRealEventCopies,
	pickRealEvents,
	publicImageUrl,
	realEventInput
} from './realEvents.js';
import { reloadDemoData, seedTargetProblem } from './seed.js';
import { thumbURL } from '../../utils/index.js';
import { isPublicMediaUrl } from '../../utils/media.js';

const NOW = Date.parse('2031-03-10T15:00:00Z');
const HASH = 'a'.repeat(64);

/**
 * Un evento como lo devuelve `/api/posts` (inventado).
 * @param {string} slug
 * @param {string} start
 * @param {Record<string, unknown>} [meta]
 */
function post(slug, start, meta = {}) {
	return {
		meta: {
			title: `Fiesta Inventada ${slug}`,
			summary: 'Una fiesta que no existe, para las pruebas.',
			tags: ['español', 'AMBA', 'Serie Inventada: Edición Especial'],
			layout: 'calendario',
			category: 'calendario',
			authors: ['KinkyVibe'],
			status: 'abierto',
			start,
			end: start.replace(/T\d\d:\d\d/, 'T23:30'),
			link: 'https://example.invalid/formulario-de-entradas',
			link_text: 'ENTRADAS',
			featured: `/media/img/${HASH}.webp`,
			location: 'Barrio Inventado',
			location_name: 'Galpón Inventado',
			published_date: '2031-02-01Z-03:00',
			postID: slug,
			...meta
		},
		authorsProfiles: [],
		path: `/calendario/${slug}`
	};
}

/**
 * Lo que mostraría el sitio público: eventos que vienen, pasados, material y cosas que no sirven.
 * @type {any[]}
 */
const PUBLIC_POSTS = [
	post('fiesta-inventada-2031-02', '2031-02-20T22:00-03:00'),
	post('fiesta-inventada-2031-03', '2031-03-20T20:00-03:00'),
	post('charla-inventada-2031-03', '2031-03-12T19:00-03:00', {
		// Configuración de entradas en la metadata pública: nunca se copia.
		tickets: [{ id: 'general', name: 'General', price: 1000, capacity: 10 }],
		payment_methods: ['mercadopago'],
		personas: [{ perfil: 'perfil-inventado', rol: 'Organiza' }]
	}),
	post('fiesta-vieja-2031-01', '2031-01-15T22:00-03:00'),
	post('redirige-2031-03', '2031-03-15T20:00-03:00', { redirect: true }),
	post('demo-colado-2031-03', '2031-03-16T20:00-03:00'),
	post('sin-fecha', 'no es una fecha'),
	{ meta: { category: 'material', title: 'Material inventado', postID: 'material-x' } },
	{ meta: null }
];

/**
 * Un `fetch` falso que devuelve `body` y anota lo que le pidieron.
 * @param {unknown} body
 * @param {{ status?: number }} [opts]
 */
function fakeFetch(body, { status = 200 } = {}) {
	/** @type {{ url: string, init: any }[]} */
	const calls = [];
	const fn = /** @type {typeof fetch} */ (
		/** @type {unknown} */ (
			async (/** @type {any} */ url, /** @type {any} */ init) => {
				calls.push({ url: String(url), init });
				return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
					status,
					headers: { 'content-type': 'application/json' }
				});
			}
		)
	);
	return { fn, calls };
}

describe('pickRealEvents', () => {
	it('prefers upcoming events (soonest first), then the most recent past ones', () => {
		const picked = pickRealEvents(PUBLIC_POSTS, { now: NOW }).map((p) => p.meta?.postID);
		expect(picked).toEqual([
			'charla-inventada-2031-03',
			'fiesta-inventada-2031-03',
			'fiesta-inventada-2031-02',
			'fiesta-vieja-2031-01'
		]);
		expect(pickRealEvents(PUBLIC_POSTS, { now: NOW, max: 1 }).map((p) => p.meta?.postID)).toEqual([
			'charla-inventada-2031-03'
		]);
	});

	it('skips non-events, redirects, demo-* slugs, bad dates and anything that is not a list', () => {
		const picked = pickRealEvents(PUBLIC_POSTS, { now: NOW }).map((p) => String(p.meta?.postID));
		for (const bad of ['redirige-2031-03', 'demo-colado-2031-03', 'sin-fecha', 'material-x'])
			expect(picked).not.toContain(bad);
		expect(pickRealEvents({ not: 'a list' }, { now: NOW })).toEqual([]);
		expect(pickRealEvents(null, { now: NOW })).toEqual([]);
	});

	it('caps the number of copies', () => {
		const many = Array.from({ length: 40 }, (_, i) =>
			post(`fiesta-inventada-${i}`, `2031-04-${String((i % 28) + 1).padStart(2, '0')}T20:00-03:00`)
		);
		expect(pickRealEvents(many, { now: NOW })).toHaveLength(REAL_EVENTS_MAX);
	});
});

describe('realEventInput: public metadata → seed event', () => {
	const input = /** @type {NonNullable<ReturnType<typeof realEventInput>>} */ (
		realEventInput(PUBLIC_POSTS[2])
	);
	const fm = parse(splitMarkdown(input.markdown).frontmatter);

	it('is marked as a copy: demo-copia-* slug, title, source link, marker and notice', () => {
		expect(input.slug).toBe('demo-copia-charla-inventada-2031-03');
		expect(input.slot).toBe('copia-charla-inventada-2031-03');
		expect(input.venueId).toBeNull();
		expect(fm.title).toBe('Fiesta Inventada charla-inventada-2031-03 (copia de producción)');
		expect(fm[COPY_MARK_KEY]).toBe(`${PUBLIC_SITE}/calendario/charla-inventada-2031-03`);
		expect(input.markdown).toContain(COPY_MARKER);
		expect(splitMarkdown(input.markdown).body).toContain('Copia de producción');
	});

	it('copies only the public fields, never tickets, action links or personas', () => {
		expect(fm).toMatchObject({
			summary: 'Una fiesta que no existe, para las pruebas.',
			tags: ['español', 'AMBA', 'Serie Inventada: Edición Especial'],
			authors: ['KinkyVibe'],
			status: 'abierto',
			start: '2031-03-12T19:00-03:00',
			end: '2031-03-12T23:30-03:00',
			location: 'Barrio Inventado',
			location_name: 'Galpón Inventado',
			published_date: '2031-02-01Z-03:00'
		});
		for (const key of ['tickets', 'payment_methods', 'link', 'link_text', 'personas', 'redirect'])
			expect(fm).not.toHaveProperty(key);
		expect(parseTicketConfig(fm, { fondoPercent: 20 })).toBeNull();
	});

	it('points the image at the public site', () => {
		expect(fm.featured).toBe(`${PUBLIC_SITE}/media/img/${HASH}.webp`);
		expect(publicImageUrl(`/media/img/${HASH}.webp`)).toBe(
			`https://kinkyvibe.ar/media/img/${HASH}.webp`
		);
		expect(publicImageUrl(`${PUBLIC_SITE}/media/img/${HASH}.png`)).toBe(
			`${PUBLIC_SITE}/media/img/${HASH}.png`
		);
		// Only https library images of the public site itself (old repo images are not copied).
		for (const bad of [
			`https://example.invalid/media/img/${HASH}.png`,
			`http://kinkyvibe.ar/media/img/${HASH}.png`,
			`${PUBLIC_SITE}/media/img/${HASH}.png?x=1`,
			'/src/lib/assets/serie-inventada.webp',
			'javascript:alert(1)',
			'1'
		])
			expect(publicImageUrl(bad)).toBeNull();
		expect(publicImageUrl(undefined)).toBeNull();
	});

	it('the site shows that image as is (thumbURL), and only that kind of absolute URL', async () => {
		const url = `${PUBLIC_SITE}/media/img/${HASH}.webp`;
		expect(isPublicMediaUrl(url)).toBe(true);
		expect(await thumbURL('calendario', 'demo-copia-x', url)).toBe(url);
		expect(isPublicMediaUrl(`https://example.invalid/media/img/${HASH}.webp`)).toBe(false);
		expect(
			await thumbURL('calendario', 'x', `https://example.invalid/media/img/${HASH}.webp`)
		).toBeUndefined();
	});

	it('survives YAML-hostile text and drops unknown statuses', () => {
		const odd = realEventInput(
			post('fiesta-rara-2031-03', '2031-03-20T20:00-03:00', {
				title: "Fiesta: «rara» # con 'comillas'\n y salto",
				status: 'inventado'
			})
		);
		const meta = parse(splitMarkdown(String(odd?.markdown)).frontmatter);
		expect(meta.title).toBe("Fiesta: «rara» # con 'comillas' y salto (copia de producción)");
		expect(meta).not.toHaveProperty('status');
		const start = '2031-03-20T20:00-03:00';
		expect(
			realEventInput({ meta: { title: 'x', start }, path: '/calendario/Con Espacios' })
		).toBeNull();
		expect(realEventInput({ meta: { title: 'x', start, postID: '../secreto' } })).toBeNull();
		expect(realEventInput({ meta: { title: 'x' }, path: '/calendario/sin-fecha' })).toBeNull();
		expect(realEventInput({ meta: { start }, path: '/calendario/sin-titulo' })).toBeNull();
	});
});

describe('loadRealEventCopies: never fails, falls back to no copies', () => {
	it('asks the public API with a read-only GET', async () => {
		const { fn, calls } = fakeFetch(PUBLIC_POSTS);
		const r = await loadRealEventCopies(fn, { now: NOW });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('https://kinkyvibe.ar/api/posts');
		expect(calls[0].init.method).toBe('GET');
		expect(calls[0].init).not.toHaveProperty('body');
		expect(r.fallback).toBeNull();
		expect(r.copied).toBe(4);
		expect(r.inputs.map((i) => i.slug)).toContain('demo-copia-fiesta-inventada-2031-03');
	});

	it('without fetch, on a network error, a bad status, bad JSON or no usable events', async () => {
		const failing = /** @type {typeof fetch} */ (
			/** @type {unknown} */ (
				async () => {
					throw new TypeError('fetch failed (sin red en la prueba)');
				}
			)
		);
		const cases = [
			null,
			failing,
			fakeFetch(PUBLIC_POSTS, { status: 503 }).fn,
			fakeFetch('<html>no es JSON</html>').fn,
			fakeFetch({ posts: [] }).fn,
			fakeFetch([]).fn,
			fakeFetch([PUBLIC_POSTS[4], PUBLIC_POSTS[7]]).fn
		];
		for (const fn of cases) {
			const r = await loadRealEventCopies(fn, { now: NOW });
			expect(r.copied).toBe(0);
			expect(r.inputs).toEqual([]);
			expect(r.fallback).toEqual(expect.any(String));
		}
	});
});

describe('seedTargetProblem: the seed refuses to run in production', () => {
	it('only a preview deploy (not main, not empty) or the local database', () => {
		expect(seedTargetProblem({ where: 'local' })).toBeNull();
		expect(seedTargetProblem({ where: 'preview', branch: 'claude/algo' })).toBeNull();
		expect(seedTargetProblem({ where: 'preview', branch: 'main' })).toMatch(/producción/);
		expect(seedTargetProblem({ where: 'preview', branch: ' main ' })).toMatch(/producción/);
		expect(seedTargetProblem({ where: 'preview', branch: '' })).toMatch(/preview/);
		expect(seedTargetProblem({ where: 'preview' })).toMatch(/preview/);
		expect(seedTargetProblem({ where: 'production' })).not.toBeNull();
		expect(seedTargetProblem({})).not.toBeNull();
		expect(seedTargetProblem(undefined)).not.toBeNull();
	});

	it('reloadDemoData touches nothing (and fetches nothing) when refused', async () => {
		/** @type {string[]} */
		const touched = [];
		const db = /** @type {any} */ (
			new Proxy(
				{},
				{
					get(_, prop) {
						touched.push(String(prop));
						throw new Error('la base no se tendría que tocar');
					}
				}
			)
		);
		const { fn, calls } = fakeFetch(PUBLIC_POSTS);
		for (const target of [
			{ where: 'preview', branch: 'main', fetch: fn },
			{ where: 'preview', branch: '', fetch: fn },
			{ fetch: fn },
			undefined
		]) {
			await expect(reloadDemoData(db, /** @type {any} */ (target))).rejects.toThrow(
				/no se cargan acá/
			);
		}
		expect(touched).toEqual([]);
		expect(calls).toEqual([]);
	});
});

describe('reloadDemoData with copies (D1, fetch mocked)', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});

	const now = Date.parse('2031-03-10T15:00:00Z');
	async function eventRows() {
		const { results } = await t.db
			.prepare(
				`SELECT id, slug, title, data, deleted_at,
					json_extract(data, '$.extra.demo_slot') AS slot,
					json_extract(data, '$.extra.${COPY_MARK_KEY}') AS original
				FROM objects WHERE type = 'evento' ORDER BY id`
			)
			.all();
		return /** @type {any[]} */ (results);
	}
	/** The edge-case fakes that must always be there, by what they test. */
	async function edgeCases() {
		const live = (await eventRows()).filter((r) => r.deleted_at == null && !r.original);
		const data = live.map((r) => ({ ...r, d: JSON.parse(r.data) }));
		const parts = await t.db
			.prepare("SELECT COUNT(*) AS n FROM edges WHERE kind = 'parte'")
			.first();
		return {
			onSale: data.some((r) => r.d.status === 'abierto' && r.d.extra?.tickets),
			soldOut: data.some((r) => r.d.status === 'agotadas'),
			cancelled: data.some((r) => r.d.status === 'cancelado'),
			online: data.some((r) => r.d.extra?.modalidad === 'online'),
			series: new Set(data.map((r) => String(r.slot).replace(/-\d+$/, ''))).size > 3,
			workshopParts: Number(parts?.n) > 0
		};
	}
	const ALL_EDGE_CASES = {
		onSale: true,
		soldOut: true,
		cancelled: true,
		online: true,
		series: true,
		workshopParts: true
	};

	it('copies public events, marked, next to the edge-case fakes', async () => {
		const { fn } = fakeFetch(PUBLIC_POSTS);
		const r = await reloadDemoData(t.db, { where: 'local', now, fetch: fn });
		expect(r.realEvents).toEqual({
			source: 'https://kinkyvibe.ar/api/posts',
			copied: 4,
			fallback: null
		});
		const copies = (await eventRows()).filter((x) => x.original);
		expect(copies).toHaveLength(4);
		for (const c of copies) {
			expect(c.slug).toMatch(/^demo-copia-/);
			expect(c.title).toMatch(/\(copia de producción\)$/);
			expect(c.original).toMatch(/^https:\/\/kinkyvibe\.ar\/calendario\//);
			expect(c.deleted_at).toBeNull();
			const d = JSON.parse(c.data);
			expect(d.extra?.tickets).toBeUndefined();
			expect(d.link).toBeUndefined();
			expect(d.featured).toBe(`${PUBLIC_SITE}/media/img/${HASH}.webp`);
		}
		// No orders, tickets or accounts for copies.
		const orders = await t.db
			.prepare("SELECT COUNT(*) AS n FROM orders WHERE event_slug LIKE 'demo-copia-%'")
			.first();
		expect(Number(orders?.n)).toBe(0);
		expect(await edgeCases()).toEqual(ALL_EDGE_CASES);
		// They show in the public calendar of the preview.
		const posts = await import('../contenido/posts.js');
		const listed = (await posts.sitePosts(t.platform)).map((p) => String(p.meta.postID));
		expect(listed).toContain('demo-copia-fiesta-inventada-2031-03');
	}, 60000);

	it('same copies the next time: same objects, nothing grows', async () => {
		const before = await eventRows();
		const { fn } = fakeFetch(PUBLIC_POSTS);
		await reloadDemoData(t.db, { where: 'local', now, fetch: fn });
		const after = await eventRows();
		expect(after.map((x) => [x.id, x.slug, x.deleted_at])).toEqual(
			before.map((x) => [x.id, x.slug, x.deleted_at])
		);
	}, 60000);

	it('offline (fetch fails): no copies left, only the fakes, and the reload still works', async () => {
		const failing = /** @type {typeof fetch} */ (
			/** @type {unknown} */ (
				async () => {
					throw new TypeError('fetch failed (sin red en la prueba)');
				}
			)
		);
		const r = await reloadDemoData(t.db, { where: 'local', now, fetch: failing });
		expect(r.realEvents.copied).toBe(0);
		expect(r.realEvents.fallback).toMatch(/no se pudo leer/);
		expect(r.eventObjects).toBe(r.events);
		const copies = (await eventRows()).filter((x) => x.original);
		expect(copies.length).toBe(4);
		for (const c of copies) expect(c.deleted_at).not.toBeNull();
		expect(await edgeCases()).toEqual(ALL_EDGE_CASES);

		// And back online, the same copies come back (same objects).
		const { fn } = fakeFetch(PUBLIC_POSTS);
		await reloadDemoData(t.db, { where: 'local', now, fetch: fn });
		const back = (await eventRows()).filter((x) => x.original);
		expect(back.map((x) => x.id)).toEqual(copies.map((x) => x.id));
		for (const c of back) expect(c.deleted_at).toBeNull();
	}, 60000);

	it('empty public site: only the fakes', async () => {
		const { fn } = fakeFetch([]);
		const r = await reloadDemoData(t.db, { where: 'local', now, fetch: fn });
		expect(r.realEvents.copied).toBe(0);
		expect(r.realEvents.fallback).toMatch(/no tiene eventos/);
		expect(await edgeCases()).toEqual(ALL_EDGE_CASES);
	}, 60000);
});
