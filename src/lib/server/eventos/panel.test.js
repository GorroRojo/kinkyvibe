/**
 * Las listas del panel (Eventos, la agenda): leen los
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
/** @type {string[]} */
let sqls = [];
/** La base de pruebas, contando cada consulta que se prepara. */
const counted = /** @type {import('@cloudflare/workers-types').D1Database} */ (
	new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === 'prepare') {
					return (/** @type {string} */ sql) => {
						statements++;
						sqls.push(sql);
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
 * Importa los eventos y carga panel.js con la base registrada (como
 * hooks.server.js), `listEvents` con los eventos de la base y un espía en postToMarkdown.
 * @param {number} extra
 */
async function setup(extra) {
	const files = eventFiles(extra);
	await runImport(t.db, 'calendario', files, { actor: 'importacion', limit: files.length });
	vi.resetModules();
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
	// Desde acá, contar las consultas de la base que usa el panel (sin lo recordado al armar los
	// eventos de prueba).
	repo.clearDbPostCache();
	repo.setContentDB(counted);
	statements = 0;
	sqls = [];
	return { panel, repo, toMarkdown, slugs: summaries.map((s) => s.slug) };
}

describe('listas del panel (eventos de la base)', () => {
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

/** ¿Alguna de las consultas lee todos los eventos (con su `data`, sin filtrar por dirección)? */
const readAll = () => sqls.some((q) => /\bo\.data\b/.test(q) && /WHERE o\.type = \?1\s*$/.test(q));

describe('lo leído se recuerda mientras la base no cambie', () => {
	it('la segunda vez, la lista solo pregunta si cambió algo: una consulta chica', async () => {
		const { panel } = await setup(30);
		const first = await panel.listPanelEventsWithMeta();
		expect(readAll()).toBe(true);
		statements = 0;
		sqls = [];
		const again = await panel.listPanelEventsWithMeta();
		expect(again).toEqual(first);
		expect(statements).toBe(1);
		expect(readAll()).toBe(false);
	});

	it('un guardado del panel (y un borrado) se ven en la próxima lista', async () => {
		const { panel, repo } = await setup(3);
		const slug = 'taller-inventado-2031-02';
		const before = await panel.bundleMetas([slug]);
		expect(before.get(slug)?.title).toBe('Taller Inventado de Nudos');
		const client = repo.withContentDb(
			/** @type {any} */ ({ pathExists: async () => false, commitFiles: async () => ({}) })
		);
		const path = `src/lib/posts/calendario/${slug}.md`;
		const file = await client.readFile('t', path);
		await client.commitFiles('t', {
			files: [
				{
					path,
					content: String(file?.raw).replace(
						'title: Taller Inventado de Nudos',
						'title: Taller Cambiado'
					)
				}
			],
			message: 'edita',
			unchanged: [{ path, sha: String(file?.sha) }],
			actor: 'admin-inventade'
		});
		expect((await panel.bundleMetas([slug])).get(slug)?.title).toBe('Taller Cambiado');
		await client.commitFiles('t', {
			files: [{ path, delete: true }],
			message: 'borra',
			actor: 'admin-inventade'
		});
		expect((await panel.bundleMetas([slug])).get(slug)).toBeNull();
	});

	it('quien toca lo que recibe no cambia lo recordado', async () => {
		const { repo } = await setup(3);
		const slug = 'taller-inventado-2031-02';
		const first = await repo.allDbEventObjects(counted);
		const e = /** @type {any} */ (first.get(slug));
		e.object.title = 'Tocado';
		e.object.data.tags.push('tocada');
		first.delete(slug);
		const again = /** @type {any} */ ((await repo.allDbEventObjects(counted)).get(slug));
		expect(again.object.title).toBe('Taller Inventado de Nudos');
		expect(again.object.data.tags).not.toContain('tocada');
	});

	it('un cambio hecho desde otro lado (otro isolate) también se ve', async () => {
		const { panel } = await setup(3);
		const slug = 'taller-inventado-2031-02';
		await panel.bundleMetas([slug]);
		// Lo mismo que hace saveObject(): versión y `updated_at` nuevos.
		await t.db
			.prepare(
				`UPDATE objects SET title = 'Otro Título', data = json_set(data, '$.title', 'Otro Título'),
				version = version + 1, updated_at = updated_at + 1
				WHERE id = (SELECT object_id FROM content_sources WHERE legacy_slug = ?1)`
			)
			.bind(slug)
			.run();
		expect((await panel.bundleMetas([slug])).get(slug)?.title).toBe('Otro Título');
	});
});

describe('un evento por su dirección', () => {
	it('una sola consulta (antes dos, y una recorría todos), y lo mismo que buscarlo en la lista', async () => {
		const { repo, slugs } = await setup(10);
		const all = await repo.allDbEventObjects(t.db);
		const find = repo.dbPostFinder(all);
		const asked = [
			...slugs,
			// También por la dirección del objeto (cuando es otra que la del .md) y una que no existe.
			...[...all.values()].map((e) => e.object.slug),
			'no-existe-2031-09'
		];
		const { resolveContentSlug } = await import('../contenido/posts.js');
		const { getObject } = await import('../objects/read.js');
		for (const slug of asked) {
			statements = 0;
			sqls = [];
			const one = await repo.findDbPostObject(counted, 'calendario', slug);
			expect(statements).toBe(1);
			expect(readAll()).toBe(false);
			const listed = find(slug);
			expect(one && { ...one, object: null }).toEqual(listed && { ...listed, object: null });
			// El objeto, igual que antes (resolveContentSlug + getObject), y resolveContentSlug da lo
			// mismo que la consulta de antes (con el `OR`, que recorría todos los eventos).
			const ref = await resolveContentSlug(t.db, 'calendario', slug);
			const old = await t.db
				.prepare(
					`SELECT o.id, s.legacy_slug FROM objects o
					LEFT JOIN content_sources s ON s.object_id = o.id AND s.category = ?2
					WHERE o.type = ?1 AND (s.legacy_slug = ?3 OR o.slug = ?3)
					ORDER BY (s.legacy_slug = ?3) DESC LIMIT 1`
				)
				.bind('evento', 'calendario', slug)
				.first();
			expect(ref).toEqual(
				old
					? { id: Number(old.id), legacySlug: old.legacy_slug ? String(old.legacy_slug) : null }
					: null
			);
			const before = ref
				? await getObject(
						t.db,
						{ id: ref.id },
						{ role: 'admin', id: 'panel' },
						{
							includeDeleted: true
						}
					)
				: null;
			expect(one?.object ?? null).toEqual(before);
		}
	});
});
