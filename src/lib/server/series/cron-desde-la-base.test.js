/**
 * El cron de avisos de series («Avisame si se repite») lee las series de la base, aunque el árbol
 * de etiquetas que dejó el último pedido en el isolate sea otro (por ejemplo, el archivo de
 * respaldo): una serie que existe solo en la base avisa igual. D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { clearTagSourceCache } from '$lib/server/etiquetas/source.js';
import { setSiteTagList } from '$lib/utils/siteTags.js';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const SERIES = 'Serie Inventada Solo en la Base';

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
	clearTagSourceCache();
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
});
afterEach(() => {
	setSiteTagList(null);
	clearTagSourceCache();
});

describe('runSeriesCron', () => {
	it('ve una serie que está solo en la base aunque el árbol en uso sea el archivo', async () => {
		await importTags(
			t.db,
			{
				rawTags: [
					{ id: 'root', children: ['evento recurrente'] },
					{ id: 'evento recurrente', children: [SERIES] },
					{ id: SERIES }
				]
			},
			{ actor: 'admin-de-prueba' }
		);
		await saveObject(
			t.db,
			{
				type: 'evento',
				slug: 'edicion-inventada',
				title: 'Edición inventada',
				data: { start: new Date(NOW + 10 * DAY).toISOString(), tags: [SERIES] }
			},
			{ actor: 'admin-de-prueba', now: NOW }
		);
		// El árbol que dejó el último pedido: el archivo (no conoce la serie).
		setSiteTagList(null);
		const { runSeriesCron } = await import('./web.js');
		const r = await runSeriesCron({
			db: t.db,
			origin: 'https://ejemplo.test',
			fetch: /** @type {any} */ (async () => new Response('{}')),
			now: NOW
		});
		expect(r.seen).toBe(1);
		const seen = await t.db
			.prepare('SELECT series_tag, event_slug FROM series_editions_seen')
			.all();
		expect(seen.results).toEqual([{ series_tag: SERIES, event_slug: 'edicion-inventada' }]);
	});
});
