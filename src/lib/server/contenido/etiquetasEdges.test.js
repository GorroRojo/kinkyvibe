/**
 * Etiquetas de los eventos y del material como edges `etiqueta` (./etiquetasEdges.js,
 * ./relaciones.js): guardar parte la lista (las etiquetas vivas van a edges con sus lugares; los
 * nombres que no son de ninguna etiqueta quedan en `data.tags`), y todo lo que se lee (las listas,
 * la página, el texto del editor, la metadata del panel, lo que compara la importación) sale igual
 * que cuando la lista estaba entera en el JSON. Las listas no hacen una consulta por post.
 * Etiquetas y eventos inventados; D1 de miniflare; el repo es de mentira.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { coreTypes, validateData } from '$lib/server/objects/types/index.js';
import { eventToMeta } from './eventos.js';
import { eventToMarkdown, markdownToEvent } from './markdown.js';
import { planImport, runImport } from './importer.js';
import {
	dehydrateTags,
	mergeTagItems,
	splitTagItems,
	tagEdgesOf,
	withTagEdges
} from './etiquetasEdges.js';
import { dehydrateContent, hydrateContent } from './relaciones.js';
import { createWorkshopPart } from '../eventos/partes.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

describe('partir y volver a armar la lista (puro)', () => {
	const ids = new Map([
		['Cuerdas', 1],
		['Fiesta', 2],
		['Alias', 3]
	]);
	/** @type {unknown[][]} */
	const lists = [
		[],
		['Suelta'],
		['Cuerdas'],
		['Suelta', 'Cuerdas', 'Otra', 'Fiesta', 'Cuerdas', 'Alias'],
		['Fiesta', 'Fiesta', 'Al Final'],
		['Cuerdas', 'Fiesta', 'Uno', 'Dos'],
		['Uno', 'Dos', 'Cuerdas']
	];

	/** @param {{ to: number, data: { at: number[] } }[]} edges */
	const asRows = (edges) =>
		edges.map((e) => ({
			key: /** @type {string} */ ([...ids].find(([, id]) => id === e.to)?.[0]),
			data: e.data
		}));

	it('ida y vuelta: la misma lista, en el mismo orden', () => {
		for (const list of lists) {
			const { kept, edges } = splitTagItems(list, ids);
			expect(mergeTagItems(kept, asRows(edges))).toEqual(list);
			expect(kept.some((x) => typeof x === 'string' && ids.has(x))).toBe(false);
		}
	});

	it('una etiqueta repetida es un solo edge, con sus dos lugares', () => {
		expect(splitTagItems(['Cuerdas', 'Suelta', 'Cuerdas'], ids)).toEqual({
			kept: ['Suelta'],
			edges: [{ to: 1, data: { at: [0, 2] } }]
		});
	});

	it('un edge sin lugares (o roto) va al final; uno roto no rompe', () => {
		expect(
			mergeTagItems(
				['Suelta'],
				[
					{ key: 'Cuerdas', data: null },
					{ key: 'Fiesta', data: { at: ['x'] } },
					{ key: 'Alias', data: { at: [0] } }
				]
			)
		).toEqual(['Alias', 'Suelta', 'Cuerdas', 'Fiesta']);
	});

	it('sin edges, `data` tal cual; si `data.tags` ya trae la etiqueta (lista entera), manda esa', () => {
		const data = { tags: ['Cuerdas', 'Suelta'] };
		expect(withTagEdges(data, [])).toBe(data);
		expect(withTagEdges(data, [{ key: 'Cuerdas', data: { at: [0] } }])).toBe(data);
		expect(withTagEdges({ tags: ['Suelta'] }, [{ key: 'Cuerdas', data: { at: [0] } }])).toEqual({
			tags: ['Cuerdas', 'Suelta']
		});
		expect(withTagEdges({ start: 'x' }, [{ key: 'Cuerdas', data: { at: [0] } }])).toEqual({
			start: 'x',
			tags: ['Cuerdas']
		});
	});
});

// ---------------------------------------------------------------------------------------------
// Con la base.
// ---------------------------------------------------------------------------------------------

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
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

