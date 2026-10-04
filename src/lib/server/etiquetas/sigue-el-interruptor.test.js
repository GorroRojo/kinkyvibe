/**
 * Todo lo que usa el árbol de etiquetas sigue la MISMA fuente (la base, con el archivo de
 * respaldo; el interruptor `etiquetas_db` quedó fijo), sin excepciones: las publicaciones (la limpieza de etiquetas de cada post, los
 * listados, /api/posts, el índice del buscador), los editores del panel, las series, el ingreso y
 * lo que cuenta series en Estadísticas. El hook (`applySiteTags`) pone el árbol de cada pedido.
 *
 * Datos inventados: una «base» que renombra Picantearla (con alias, así los posts de hoy se
 * resuelven) y le pone otro nombre visible, y un alias nuevo de KinkyVibe.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import hardcodedTags from '$lib/utils/hardcodedTags.js';
import { canonicalTags } from '$lib/utils';
import { createTestDB } from '$lib/server/db/testing.js';
import { runImport } from '$lib/server/contenido/importer.js';
import { setContentDB } from '$lib/server/contenido/repo.js';
import { sitePost, sitePosts } from '$lib/server/contenido/posts.js';
import { currentSiteTags, setSiteTagList } from '$lib/utils/siteTags.js';
import { tagManager } from '$lib/utils/stores.js';
import { canonicalTag, siteTags as adminSiteTags } from '$lib/utils/adminTags.js';
import { isKinkyVibeEvent } from '$lib/utils/ticketsEditor.js';
import { seriesTagIndex } from '$lib/utils/series.js';
import { siteTags as seriesSiteTags, seriesPage } from '$lib/server/series/index.js';
import { doorSeriesLabel } from '../../../routes/(authed)/admin/eventos/[slug]/ingreso/context.server.js';
import { applySiteTags } from './source.js';

vi.setConfig({ testTimeout: 120_000 });

const RENAMED = 'Picante de Prueba';

/** La lista del archivo, como datos, con los cambios de la «base». */
function fakeDbList() {
	/** @type {Record<string, any>[]} */
	const list = JSON.parse(JSON.stringify(hardcodedTags));
	for (const e of list) {
		if (e.id === 'Picantearla' && !e.aliasOf) {
			e.id = RENAMED;
			e.visible_name = 'Serie Inventada';
		}
		if (Array.isArray(e.children))
			e.children = e.children.map((/** @type {string} */ c) => (c === 'Picantearla' ? RENAMED : c));
	}
	list.push({ id: 'Picantearla', aliasOf: RENAMED }, { id: 'kv-de-prueba', aliasOf: 'KinkyVibe' });
	return list;
}

afterEach(() => setSiteTagList(null));

/** Un evento real de la serie (público), en la base: de ahí salen los eventos. */
const EVENT = 'picantearla-2024-02';
const EVENT_PATH = `/src/lib/posts/calendario/${EVENT}.md`;
const eventRaw = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/calendario/picantearla-2024-02.md', {
		query: '?raw',
		import: 'default',
		eager: true
	})
)[EVENT_PATH];
const eventMeta = /** @type {Record<string, any>} */ (
	import.meta.glob('/src/lib/posts/calendario/picantearla-2024-02.md', {
		import: 'metadata',
		eager: true
	})
)[EVENT_PATH];

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	await runImport(t.db, 'calendario', [{ legacySlug: EVENT, raw: eventRaw, meta: eventMeta }], {
		actor: 'prueba'
	});
	setContentDB(t.db);
});
afterAll(async () => {
	setContentDB(null);
	await t?.dispose();
});

describe('el árbol en uso', () => {
	it('el hook pone la lista de la base (también en los stores del SSR) y vuelve al archivo', async () => {
		const list = fakeDbList();
		await applySiteTags(undefined, { source: { rawTags: list, fromDb: true } });
		expect(currentSiteTags().get('Picantearla').id).toBe(RENAMED);
		expect(get(tagManager).get('Picantearla').id).toBe(RENAMED);
		// La lista sigue siendo datos (se manda en la página).
		expect(() => structuredClone(list)).not.toThrow();
		await applySiteTags(undefined); // sin base: el archivo
		expect(currentSiteTags().get('Picantearla').id).toBe('Picantearla');
		expect(get(tagManager).get('Picantearla').id).toBe('Picantearla');
	});
});

