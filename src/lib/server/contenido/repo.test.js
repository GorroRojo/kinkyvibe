/**
 * Guardar eventos en la base desde el panel (interruptor `contenido_db`): el cliente del repo
 * envuelto lee y guarda los eventos de la base, con versión nueva y historial en cada guardado,
 * aviso si alguien guardó en el medio, y deja todo lo demás (imágenes, .md que la base no tiene)
 * para el repo. Eventos inventados (fixtures/calendario) en un D1 de miniflare; el repo es de
 * mentira (en memoria).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { FileChangedError, PathExistsError } from '$lib/server/eventos/github.js';
import { runImport } from './importer.js';
import { listRevisions } from './revisions.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const metas = /** @type {Record<string, Record<string, any> | undefined>} */ (
	import.meta.glob('./fixtures/calendario/*.md', { import: 'metadata', eager: true })
);
const raws = /** @type {Record<string, string>} */ (
	import.meta.glob('./fixtures/calendario/*.md', { query: '?raw', import: 'default', eager: true })
);
const files = Object.keys(raws)
	.sort()
	.map((path) => ({
		legacySlug: path.split('/').pop()?.replace(/\.md$/, '') ?? '',
		raw: raws[path],
		meta: metas[path] ?? null
	}))
	.filter((f) => f.legacySlug !== 'sin-importar-2031-07');

const DIR = 'src/lib/posts/calendario';
const path = (/** @type {string} */ slug) => `${DIR}/${slug}.md`;

/** Un repo de mentira: los .md de los fixtures (también el que no se importa) y una imagen. */
function fakeRepo() {
	/** @type {Map<string, string>} */
	const store = new Map(
		Object.keys(raws).map((p) => [path(p.split('/').pop()?.replace(/\.md$/, '') ?? ''), raws[p]])
	);
	store.set(`${DIR}/media/taller-inventado-2031-02/1.webp`, 'imagen');
	/** @type {any[]} */
	const commits = [];
	return {
		store,
		commits,
		getFile: async (/** @type {string} */ _t, /** @type {string} */ p) => store.get(p) ?? null,
		readFile: async (/** @type {string} */ _t, /** @type {string} */ p) =>
			store.has(p) ? { raw: store.get(p), sha: 'repo:' + p, ref: 'main' } : null,
		pathExists: async (/** @type {string} */ _t, /** @type {string} */ p) =>
			[...store.keys()].some((k) => k === p || k.startsWith(p + '/')),
		existingPaths: async (/** @type {string} */ _t, /** @type {string[]} */ ps) =>
			ps.filter((p) => store.has(p)),
		listTree: async (/** @type {string} */ _t, /** @type {string} */ dir) =>
			[...store.keys()]
				.filter((k) => k.startsWith(dir + '/') && !k.slice(dir.length + 1).includes('/'))
				.map((k) => ({ path: k, sha: 'repo:' + k, type: 'blob' })),
		getDirTexts: async (/** @type {string} */ _t, /** @type {string} */ dir) =>
			[...store.entries()]
				.filter(([k]) => k.startsWith(dir + '/') && k.endsWith('.md'))
				.map(([k, text]) => ({ path: k, sha: 'repo:' + k, text })),
		listDir: async () => [],
		commitFiles: async (/** @type {string} */ _t, /** @type {any} */ opts) => {
			commits.push(opts);
			for (const f of opts.files) {
				if (f.delete) store.delete(f.path);
				else store.set(f.path, f.content ?? f.base64 ?? '');
			}
			return { sha: 'abc', url: 'https://ejemplo.test/commit/abc', pr: { number: 1 } };
		}
	};
}

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
	await runImport(t.db, 'calendario', files, { actor: 'importacion', now: Date.now() });
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** El módulo con el interruptor como se pida y la base registrada (como hooks.server.js). */
async function setup(flag = '1') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { CONTENIDO_DB_ENABLED: flag } }));
	const repo = await import('./repo.js');
	repo.setContentDB(t.db);
	const base = fakeRepo();
	return { repo, base, client: repo.withContentDb(base) };
}

/** @param {string} slug */
const objectOf = async (slug) =>
	/** @type {any} */ (
		await t.db
			.prepare(
				`SELECT o.id, o.title, o.version, o.deleted_at, o.data FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id
				WHERE o.type = 'evento' AND (s.legacy_slug = ?1 OR o.slug = ?1)`
			)
			.bind(slug)
			.first()
	);

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

