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
			return {
				sha: 'abc',
				url: 'https://ejemplo.test/commit/abc',
				pr: { number: 1, branch: 'rama-inventada' }
			};
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

describe('quién guarda: el login de GitHub en cada guardado del panel', () => {
	// Les admins guardan con su login (hooks.server.js corre el pedido con resolveAsPanelAuthor);
	// cada pantalla manda su nombre (`pr.who`, para el PR), que nunca es la autoría en la base.
	const LOGIN = 'persona-inventada';
	const NAME = 'Persona Inventada (nombre visible)';
	const SLUG = 'taller-inventado-2031-02';

	/** Corre `fn` como lo corre el panel para une admin, con todo cargado de nuevo. */
	async function asAdmin(
		/** @type {(s: Awaited<ReturnType<typeof setup>>) => Promise<unknown>} */ fn
	) {
		const s = await setup();
		const { runAsPanelAuthor } = await import('./author.js');
		await runAsPanelAuthor({ login: LOGIN, name: NAME, superadmin: true }, () => fn(s));
		return s;
	}
	const lastBy = async (slug = SLUG) =>
		(await listRevisions(t.db, (await objectOf(slug)).id))[0]?.savedBy;
	const actor = {
		login: LOGIN,
		name: NAME,
		token: 't',
		locals: { user: { id: 1, login: LOGIN, name: NAME } }
	};

	it('hooks.server.js: el pedido de une admin lleva su login; el de otres, nada', async () => {
		const { resolveAsPanelAuthor, panelAuthor } = await import('./author.js');
		const { ADMINS } = await import('$lib/server/auth');
		const admin = { ...ADMINS[0], name: 'Nombre visible' };
		expect(
			resolveAsPanelAuthor({ locals: /** @type {any} */ ({ user: admin }) }, () => panelAuthor())
		).toEqual({
			login: admin.login,
			name: 'Nombre visible',
			superadmin: true
		});
		const other = { id: 1, login: 'alguien-inventade' };
		expect(
			resolveAsPanelAuthor({ locals: /** @type {any} */ ({ user: other }) }, () => panelAuthor())
		).toBeNull();
		expect(
			resolveAsPanelAuthor({ locals: /** @type {any} */ ({}) }, () => panelAuthor())
		).toBeNull();
	});

	it('el editor, cargar un evento e importar la planilla (commit con `pr.who`)', async () => {
		await asAdmin(async ({ client }) => {
			const file = await client.readFile('t', path(SLUG));
			await client.commitFiles('t', {
				files: [{ path: path(SLUG), content: String(file?.raw).replace('anunciado', 'abierto') }],
				message: `[admin] ${NAME} updated calendario/${SLUG}`,
				unchanged: [{ path: path(SLUG), sha: String(file?.sha) }],
				pr: { action: 'edita', who: NAME }
			});
			const content = String(file?.raw).replace('Taller Inventado de Nudos', 'Taller Nuevo');
			await client.commitFiles('t', {
				files: [{ path: path('taller-nuevo-2031-09'), content }],
				message: 'publica',
				mustNotExist: [path('taller-nuevo-2031-09')],
				pr: { action: 'publica', who: NAME }
			});
			await client.commitFiles('t', {
				files: [{ path: path('importado-2031-10'), content }],
				message: 'importa',
				pr: { action: 'importa', who: NAME, kind: 'importar', slug: 'importado-2031-10' }
			});
		});
		expect(await lastBy()).toBe(LOGIN);
		expect(await lastBy('taller-nuevo-2031-09')).toBe(LOGIN);
		expect(await lastBy('importado-2031-10')).toBe(LOGIN);
	});

	it('la agenda (una fila y varias)', async () => {
		const { saveAgendaRow, saveAgendaRows } = await import('$lib/server/eventos/agenda.js');
		const { agendaRowFromMeta, agendaValues } = await import('$lib/utils/agenda.js');
		const { eventTagGroups } = await import('$lib/utils/adminTags.js');
		const places = eventTagGroups().places;
		const rowOf = async (/** @type {any} */ client, /** @type {string} */ slug) => {
			const { markdownToEvent } = await import('./markdown.js');
			const { eventToMeta } = await import('./eventos.js');
			const m = markdownToEvent(slug, String(await client.getFile('t', path(slug))));
			return agendaValues(agendaRowFromMeta(slug, eventToMeta(/** @type {any} */ (m))));
		};
		await asAdmin(async ({ client }) => {
			const before = await rowOf(client, SLUG);
			const r = await saveAgendaRow({
				client: /** @type {any} */ (client),
				token: 't',
				author: NAME,
				slug: SLUG,
				before,
				after: { ...before, title: 'Taller Inventado Renombrado' },
				places
			});
			expect(r.ok).toBe(true);
		});
		expect(await lastBy()).toBe(LOGIN);
		await resetDB(t.db);
		await runImport(t.db, 'calendario', files, { actor: 'importacion', now: Date.now() });
		await asAdmin(async ({ client }) => {
			const before = await rowOf(client, SLUG);
			const r = await saveAgendaRows({
				client: /** @type {any} */ (client),
				token: 't',
				author: NAME,
				rows: [{ slug: SLUG, before, after: { ...before, title: 'Otro título inventado' } }],
				places
			});
			expect(JSON.stringify(r)).not.toMatch(/"ok":false/);
		});
		expect(await lastBy()).toBe(LOGIN);
	});

	it('borrar y deshacer el borrado', async () => {
		const { deletePost, readPostFiles, undoDeletion } =
			await import('$lib/server/admin/deletions.js');
		/** @type {number} */
		let id = 0;
		await asAdmin(async ({ client }) => {
			const files = await readPostFiles(/** @type {any} */ (client), 't', 'calendario', SLUG);
			id = (
				await deletePost(/** @type {any} */ (client), t.db, actor, {
					kind: 'calendario',
					slug: SLUG,
					files: /** @type {any} */ (files)
				})
			).id;
		});
		expect((await objectOf(SLUG)).deleted_at).not.toBeNull();
		expect(await lastBy()).toBe(LOGIN);
		await asAdmin(async ({ client }) => {
			await undoDeletion(/** @type {any} */ (client), t.db, actor, id);
		});
		expect((await objectOf(SLUG)).deleted_at).toBeNull();
		expect(await lastBy()).toBe(LOGIN);
	});

	it('las etiquetas (commitTagEdit)', async () => {
		const { commitTagEdit } = await import('$lib/server/admin/tagEditor.js');
		await asAdmin(async ({ client }) => {
			const file = await client.readFile('t', path(SLUG));
			const after = String(file?.raw).replace('  - bondage\n  - bondage\n', '  - bondage\n');
			await commitTagEdit(
				/** @type {any} */ (client),
				't',
				/** @type {any} */ ({
					files: [{ path: path(SLUG), after, sha: String(file?.sha) }],
					summary: ['bondage repetida']
				}),
				NAME
			);
		});
		expect(await lastBy()).toBe(LOGIN);
	});
});

