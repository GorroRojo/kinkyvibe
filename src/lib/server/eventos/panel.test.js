/**
 * Las listas del panel (Eventos, la agenda) con el interruptor `contenido_db` prendido: leen los
 * eventos de la base con una cantidad FIJA de consultas (no una o dos por evento) y sin armar el
 * texto de cada evento (postToMarkdown + sha), y dan lo mismo que `bundleMeta` evento por evento.
 * Con 500 eventos en la base, una consulta por evento hacía que /admin/eventos no respondiera.
 * Eventos inventados (fixtures de contenido, repetidos con otra dirección) en un D1 de miniflare.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { runImport } from '$lib/server/contenido/importer.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const metas = /** @type {Record<string, Record<string, any> | undefined>} */ (
	import.meta.glob('../contenido/fixtures/calendario/*.md', { import: 'metadata', eager: true })
);
const raws = /** @type {Record<string, string>} */ (
	import.meta.glob('../contenido/fixtures/calendario/*.md', {
		query: '?raw',
		import: 'default',
		eager: true
	})
);
const fixtures = Object.keys(raws)
	.sort()
	.map((path) => ({
		legacySlug: path.split('/').pop()?.replace(/\.md$/, '') ?? '',
		raw: raws[path],
		meta: metas[path] ?? null
	}))
	.filter((f) => f.legacySlug !== 'sin-importar-2031-07' && f.legacySlug !== 'roto-2031-06');

const taller = /** @type {(typeof fixtures)[number]} */ (
	fixtures.find((f) => f.legacySlug === 'taller-inventado-2031-02')
);

/**
 * Los fixtures y `extra` copias del taller con otra dirección (y otra fecha, para la agenda).
 * @param {number} extra
 */
function eventFiles(extra) {
	const copies = Array.from({ length: extra }, (_, i) => {
		const day = String((i % 27) + 1).padStart(2, '0');
		return {
			legacySlug: `copia-inventada-${i}-2031-02`,
			raw: taller.raw
				.replace('title: Taller Inventado de Nudos', `title: Copia Inventada ${i}`)
				.replace(/2031-02-05T/g, `2031-02-${day}T`),
			meta: taller.meta
		};
	});
	return [...fixtures, ...copies];
}

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
let statements = 0;
/** La base de pruebas, contando cada consulta que se prepara. */
const counted = /** @type {import('@cloudflare/workers-types').D1Database} */ (
	new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === 'prepare') {
					return (/** @type {string} */ sql) => {
						statements++;
						return t.db.prepare(sql);
					};
				}
				const value = /** @type {any} */ (t.db)[prop];
				return typeof value === 'function' ? value.bind(t.db) : value;
			}
		}
	)
);

beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('./index.js');
	vi.doUnmock('../contenido/markdown.js');
	vi.resetModules();
});

/**
 * Importa los eventos y carga panel.js con el interruptor prendido, la base registrada (como
 * hooks.server.js), `listEvents` con los eventos de la base y un espía en postToMarkdown.
 * @param {number} extra
 */
async function setup(extra) {
	const files = eventFiles(extra);
	await runImport(t.db, 'calendario', files, { actor: 'importacion', limit: files.length });
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { CONTENIDO_DB_ENABLED: '1' } }));
	const toMarkdown = vi.fn();
	vi.doMock('../contenido/markdown.js', async (importOriginal) => {
		const actual = /** @type {typeof import('../contenido/markdown.js')} */ (
			await importOriginal()
		);
		return {
			...actual,
			postToMarkdown: (/** @type {Parameters<typeof actual.postToMarkdown>} */ ...args) => {
				toMarkdown(...args);
				return actual.postToMarkdown(...args);
			}
		};
	});
	const { eventToMeta } = await import('../contenido/eventos.js');
	const repo = await import('../contenido/repo.js');
	repo.setContentDB(t.db);
	const summaries = [...(await repo.allDbEventObjects(t.db)).entries()]
		.filter(([, e]) => !e.deleted)
		.map(([slug, e]) => {
			const meta = eventToMeta(e.object);
			return {
				slug,
				title: String(meta.title ?? slug),
				start: String(meta.start ?? ''),
				end: String(meta.end ?? ''),
				status: String(meta.status ?? ''),
				location: String(meta.location ?? ''),
				unlisted: meta.force_unlisted === true,
				unpublished: meta.force_unpublished === true
			};
		});
	vi.doMock('./index.js', async (importOriginal) => ({
		.../** @type {object} */ (await importOriginal()),
		listEvents: async () => summaries
	}));
	const panel = await import('./panel.js');
	// Desde acá, contar las consultas de la base que usa el panel.
	repo.setContentDB(counted);
	statements = 0;
	return { panel, toMarkdown, slugs: summaries.map((s) => s.slug) };
}

describe('listas del panel con contenido_db', () => {
	it('la lista de eventos hace las mismas pocas consultas con 5 o con 60 eventos', async () => {
		const few = await setup(0);
		const fewList = await few.panel.listPanelEventsWithMeta();
		const fewStatements = statements;
		expect(fewList.length).toBe(few.slugs.length);
		vi.resetModules();
		await resetDB(t.db);

		const many = await setup(55);
		const manyList = await many.panel.listPanelEventsWithMeta();
		expect(manyList.length).toBe(many.slugs.length);
		expect(manyList.length).toBeGreaterThanOrEqual(60);
		// No crece con la cantidad de eventos (antes: dos consultas por evento).
		expect(statements).toBe(fewStatements);
		expect(statements).toBeLessThanOrEqual(3);
		// La lista no arma el texto de ningún evento.
		expect(many.toMarkdown).not.toHaveBeenCalled();
	});

	it('la agenda tampoco hace una consulta por evento', async () => {
		const { panel, toMarkdown } = await setup(55);
		const rows = await panel.agendaRows({ today: '2031-01-01' });
		expect(rows.length).toBeGreaterThanOrEqual(55);
		expect(statements).toBeLessThanOrEqual(3);
		expect(toMarkdown).not.toHaveBeenCalled();
	});

	it('da lo mismo que bundleMeta evento por evento', async () => {
		const { panel, slugs } = await setup(3);
		const all = [...slugs, 'no-existe-2031-09'];
		const batched = await panel.bundleMetas(all);
		for (const slug of all) expect(batched.get(slug)).toEqual(await panel.bundleMeta(slug));
		expect(batched.get('no-existe-2031-09')).toBeNull();
		const list = await panel.listPanelEventsWithMeta();
		for (const { event, meta } of list) {
			expect(meta).toEqual(await panel.bundleMeta(event.slug));
			expect(event).toEqual(await panel.getPanelEvent(event.slug));
		}
	});
});