describe('las publicaciones', () => {
	it('canonicalTags (la limpieza de cada post) usa el árbol en uso', () => {
		expect(canonicalTags(['Picantearla'])).toEqual(['Picantearla']);
		setSiteTagList(fakeDbList());
		expect(canonicalTags(['Picantearla'])).toEqual([RENAMED]);
	});

	it('sitePosts y sitePost: las etiquetas de los eventos (de la base) siguen al árbol en uso', async () => {
		const tagsOf = async () =>
			(await sitePosts(t.platform)).find((p) => p.meta.postID === EVENT)?.meta.tags;
		expect(await tagsOf()).toContain('Picantearla');
		setSiteTagList(fakeDbList());
		expect(await tagsOf()).toContain(RENAMED);
		expect(await tagsOf()).not.toContain('Picantearla');
		expect((await sitePost(t.platform, 'calendario', EVENT)).meta.tags).toContain(RENAMED);
		setSiteTagList(null);
		expect(await tagsOf()).toContain('Picantearla');
	});

	it('/api/posts (ya no prerenderizado) da las etiquetas de la base', async () => {
		const api = await import('../../../routes/api/posts/+server.js');
		expect(api.prerender).toBe(false);
		setSiteTagList(fakeDbList());
		const res = await api.GET(/** @type {any} */ ({ platform: t.platform }));
		expect(res.headers.get('cache-control')).toMatch(/max-age=\d+/);
		/** @type {ProcessedPost[]} */
		const posts = await res.json();
		const p = posts.find((x) => x.meta.postID === EVENT);
		expect(p?.meta.tags).toContain(RENAMED);
	});

	it('el índice del buscador (ya no prerenderizado) usa los nombres de la base', async () => {
		const api = await import('../../../routes/api/search-index.json/+server.js');
		expect(api.prerender).toBe(false);
		setSiteTagList(fakeDbList());
		const index = await (await api.GET(/** @type {any} */ ({}))).json();
		expect(index.tags[RENAMED]).toContain('Serie Inventada');
		expect(index.tags.Picantearla).toBeUndefined();
	});

	it('el RSS y el sitemap siguen prerenderizados: no muestran etiquetas', async () => {
		const rss = await import('../../../routes/rss/+server.js');
		const sitemap = await import('../../../routes/(content)/sitemap.xml/+server.js');
		const bodies = async () => [
			await (await rss.GET()).text(),
			await (await sitemap.GET(/** @type {any} */ ({}))).text()
		];
		// El sitemap pone la hora de ahora en algunas entradas: el mismo reloj para las dos.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
		try {
			const fromFile = await bodies();
			setSiteTagList(fakeDbList());
			const fromDb = await bodies();
			expect(fromDb[0]).toEqual(fromFile[0]);
			expect(fromDb[1]).toEqual(fromFile[1]);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('panel, series e ingreso', () => {
	it('los editores del panel (adminTags) y las entradas (KinkyVibe)', () => {
		expect(canonicalTag('Picantearla')).toBe('Picantearla');
		expect(isKinkyVibeEvent({ tags: ['kv-de-prueba'] })).toBe(false);
		setSiteTagList(fakeDbList());
		expect(canonicalTag('Picantearla')).toBe(RENAMED);
		expect(adminSiteTags()).toBe(currentSiteTags());
		expect(isKinkyVibeEvent({ tags: ['kv-de-prueba'] })).toBe(true);
	});

	it('series (avisos, «¿Es parte de una serie?», Estadísticas) e ingreso', async () => {
		setSiteTagList(fakeDbList());
		expect(seriesSiteTags().get('Picantearla').id).toBe(RENAMED);
		expect(seriesTagIndex().get('picantearla')).toBe(RENAMED);
		expect((await seriesPage('Picantearla'))?.name).toBe('Serie Inventada');
		expect(await doorSeriesLabel(EVENT, t.platform)).toBe('Serie Inventada');
		setSiteTagList(null);
		expect(await doorSeriesLabel(EVENT, t.platform)).toBe('Picantearla');
	});
});