const SLUG = 'fiesta-con-etiquetas-2031-09';
const PATH = `src/lib/posts/calendario/${SLUG}.md`;
const TAGS = ['Suelta Inventada', 'Cuerdas Inventadas', 'Serie Inventada', 'Alias Inventado'];

/** Un .md con etiquetas: una suelta (no es de ninguna etiqueta), dos etiquetas y un alias. */
const MD = (/** @type {string} */ title = 'Fiesta Con Etiquetas', slug = SLUG) =>
	[
		'---',
		`title: ${title}`,
		"summary: 'Resumen inventado'",
		'tags:',
		...TAGS.map((tag) => `  - ${tag}`),
		'layout: calendario',
		'category: calendario',
		'status: abierto',
		`start: 2031-09-${slug === SLUG ? '10' : '11'}T21:00-03:00`,
		'---',
		'Texto inventado.',
		''
	].join('\n');

/**
 * @param {string} key
 * @param {{ visibility?: 'public' | 'hidden' }} [opts]
 */
async function makeTag(key, { visibility = 'public' } = {}) {
	return saveObject(
		t.db,
		{
			type: 'etiqueta',
			title: key,
			slug: key.toLowerCase().replace(/\s+/g, '-'),
			data: { key },
			visibility
		},
		{ actor: 'admin-inventade' }
	);
}

async function tags() {
	const cuerdas = await makeTag('Cuerdas Inventadas');
	const serie = await makeTag('Serie Inventada', { visibility: 'hidden' });
	const alias = await makeTag('Alias Inventado');
	return { cuerdas, serie, alias };
}

/**
 * Un repo de mentira vacío.
 * @returns {any}
 */
function fakeRepo() {
	return {
		getFile: async () => null,
		readFile: async () => null,
		pathExists: async () => false,
		existingPaths: async () => [],
		listTree: async () => [],
		getDirTexts: async () => [],
		listDir: async () => [],
		commitFiles: async () => ({ sha: 'abc', url: 'https://ejemplo.test/commit/abc' })
	};
}

/** El cliente del repo con `contenido_db` prendido (como hooks.server.js). */
async function setup() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { CONTENIDO_DB_ENABLED: '1' } }));
	const repo = await import('./repo.js');
	repo.setContentDB(t.db);
	repo.clearDbPostCache();
	(await import('./posts.js')).clearContentCache();
	return { repo, client: repo.withContentDb(fakeRepo()) };
}

/** @param {any} client @param {string} [path] @param {string} [content] */
const create = (client, path = PATH, content = MD()) =>
	client.commitFiles('t', {
		files: [{ path, content }],
		message: 'nuevo',
		actor: 'admin-inventade',
		superadmin: true
	});

/** El evento guardado y sus edges `etiqueta` (con el `key` de la etiqueta). */
async function stored(slug = SLUG) {
	const row = /** @type {any} */ (
		await t.db
			.prepare(
				`SELECT o.id, o.version, o.data FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id
				WHERE o.type = 'evento' AND coalesce(s.legacy_slug, o.slug) = ?1`
			)
			.bind(slug)
			.first()
	);
	const { results } = await t.db
		.prepare(
			`SELECT json_extract(o.data, '$.key') AS key, e.data FROM edges e
			JOIN objects o ON o.id = e.to_id
			WHERE e.from_id = ?1 AND e.kind = 'etiqueta' ORDER BY e.position, e.id`
		)
		.bind(row.id)
		.all();
	return {
		id: Number(row.id),
		version: Number(row.version),
		data: JSON.parse(row.data),
		edges: results.map((r) => ({ key: String(r.key), data: JSON.parse(String(r.data)) }))
	};
}

/** Lo que guardaba antes el panel: el .md convertido, con la lista entera en `data.tags`. */
const before = () => {
	const mapped = markdownToEvent(SLUG, MD());
	const evento = /** @type {any} */ (coreTypes.get('evento'));
	const valid = validateData(evento, { ...mapped.data, body_html: 'libre' });
	if (!valid.ok) throw new Error('el .md de prueba no es válido');
	return { title: mapped.title, data: valid.data, visibility: mapped.visibility };
};