describe('cómo se muestra el texto que se guarda (decisión 0004)', () => {
	const SLUG = 'taller-inventado-2031-02';
	const htmlOf = async () => JSON.parse((await objectOf(SLUG)).data).body_html;

	/** @param {boolean} superadmin @param {(raw: string) => string} change */
	async function saveAs(superadmin, change) {
		const { client } = await setup();
		const { runAsPanelAuthor } = await import('./author.js');
		await runAsPanelAuthor({ login: 'alguien-inventade', superadmin }, async () => {
			const file = await client.readFile('t', path(SLUG));
			await client.commitFiles('t', {
				files: [{ path: path(SLUG), content: change(String(file?.raw)) }],
				message: 'edita',
				unchanged: [{ path: path(SLUG), sha: String(file?.sha) }]
			});
		});
	}

	it('lo importado es HTML libre; si no cambia el texto, sigue así aunque no sea superadmin', async () => {
		expect(await htmlOf()).toBe('libre');
		await saveAs(false, (raw) => raw.replace('status: anunciado', 'status: abierto'));
		expect(await htmlOf()).toBe('libre');
	});

	it('un texto editado por alguien que no es superadmin pasa a la lista corta', async () => {
		await saveAs(false, (raw) => `${raw}\n<iframe src="https://ejemplo.test"></iframe>\n`);
		expect(await htmlOf()).toBe('corta');
		// Y no se puede pedir HTML libre desde el texto.
		await saveAs(false, (raw) =>
			raw.replace('status: anunciado', 'status: abierto\nbody_html: libre')
		);
		expect(await htmlOf()).toBe('corta');
	});

	it('un texto editado por une superadmin es HTML libre', async () => {
		await saveAs(false, (raw) => `${raw}\nUn cambio.\n`);
		await saveAs(true, (raw) => `${raw}\nOtro cambio.\n`);
		expect(await htmlOf()).toBe('libre');
	});
});

