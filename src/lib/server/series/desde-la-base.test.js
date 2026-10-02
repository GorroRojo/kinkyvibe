/**
 * Las series, /material y la serie del modo puerta leen por la capa compartida de contenido
 * (`sitePosts`): con `contenido_db` apagado, los `.md`; prendido, también lo de la base (eventos
 * y material creados en el panel), sin lo oculto ni lo no listado. D1 de miniflare; datos
 * inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { fakeEvent } from './fixtures.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const SERIES = 'Picantearla';

/** Lo que devuelve `fetchMarkdownPosts` (los `.md`, ya sin ocultos ni no listados). */
const md = vi.hoisted(() => /** @type {{ listed: any[] }} */ ({ listed: [] }));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki || unlisted ? [] : structuredClone(md.listed)
}));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
	md.listed = [
		fakeEvent('serie-md-pasada', NOW - 30 * DAY, [SERIES]),
		{
			path: '/material/nota-md-inventada',
			meta: {
				postID: 'nota-md-inventada',
				title: 'Nota inventada del md',
				category: 'material',
				layout: 'material',
				tags: [],
				published_date: '2030-01-01'
			}
		}
	];
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** Los módulos con `contenido_db` como se pida. @param {string} flag */
async function modules(flag) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { CONTENIDO_DB_ENABLED: flag, ETIQUETAS_DB_ENABLED: '0' }
	}));
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
	return {
		series: await import('./index.js'),
		material: await import('../../../routes/(content)/material/+page.server.js'),
		door: await import('../../../routes/(authed)/admin/eventos/[slug]/ingreso/context.server.js')
	};
}

/**
 * Algo en la base.
 *
 * @param {'evento' | 'material'} type
 * @param {string} slug
 * @param {Record<string, unknown>} data
 * @param {'public' | 'hidden'} [visibility]
 */
async function dbObject(type, slug, data, visibility = 'public') {
	await saveObject(
		t.db,
		{ type, slug, title: `Inventado ${slug}`, visibility, data },
		{ actor: 'admin-inventade', now: NOW }
	);
}

async function seed() {
	const start = (/** @type {number} */ ms) => new Date(ms).toISOString();
	await dbObject('evento', 'serie-base-proxima', { start: start(NOW + 10 * DAY), tags: [SERIES] });
	await dbObject(
		'evento',
		'serie-base-oculta',
		{ start: start(NOW + 11 * DAY), tags: [SERIES] },
		'hidden'
	);
	await dbObject('evento', 'serie-base-no-listada', {
		start: start(NOW + 12 * DAY),
		tags: [SERIES],
		unlisted: true
	});
	await dbObject('material', 'nota-base-inventada', { published_date: '2030-02-01' });
	await dbObject('material', 'nota-base-oculta', { published_date: '2030-02-02' }, 'hidden');
}

/** Las direcciones de las ediciones de la serie (próximas y pasadas). @param {any} page */
const editionSlugs = (page) => [...page.upcoming, ...page.past].map((e) => e.slug).sort();

describe('series por sitePosts', () => {
	it('contenido_db apagado: solo los .md, aunque la base tenga eventos', async () => {
		await seed();
		const m = await modules('0');
		const page = await m.series.seriesPage(SERIES, { platform: t.platform, now: NOW });
		expect(editionSlugs(page)).toEqual(['serie-md-pasada']);
		const summary = (await m.series.seriesSummaries({ platform: t.platform, now: NOW })).find(
			(s) => s.id === SERIES
		);
		expect(summary).toMatchObject({ total: 1, next: null });
		expect(await m.door.doorSeriesLabel('serie-base-proxima', t.platform)).toBe('');
	});

	it('contenido_db prendido: también la base (numeradas con las del .md), sin ocultas ni no listadas', async () => {
		await seed();
		const m = await modules('1');
		const page = /** @type {any} */ (
			await m.series.seriesPage(SERIES, { platform: t.platform, now: NOW })
		);
		expect(editionSlugs(page)).toEqual(['serie-base-proxima', 'serie-md-pasada']);
		expect(page.upcoming[0]).toMatchObject({ slug: 'serie-base-proxima', number: 2 });
		const summary = (await m.series.seriesSummaries({ platform: t.platform, now: NOW })).find(
			(s) => s.id === SERIES
		);
		expect(summary).toMatchObject({ total: 2, next: { path: '/calendario/serie-base-proxima' } });
		const all = (await m.series.allSeries({ platform: t.platform, now: NOW })).find(
			(s) => s.id === SERIES
		);
		expect(all?.editions.map((e) => e.slug)).toEqual(['serie-md-pasada', 'serie-base-proxima']);
		expect(await m.door.doorSeriesLabel('serie-base-proxima', t.platform)).toBe(SERIES);
	});
});

describe('/material por sitePosts', () => {
	/** @param {Awaited<ReturnType<typeof modules>>} m */
	const listed = async (m) =>
		/** @type {any} */ (await m.material.load(/** @type {any} */ ({ platform: t.platform }))).posts
			.map((/** @type {any} */ p) => p.meta.postID)
			.sort();

	it('apagado: solo los .md', async () => {
		await seed();
		expect(await listed(await modules('0'))).toEqual(['nota-md-inventada']);
	});

	it('prendido: también lo de la base, sin lo oculto', async () => {
		await seed();
		expect(await listed(await modules('1'))).toEqual(['nota-base-inventada', 'nota-md-inventada']);
	});
});