describe('guardar un evento desde el panel', () => {
	it('las etiquetas vivas (también ocultas o alias) van a edges; en `data.tags` queda la suelta', async () => {
		await tags();
		const { client } = await setup();
		await create(client);
		const s = await stored();
		expect(s.edges).toEqual([
			{ key: 'Cuerdas Inventadas', data: { at: [1] } },
			{ key: 'Serie Inventada', data: { at: [2] } },
			{ key: 'Alias Inventado', data: { at: [3] } }
		]);
		expect(s.data.tags).toEqual(['Suelta Inventada']);
	});

	it('se lee igual que antes: el editor, la metadata del panel, la página y las listas', async () => {
		await tags();
		const { client, repo } = await setup();
		await create(client);
		const old = before();
		expect(old.data.tags).toEqual(TAGS);
		expect(await client.getFile('t', PATH)).toBe(eventToMarkdown(old));
		const found = await repo.findDbPostObject(t.db, 'calendario', SLUG);
		expect(eventToMeta(/** @type {any} */ (found).object)).toEqual(eventToMeta(old));
		const all = await repo.allDbEventObjects(t.db);
		expect(eventToMeta(/** @type {any} */ (all.get(SLUG)).object)).toEqual(eventToMeta(old));
		const posts = await import('./posts.js');
		const page = /** @type {any} */ (await posts.sitePost(t.platform, 'calendario', SLUG));
		const listed = /** @type {any} */ (
			(await posts.sitePosts(t.platform)).find((p) => p.meta.postID === SLUG)
		);
		expect(listed.meta.tags).toEqual(page.meta.tags);
		// Lo mismo que daba la lista entera en el JSON (con la misma limpieza de etiquetas).
		await t.db
			.prepare('DELETE FROM edges WHERE from_id = ?1')
			.bind((await stored()).id)
			.run();
		await t.db
			.prepare('UPDATE objects SET data = ?2, version = version + 1 WHERE id = ?1')
			.bind((await stored()).id, JSON.stringify(old.data))
			.run();
		posts.clearContentCache();
		const pageOld = /** @type {any} */ (await posts.sitePost(t.platform, 'calendario', SLUG));
		expect(page.meta.tags).toEqual(pageOld.meta.tags);
		expect(page.meta.tags.length).toBeGreaterThan(0);
	});

	it('volver a guardar no cambia los edges; sacar una etiqueta saca su edge; una nueva pasa a edge', async () => {
		await tags();
		const { client } = await setup();
		await create(client);
		const first = await stored();
		await makeTag('Suelta Inventada');
		const file = /** @type {{ raw: string, sha: string }} */ (await client.readFile('t', PATH));
		const without = file.raw.replace('  - Serie Inventada\n', '');
		expect(without).not.toBe(file.raw);
		await client.commitFiles('t', {
			files: [{ path: PATH, content: without }],
			message: 'editar',
			unchanged: [{ path: PATH, sha: file.sha }],
			actor: 'admin-inventade',
			superadmin: true
		});
		const s = await stored();
		expect(s.version).toBe(first.version + 1);
		expect(s.edges).toEqual([
			{ key: 'Suelta Inventada', data: { at: [0] } },
			{ key: 'Cuerdas Inventadas', data: { at: [1] } },
			{ key: 'Alias Inventado', data: { at: [2] } }
		]);
		expect(s.data).not.toHaveProperty('tags');
		expect(await client.getFile('t', PATH)).toBe(without);
	});
});

describe('la etiqueta cambia de nombre', () => {
	it('el evento la sigue nombrando, con el nombre nuevo (también en las listas recordadas)', async () => {
		const { cuerdas } = await tags();
		const { client, repo } = await setup();
		await create(client);
		const posts = await import('./posts.js');
		const listedTags = async () =>
			/** @type {any} */ ((await posts.sitePosts(t.platform)).find((p) => p.meta.postID === SLUG))
				?.meta.tags;
		expect(await listedTags()).toContain('Cuerdas Inventadas');
		expect((await repo.allDbEventObjects(t.db)).get(SLUG)?.object.data.tags).toContain(
			'Cuerdas Inventadas'
		);
		await saveObject(
			t.db,
			{
				id: cuerdas.id,
				type: 'etiqueta',
				version: cuerdas.version,
				data: { key: 'Cuerdas Renombradas' }
			},
			{ actor: 'a', now: Date.now() + 1000 }
		);
		expect(await listedTags()).toContain('Cuerdas Renombradas');
		expect(await listedTags()).not.toContain('Cuerdas Inventadas');
		expect((await repo.allDbEventObjects(t.db)).get(SLUG)?.object.data.tags).toEqual([
			'Suelta Inventada',
			'Cuerdas Renombradas',
			'Serie Inventada',
			'Alias Inventado'
		]);
	});
});