describe('borradores de la agenda (carga rápida y «Confirmar») con el interruptor prendido', () => {
	const LOGIN = 'agenda-inventade';
	const admin = { token: 't', name: 'Agenda Inventade (nombre visible)' };
	const locals = /** @type {any} */ ({ user: { id: 1, login: LOGIN, name: admin.name } });

	it('el borrador nuevo va a la base con la marca, a nombre del login, y «Confirmar» se la saca', async () => {
		const s = await setup();
		const { runAsPanelAuthor } = await import('./author.js');
		const { createQuickDraft, confirmDraft } = await import('$lib/server/eventos/drafts.js');
		const { DRAFT_KEY } = await import('$lib/utils/sheetImport.js');
		/** @type {any} */
		let made;
		await runAsPanelAuthor({ login: LOGIN, name: admin.name, superadmin: true }, async () => {
			made = await createQuickDraft({
				client: /** @type {any} */ (s.client),
				admin,
				source: 'taller-inventado-2031-02',
				title: '',
				date: '2031-09-12',
				startTime: '',
				endTime: ''
			});
		});
		expect(made.ok).toBe(true);
		// En la base (no en el repo), no listado, con la marca y guardado por el login de GitHub.
		expect(s.base.store.has(path(made.slug))).toBe(false);
		const o = await objectOf(made.slug);
		expect(o).toBeTruthy();
		const data = JSON.parse(o.data);
		expect(data.unlisted).toBe(true);
		expect(JSON.stringify(data)).toContain(`"${DRAFT_KEY}":true`);
		expect((await listRevisions(t.db, o.id))[0]?.savedBy).toBe(LOGIN);
		// Lo que lee el panel (el cliente envuelto) es el borrador de la base.
		expect(await s.client.getFile('t', path(made.slug))).toContain(`${DRAFT_KEY}: true`);

		/** @type {any} */
		let confirmed;
		await runAsPanelAuthor({ login: LOGIN, name: admin.name, superadmin: true }, async () => {
			confirmed = await confirmDraft({
				platform: t.platform,
				locals,
				client: /** @type {any} */ (s.client),
				admin,
				slug: made.slug
			});
		});
		expect(confirmed).toMatchObject({ ok: true, status: 200 });
		expect(s.base.store.has(path(made.slug))).toBe(false);
		const after = JSON.parse((await objectOf(made.slug)).data);
		expect(after.unlisted ?? false).toBe(false);
		expect(JSON.stringify(after)).not.toContain(`"${DRAFT_KEY}"`);
		expect(await s.client.getFile('t', path(made.slug))).not.toContain(DRAFT_KEY);
		expect((await listRevisions(t.db, (await objectOf(made.slug)).id))[0]?.savedBy).toBe(LOGIN);
	});
});