describe('leer', () => {
	it('el texto de un evento de la base sale de la base, con el sha de ese texto', async () => {
		const { client } = await setup();
		const raw = await client.getFile('t', path('taller-inventado-2031-02'));
		expect(raw).toMatch(/^---\n/);
		expect(raw).toMatch(/^title: Taller Inventado de Nudos$/m);
		expect(raw).toContain('Nudos que no existen');
		const file = await client.readFile('t', path('taller-inventado-2031-02'));
		expect(file?.sha).toMatch(/^[0-9a-f]{40}$/);
		// El que la base no tiene sale del repo.
		expect(await client.getFile('t', path('sin-importar-2031-07'))).toBe(
			raws['./fixtures/calendario/sin-importar-2031-07.md']
		);
	});

	it('la carpeta de eventos muestra los textos de la base', async () => {
		const { client } = await setup();
		const texts = await client.getDirTexts('t', DIR);
		const taller = texts.find((f) => f.path === path('taller-inventado-2031-02'));
		expect(taller?.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(texts.find((f) => f.path === path('sin-importar-2031-07'))?.sha).toMatch(/^repo:/);
	});
});

describe('guardar', () => {
	it('editar guarda en la base con versión nueva e historial, sin tocar el repo', async () => {
		const { client, base } = await setup();
		const file = await client.readFile('t', path('taller-inventado-2031-02'));
		const content = String(file?.raw).replace('status: anunciado', 'status: abierto');
		const r = await client.commitFiles('t', {
			files: [{ path: path('taller-inventado-2031-02'), content }],
			message: 'edita',
			unchanged: [{ path: path('taller-inventado-2031-02'), sha: String(file?.sha) }],
			actor: 'admin-inventade'
		});
		expect(base.commits).toEqual([]);
		expect(r).toMatchObject({
			db: ['calendario/taller-inventado-2031-02'],
			url: '/calendario/taller-inventado-2031-02'
		});
		const o = await objectOf('taller-inventado-2031-02');
		expect(o.version).toBe(2);
		expect(JSON.parse(o.data).status).toBe('abierto');
		const revs = await listRevisions(t.db, o.id);
		expect(revs.map((x) => [x.version, x.source, x.savedBy])).toEqual([
			[2, 'panel', 'admin-inventade'],
			[1, 'import', 'importacion']
		]);
	});

	it('si alguien guardó en el medio, avisa y no pisa', async () => {
		const { client } = await setup();
		const file = await client.readFile('t', path('taller-inventado-2031-02'));
		const first = String(file?.raw).replace('status: anunciado', 'status: abierto');
		await client.commitFiles('t', {
			files: [{ path: path('taller-inventado-2031-02'), content: first }],
			message: 'a',
			unchanged: [{ path: path('taller-inventado-2031-02'), sha: String(file?.sha) }]
		});
		const second = String(file?.raw).replace('status: anunciado', 'status: cancelado');
		const e = await thrown(() =>
			client.commitFiles('t', {
				files: [{ path: path('taller-inventado-2031-02'), content: second }],
				message: 'b',
				unchanged: [{ path: path('taller-inventado-2031-02'), sha: String(file?.sha) }]
			})
		);
		// (los módulos se recargan en cada prueba: se compara por nombre de clase)
		expect(e?.constructor?.name).toBe(FileChangedError.name);
		expect(JSON.parse((await objectOf('taller-inventado-2031-02')).data).status).toBe('abierto');
	});

	it('un evento nuevo va a la base; la imagen, al repo', async () => {
		const { client, base } = await setup();
		const content = raws['./fixtures/calendario/taller-inventado-2031-02.md'].replace(
			'title: Taller Inventado de Nudos',
			'title: Taller Inventado Nuevo'
		);
		const slug = 'taller-inventado-nuevo-2031-09';
		await client.commitFiles('t', {
			files: [
				{ path: path(slug), content },
				{ path: `${DIR}/media/${slug}/1.webp`, base64: 'aW1hZ2Vu' }
			],
			message: 'publica',
			mustNotExist: [path(slug), `${DIR}/media/${slug}`]
		});
		expect(base.commits).toHaveLength(1);
		expect(base.commits[0].files.map((/** @type {any} */ f) => f.path)).toEqual([
			`${DIR}/media/${slug}/1.webp`
		]);
		expect(base.commits[0].mustNotExist).toEqual([`${DIR}/media/${slug}`]);
		expect((await objectOf(slug)).title).toBe('Taller Inventado Nuevo');
		// Ya existe: la misma dirección otra vez es un error, como en GitHub.
		const e = await thrown(() =>
			client.commitFiles('t', {
				files: [{ path: path(slug), content }],
				message: 'otra vez',
				mustNotExist: [path(slug)]
			})
		);
		expect(e?.constructor?.name).toBe(PathExistsError.name);
	});

	it('un .md que la base no tiene sigue yendo al repo', async () => {
		const { client, base } = await setup();
		const p = path('sin-importar-2031-07');
		await client.commitFiles('t', {
			files: [{ path: p, content: String(base.store.get(p)) + '\nMás.\n' }],
			message: 'edita'
		});
		expect(base.commits).toHaveLength(1);
		expect(await objectOf('sin-importar-2031-07')).toBeNull();
	});

	it('borrar es el borrado suave; volver a crearlo, deshacer', async () => {
		const { client } = await setup();
		const p = path('taller-inventado-2031-02');
		const raw = String(await client.getFile('t', p));
		await client.commitFiles('t', { files: [{ path: p, delete: true }], message: 'borra' });
		expect((await objectOf('taller-inventado-2031-02')).deleted_at).not.toBeNull();
		expect(await client.getFile('t', p)).toBeNull();
		expect(await client.pathExists('t', p)).toBe(true); // la dirección sigue ocupada
		await client.commitFiles('t', { files: [{ path: p, content: raw }], message: 'deshace' });
		const o = await objectOf('taller-inventado-2031-02');
		expect(o.deleted_at).toBeNull();
		expect(o.version).toBe(3);
	});

	it('datos inválidos: no se guarda nada (ni en el repo)', async () => {
		const { client, base } = await setup();
		const p = path('taller-inventado-2031-02');
		const raw = String(await client.getFile('t', p)).replace(
			'start: 2031-02-05T19:00-03:00',
			'start: mañana'
		);
		const e = await thrown(() =>
			client.commitFiles('t', {
				files: [
					{ path: p, content: raw },
					{ path: `${DIR}/media/taller-inventado-2031-02/2.webp`, base64: 'eA==' }
				],
				message: 'x'
			})
		);
		expect(String(e?.message)).toMatch(/Empieza/);
		expect(base.commits).toEqual([]);
		expect((await objectOf('taller-inventado-2031-02')).version).toBe(1);
	});
});

describe('las entradas y el panel leen el evento de la base', () => {
	it('la configuración de entradas, el título y lo oculto salen de la base', async () => {
		const { client } = await setup();
		const tickets = await import('$lib/server/tickets/events.js');
		// El .md de la fiesta no está en el repo de verdad: lo que se lee es lo de la base.
		expect(await tickets.getEventTickets('fiesta-inventada-2031-01')).not.toBeNull();
		expect((await tickets.getEventInfo('fiesta-inventada-2031-01'))?.title).toBe(
			'Fiesta Inventada de Prueba'
		);
		expect(await tickets.getEventInfo('charla-oculta-2031-03')).toBeNull();

		// Un cambio guardado desde el panel se ve enseguida.
		const p = path('fiesta-inventada-2031-01');
		const file = await client.readFile('t', p);
		await client.commitFiles('t', {
			files: [
				{
					path: p,
					content: String(file?.raw).replace('Fiesta Inventada de Prueba', 'Fiesta Renombrada')
				}
			],
			message: 'x',
			unchanged: [{ path: p, sha: String(file?.sha) }]
		});
		expect((await tickets.getEventInfo('fiesta-inventada-2031-01'))?.title).toBe(
			'Fiesta Renombrada'
		);
		const metas = await tickets.listEventMetas();
		expect(metas.find((m) => m.slug === 'fiesta-inventada-2031-01')?.meta.title).toBe(
			'Fiesta Renombrada'
		);
		expect(metas.some((m) => m.slug === 'charla-oculta-2031-03')).toBe(false);
	});
});

describe('con el interruptor apagado', () => {
	it('todo va al repo, como siempre', async () => {
		const { client, base } = await setup('0');
		const p = path('taller-inventado-2031-02');
		expect(await client.getFile('t', p)).toBe(base.store.get(p));
		await client.commitFiles('t', { files: [{ path: p, content: 'x' }], message: 'x' });
		expect(base.commits).toHaveLength(1);
		expect((await objectOf('taller-inventado-2031-02')).version).toBe(1);
	});
});