describe('renombrar «en todas las publicaciones»', () => {
	it('el evento enlazado no se reescribe (cambia solo); el que la tiene como texto, sí', async () => {
		const { cuerdas } = await tags();
		const { client } = await setup();
		const OTHER = 'fiesta-sin-edges-2031-09';
		const OTHER_PATH = `src/lib/posts/calendario/${OTHER}.md`;
		await create(client);
		await create(client, OTHER_PATH, MD('Fiesta Sin Edges', OTHER));
		// Como uno guardado antes de la migración 0042: la lista entera como texto, sin edges.
		const other = await stored(OTHER);
		await t.db.prepare('DELETE FROM edges WHERE from_id = ?1').bind(other.id).run();
		await t.db
			.prepare('UPDATE objects SET data = ?2, version = version + 1 WHERE id = ?1')
			.bind(other.id, JSON.stringify({ ...other.data, tags: TAGS }))
			.run();
		const linked = await client.linkedTagsOf('t', 'src/lib/posts/calendario');
		expect([...linked.keys()]).toEqual([PATH]);
		expect([...(linked.get(PATH) ?? [])]).toEqual([
			'Cuerdas Inventadas',
			'Serie Inventada',
			'Alias Inventado'
		]);

		const { planTagRenameInPosts } = await import('../etiquetas/rename.js');
		const plan = await planTagRenameInPosts(client, 't', [
			{ type: 'rename', from: 'Cuerdas Inventadas', to: 'Cuerdas Renombradas', keepAlias: false }
		]);
		expect(plan.files.map((f) => f.path)).toEqual([OTHER_PATH]);
		expect(plan.files[0].after).toContain('  - Cuerdas Renombradas\n');
		expect(plan.summary).toContain(
			'1 publicación la tiene enlazada y cambia sola (no se reescribe)'
		);

		// Lo que hace el panel después: el commit de los posts y el `key` nuevo de la etiqueta.
		const linkedBefore = await stored();
		await client.commitFiles('t', {
			files: plan.files.map((f) => ({ path: f.path, content: f.after })),
			message: 'renombrar',
			unchanged: plan.files.map((f) => ({ path: f.path, sha: f.sha })),
			actor: 'admin-inventade',
			superadmin: true
		});
		await saveObject(
			t.db,
			{
				id: cuerdas.id,
				type: 'etiqueta',
				version: cuerdas.version,
				data: { key: 'Cuerdas Renombradas' }
			},
			{ actor: 'a', now: Date.now() + 1000 }
		);
		const linkedAfter = await stored();
		expect(linkedAfter.version).toBe(linkedBefore.version);
		expect(linkedAfter.data).toEqual(linkedBefore.data);
		expect(linkedAfter.data.tags).toEqual(['Suelta Inventada']);
		expect(await client.getFile('t', PATH)).toContain('  - Cuerdas Renombradas\n');
		const otherAfter = await stored(OTHER);
		expect(otherAfter.data.tags).toContain('Cuerdas Renombradas');
		expect(await client.getFile('t', OTHER_PATH)).toContain('  - Cuerdas Renombradas\n');
	});
});

describe('importar un .md', () => {
	const file = () => ({
		legacySlug: SLUG,
		raw: MD(),
		meta: JSON.parse(JSON.stringify(parse(MD().split('---\n')[1])))
	});

	it('crea los edges, y volver a planear no ve cambios', async () => {
		await tags();
		const r = await runImport(t.db, 'calendario', [file()], { actor: 'importacion' });
		expect(r.results.map((x) => x.action)).toEqual(['created']);
		const s = await stored();
		expect(s.edges.map((e) => e.key)).toEqual([
			'Cuerdas Inventadas',
			'Serie Inventada',
			'Alias Inventado'
		]);
		const plan = await planImport(t.db, 'calendario', [file()]);
		expect(plan.map((x) => [x.action, x.changed])).toEqual([['unchanged', []]]);
	});
});

describe('ida y vuelta con la base', () => {
	it('dehydrateContent/hydrateContent: eventos y material; una etiqueta borrada queda como texto', async () => {
		const { cuerdas } = await tags();
		const borrada = await makeTag('Borrada Inventada');
		await saveObject(
			t.db,
			{ id: borrada.id, type: 'etiqueta', version: borrada.version, deleted: true },
			{ actor: 'a' }
		);
		const data = {
			start: '2031-09-10T21:00-03:00',
			tags: ['Borrada Inventada', 'Cuerdas Inventadas', 'Suelta']
		};
		const split = await dehydrateContent(t.db, 'calendario', data);
		expect(split.data).toEqual({
			start: data.start,
			tags: ['Borrada Inventada', 'Suelta']
		});
		expect(split.edges?.etiqueta).toEqual([{ to: cuerdas.id, data: { at: [1] } }]);
		const evento = await saveObject(
			t.db,
			{ type: 'evento', title: 'E', slug: 'ida-y-vuelta', data: split.data, edges: split.edges },
			{ actor: 'a' }
		);
		const material = { summary: 'Guía', tags: ['Cuerdas Inventadas'] };
		const msplit = await dehydrateContent(t.db, 'material', material);
		expect(msplit.data).toEqual({ summary: 'Guía' });
		const guia = await saveObject(
			t.db,
			{ type: 'material', title: 'M', slug: 'guia', data: msplit.data, edges: msplit.edges },
			{ actor: 'a' }
		);
		const counted = countingDB(t.db);
		const [e, m] = await hydrateContent(counted.db, [evento, guia]);
		expect(e.data).toEqual(data);
		expect(m.data).toEqual(material);
		expect(counted.queries).toBe(1);
		// Otras categorías, tal cual.
		expect(await dehydrateTags(t.db, 'amigues', data)).toEqual({ data });
	});

	it('una parte nueva de un taller lleva las mismas etiquetas', async () => {
		await tags();
		const { client } = await setup();
		await create(client);
		const r = await createWorkshopPart(t.db, {
			eventSlug: SLUG,
			start: '2031-09-17T21:00-03:00',
			by: 'admin-inventade'
		});
		expect(r.ok).toBe(true);
		const part = /** @type {any} */ (
			await t.db
				.prepare("SELECT id, type, data FROM objects WHERE slug = ?1 AND type = 'evento'")
				.bind(/** @type {any} */ (r).slug)
				.first()
		);
		const edges = await tagEdgesOf(t.db, [part.id]);
		expect(withTagEdges(JSON.parse(part.data), edges.get(part.id)).tags).toEqual(TAGS);
		expect(edges.get(part.id)?.length).toBe(3);
	});
});

describe('las listas no hacen una consulta por post', () => {
	it('las mismas consultas con un evento que con tres (públicas y del panel)', async () => {
		await tags();
		const { client, repo } = await setup();
		await create(client);
		const posts = await import('./posts.js');

		const countLists = async () => {
			posts.clearContentCache();
			repo.clearDbPostCache();
			const counted = countingDB(t.db);
			const platform = /** @type {App.Platform} */ ({ env: { ...t.env, DB: counted.db } });
			await posts.sitePosts(platform);
			const site = counted.queries;
			counted.reset();
			await repo.allDbEventObjects(counted.db);
			return { site, panel: counted.queries };
		};
		const one = await countLists();
		for (const n of [2, 3]) {
			const slug = `fiesta-con-etiquetas-2031-0${n}`;
			await create(client, `src/lib/posts/calendario/${slug}.md`, MD(`Fiesta ${n}`, slug));
		}
		const three = await countLists();
		expect(three).toEqual(one);
		// Las listas públicas: la consulta de la marca y la de los posts (con los edges adentro).
		expect(one.site).toBe(2);
		// El panel: la marca, los posts y una para los edges de todos.
		expect(one.panel).toBe(3);
		const listed = (await posts.sitePosts(t.platform)).filter((p) =>
			String(p.meta.postID).startsWith('fiesta-con-etiquetas')
		);
		expect(listed).toHaveLength(3);
		for (const p of listed) expect(p.meta.tags.length).toBeGreaterThan(0);
	});
});
