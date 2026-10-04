/**
 * Personas de un evento como edges `persona` (./personasEdges.js): guardar un evento parte la
 * lista (los perfiles vivos van a edges con sus roles y lugares; los nombres y las direcciones sin
 * perfil quedan en `data.personas`), y todo lo que se lee (la metadata de las páginas, el texto del
 * editor, lo que compara la importación) sale igual que antes, cuando la dirección del perfil
 * estaba en el JSON. Perfiles y eventos inventados; D1 de miniflare; el repo es de mentira.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { coreTypes, validateData } from '$lib/server/objects/types/index.js';
import { eventToMeta } from './eventos.js';
import { eventToMarkdown, markdownToEvent } from './markdown.js';
import { planImport, runImport } from './importer.js';
import { listRevisions } from './revisions.js';
import {
	dehydratePersonas,
	hydratePersonas,
	mergePersonaItems,
	splitPersonaItems,
	withPersonaEdges
} from './personasEdges.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

/** @typedef {import('$lib/utils/personasList.js').PersonaItem} PersonaItem */

describe('partir y volver a armar la lista (puro)', () => {
	const ids = new Map([
		['colectivo-a', 1],
		['persona-b', 2]
	]);
	/** @type {PersonaItem[][]} */
	const lists = [
		[],
		[{ name: 'Nombre', role: 'Organiza' }],
		[{ profile: 'colectivo-a', role: 'Organiza' }],
		[
			{ name: 'Nombre Inventado', role: 'Organiza' },
			{ profile: 'colectivo-a', role: 'Facilita' },
			{ name: 'Foto Libre', role: 'Fotografía' },
			{ profile: 'persona-b', role: 'Organiza' },
			{ profile: 'colectivo-a', role: 'Enseña' },
			{ profile: 'no-existe', role: 'Organiza' }
		],
		[
			{ profile: 'persona-b', role: 'Enseña' },
			{ profile: 'persona-b', role: 'Enseña' },
			{ name: 'Al Final', role: 'Diseño' }
		],
		[
			{ profile: 'colectivo-a', role: 'Organiza' },
			{ profile: 'persona-b', role: 'Organiza' },
			{ name: 'Uno', role: 'Organiza' },
			{ name: 'Dos', role: 'Organiza' }
		]
	];

	it('ida y vuelta: la misma lista, en el mismo orden', () => {
		for (const list of lists) {
			const { kept, edges } = splitPersonaItems(list, ids);
			// Los perfiles de `ids` nunca quedan en la lista; los demás, sí.
			expect(kept.some((it) => it.profile && ids.has(it.profile))).toBe(false);
			const slugOf = new Map([...ids].map(([s, id]) => [id, s]));
			const rows = edges.map((e) => ({ slug: String(slugOf.get(e.to)), data: e.data }));
			expect(mergePersonaItems(kept, rows)).toEqual(list);
		}
	});

	it('un perfil con dos roles es un solo edge, con los dos y sus lugares', () => {
		const { edges } = splitPersonaItems(lists[3], ids);
		expect(edges).toEqual([
			{ to: 1, data: { roles: ['Facilita', 'Enseña'], at: [1, 4] } },
			{ to: 2, data: { roles: ['Organiza'], at: [3] } }
		]);
	});

	it('un edge sin lugares (forma de personasToEdges) va al final; uno roto no rompe', () => {
		const kept = [{ name: 'Nombre', role: 'Organiza' }];
		expect(
			mergePersonaItems(kept, [
				{ slug: 'colectivo-a', data: { roles: ['Facilita'] } },
				{ slug: 'persona-b', data: 'roto' }
			])
		).toEqual([
			{ name: 'Nombre', role: 'Organiza' },
			{ profile: 'colectivo-a', role: 'Facilita' }
		]);
	});

	it('si `data.personas` ya trae a ese perfil (lista entera escrita sin partir), manda esa', () => {
		const data = {
			start: 'x',
			personas: [
				{ profile: 'colectivo-a', role: 'Organiza' },
				{ name: 'Nombre', role: 'Facilita' }
			]
		};
		expect(
			withPersonaEdges(data, [{ slug: 'colectivo-a', data: { roles: ['Organiza'], at: [0] } }])
		).toBe(data);
	});

	it('la forma de antes (authors + extra.personas) con edges pasa a la lista única', () => {
		const data = { start: 'x', authors: ['Uno'], extra: { color: 'violeta' } };
		expect(
			withPersonaEdges(data, [{ slug: 'colectivo-a', data: { roles: ['Facilita'], at: [1] } }])
		).toEqual({
			start: 'x',
			extra: { color: 'violeta' },
			personas: [
				{ name: 'Uno', role: 'Organiza' },
				{ profile: 'colectivo-a', role: 'Facilita' }
			]
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

const SLUG = 'fiesta-con-personas-2031-09';
const PATH = `src/lib/posts/calendario/${SLUG}.md`;

/** Un .md con quienes organizan, perfiles (uno oculto, uno que no existe) y un nombre libre. */
const MD = (/** @type {string} */ title = 'Fiesta Con Personas') =>
	[
		'---',
		`title: ${title}`,
		"summary: 'Resumen inventado'",
		'tags:',
		'  - fiesta',
		'layout: calendario',
		'category: calendario',
		'authors:',
		'  - Organizadore Inventade',
		'status: abierto',
		'start: 2031-09-10T21:00-03:00',
		'personas:',
		'  - perfil: colectivo-inventado',
		'    rol: Facilita',
		'  - nombre: Persona Sin Perfil',
		'    rol: Fotografía',
		'  - perfil: oculta-inventada',
		'    rol: Enseña',
		'  - perfil: colectivo-inventado',
		'    rol: Organiza',
		'  - perfil: no-existe-inventade',
		'    rol: Diseño',
		'---',
		'Texto inventado.',
		''
	].join('\n');

async function profiles() {
	const colectivo = await makeProfile(t.db, {
		title: 'Colectivo Inventado',
		slug: 'colectivo-inventado',
		kind: 'proyecto'
	});
	const oculta = await makeProfile(t.db, {
		title: 'Oculta Inventada',
		slug: 'oculta-inventada',
		visibility: 'hidden'
	});
	return { colectivo, oculta };
}

/**
 * Un repo de mentira vacío.
 * @returns {any}
 */
function fakeRepo() {
	/** @type {any[]} */
	const commits = [];
	return {
		commits,
		getFile: async () => null,
		readFile: async () => null,
		pathExists: async () => false,
		existingPaths: async () => [],
		listTree: async () => [],
		getDirTexts: async () => [],
		listDir: async () => [],
		commitFiles: async (/** @type {string} */ _t, /** @type {any} */ opts) => {
			commits.push(opts);
			return { sha: 'abc', url: 'https://ejemplo.test/commit/abc' };
		}
	};
}

/** El cliente del repo con `contenido_db` prendido (como hooks.server.js). */
async function setup() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: {
			CONTENIDO_DB_ENABLED: '1',
			PERSONAS_EVENTOS_ENABLED: '1',
			PERFILES_PUBLICOS_ENABLED: '1'
		}
	}));
	const repo = await import('./repo.js');
	repo.setContentDB(t.db);
	repo.clearDbPostCache();
	(await import('./posts.js')).clearContentCache();
	return { repo, client: repo.withContentDb(fakeRepo()) };
}

/** El evento guardado y sus edges `persona` (con la dirección del perfil). */
async function stored() {
	const row = /** @type {any} */ (
		await t.db
			.prepare(
				`SELECT o.id, o.version, o.data FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id
				WHERE o.type = 'evento' AND coalesce(s.legacy_slug, o.slug) = ?1`
			)
			.bind(SLUG)
			.first()
	);
	const { results } = await t.db
		.prepare(
			`SELECT p.slug, e.data FROM edges e JOIN objects p ON p.id = e.to_id
			WHERE e.from_id = ?1 AND e.kind = 'persona' ORDER BY e.position, e.id`
		)
		.bind(row.id)
		.all();
	return {
		id: Number(row.id),
		version: Number(row.version),
		data: JSON.parse(row.data),
		edges: results.map((r) => ({ slug: String(r.slug), data: JSON.parse(String(r.data)) }))
	};
}

/** Lo que guardaba antes el panel: el .md convertido, con las direcciones en `data.personas`. */
const before = () => {
	const mapped = markdownToEvent(SLUG, MD());
	const evento = /** @type {any} */ (coreTypes.get('evento'));
	const valid = validateData(evento, { ...mapped.data, body_html: 'libre' });
	if (!valid.ok) throw new Error('el .md de prueba no es válido');
	return { title: mapped.title, data: valid.data, visibility: mapped.visibility };
};

describe('guardar un evento desde el panel (contenido_db)', () => {
	it('los perfiles vivos van a edges `persona`; en `data` quedan los nombres y lo que no es un perfil', async () => {
		const { colectivo, oculta } = await profiles();
		const { client } = await setup();
		await client.commitFiles('t', {
			files: [{ path: PATH, content: MD() }],
			message: 'nuevo',
			actor: 'admin-inventade',
			superadmin: true
		});
		const s = await stored();
		expect(s.edges).toEqual([
			{ slug: 'colectivo-inventado', data: { roles: ['Facilita', 'Organiza'], at: [1, 4] } },
			{ slug: 'oculta-inventada', data: { roles: ['Enseña'], at: [3] } }
		]);
		expect(s.data.personas).toEqual([
			{ name: 'Organizadore Inventade', role: 'Organiza' },
			{ name: 'Persona Sin Perfil', role: 'Fotografía' },
			{ profile: 'no-existe-inventade', role: 'Diseño' }
		]);
		// Ninguna dirección de un perfil vivo en el JSON.
		const json = JSON.stringify(s.data);
		expect(json).not.toContain(colectivo.slug);
		expect(json).not.toContain(oculta.slug);
	});

	it('se lee igual que antes: el texto del editor, la metadata de las páginas y la del panel', async () => {
		await profiles();
		const { client, repo } = await setup();
		await client.commitFiles('t', {
			files: [{ path: PATH, content: MD() }],
			message: 'nuevo',
			actor: 'admin-inventade',
			superadmin: true
		});
		const old = before();
		// El texto que arma la base para el editor.
		expect(await client.getFile('t', PATH)).toBe(eventToMarkdown(old));
		// La metadata del panel (y de la venta de entradas, organizadores…).
		const found = await repo.findDbPostObject(t.db, 'calendario', SLUG);
		expect(eventToMeta(/** @type {any} */ (found).object)).toEqual(eventToMeta(old));
		const all = await repo.allDbEventObjects(t.db);
		expect(eventToMeta(/** @type {any} */ (all.get(SLUG)).object)).toEqual(eventToMeta(old));
		// Las páginas públicas: la del evento y las listas.
		const posts = await import('./posts.js');
		const page = /** @type {any} */ (await posts.sitePost(t.platform, 'calendario', SLUG));
		expect(page.meta.personas).toEqual(eventToMeta(old).personas);
		expect(page.meta.authors).toEqual(eventToMeta(old).authors);
		const listed = /** @type {any} */ (
			(await posts.sitePosts(t.platform)).find((p) => p.meta.postID === SLUG)
		);
		expect(listed?.meta.personas).toEqual(eventToMeta(old).personas);
		// Lo que muestra la página: el perfil oculto y la dirección sin perfil, nunca.
		const { resolvePersonas } = await import('$lib/server/personas/index.js');
		const shown = await resolvePersonas(t.db, page.meta.personas, ['Organiza', 'Facilita']);
		expect(shown).toEqual(
			await resolvePersonas(t.db, eventToMeta(old).personas, ['Organiza', 'Facilita'])
		);
		expect(JSON.stringify(shown)).toContain('Colectivo Inventado');
		expect(JSON.stringify(shown)).not.toMatch(/Oculta Inventada|oculta-inventada|no-existe/);
	});

	it('volver a guardar el mismo texto no cambia los edges y deja su revisión', async () => {
		await profiles();
		const { client } = await setup();
		await client.commitFiles('t', {
			files: [{ path: PATH, content: MD() }],
			message: 'nuevo',
			actor: 'admin-inventade',
			superadmin: true
		});
		const first = await stored();
		const file = /** @type {{ raw: string, sha: string }} */ (await client.readFile('t', PATH));
		await client.commitFiles('t', {
			files: [{ path: PATH, content: file.raw.replace('Fiesta Con Personas', 'Fiesta Cambiada') }],
			message: 'editar',
			unchanged: [{ path: PATH, sha: file.sha }],
			actor: 'admin-inventade',
			superadmin: true
		});
		const second = await stored();
		expect(second.version).toBe(first.version + 1);
		expect(second.edges).toEqual(first.edges);
		expect(second.data.personas).toEqual(first.data.personas);
		expect((await listRevisions(t.db, second.id)).map((r) => r.source)).toEqual(['panel', 'panel']);
	});

	it('sacar un perfil del texto saca su edge; un perfil que se crea después pasa a edge al guardar', async () => {
		await profiles();
		const { client } = await setup();
		await client.commitFiles('t', {
			files: [{ path: PATH, content: MD() }],
			message: 'nuevo',
			actor: 'admin-inventade',
			superadmin: true
		});
		await makeProfile(t.db, { title: 'No Existe Inventade', slug: 'no-existe-inventade' });
		const file = /** @type {{ raw: string, sha: string }} */ (await client.readFile('t', PATH));
		const without = file.raw.replace(/ {2}- perfil: oculta-inventada\n {4}rol: Enseña\n/, '');
		expect(without).not.toBe(file.raw);
		await client.commitFiles('t', {
			files: [{ path: PATH, content: without }],
			message: 'editar',
			unchanged: [{ path: PATH, sha: file.sha }],
			actor: 'admin-inventade',
			superadmin: true
		});
		const s = await stored();
		expect(s.edges.map((e) => e.slug)).toEqual(['colectivo-inventado', 'no-existe-inventade']);
		expect(s.data.personas).toEqual([
			{ name: 'Organizadore Inventade', role: 'Organiza' },
			{ name: 'Persona Sin Perfil', role: 'Fotografía' }
		]);
		expect(await client.getFile('t', PATH)).toBe(without);
	});
});

describe('el perfil cambia de dirección', () => {
	it('el evento lo sigue nombrando, con la dirección nueva (también en las listas recordadas)', async () => {
		const { colectivo } = await profiles();
		const { client, repo } = await setup();
		await client.commitFiles('t', {
			files: [{ path: PATH, content: MD() }],
			message: 'nuevo',
			actor: 'admin-inventade',
			superadmin: true
		});
		const posts = await import('./posts.js');
		const slugsIn = async () => {
			const post = /** @type {any} */ (
				(await posts.sitePosts(t.platform)).find((p) => p.meta.postID === SLUG)
			);
			return (post?.meta.personas ?? []).map((/** @type {any} */ p) => p.perfil).filter(Boolean);
		};
		expect(await slugsIn()).toContain('colectivo-inventado');
		await saveObject(
			t.db,
			{
				id: colectivo.id,
				type: 'perfil',
				version: colectivo.version,
				slug: 'colectivo-renombrado'
			},
			{ actor: 'a', now: Date.now() + 1000 }
		);
		expect(await slugsIn()).toContain('colectivo-renombrado');
		expect(await slugsIn()).not.toContain('colectivo-inventado');
		const all = await repo.allDbEventObjects(t.db);
		expect(JSON.stringify(all.get(SLUG)?.object.data)).toContain('colectivo-renombrado');
	});
});

describe('importar un .md', () => {
	// La metadata como la da mdsvex (el frontmatter, por JSON).
	const file = () => ({
		legacySlug: SLUG,
		raw: MD(),
		meta: JSON.parse(JSON.stringify(parse(MD().split('---\n')[1])))
	});

	it('crea los edges, y volver a planear no ve cambios (ni por la forma)', async () => {
		await profiles();
		const r = await runImport(t.db, 'calendario', [file()], { actor: 'importacion' });
		expect(r.results.map((x) => x.action)).toEqual(['created']);
		const s = await stored();
		expect(s.edges.map((e) => e.slug)).toEqual(['colectivo-inventado', 'oculta-inventada']);
		const plan = await planImport(t.db, 'calendario', [file()]);
		expect(plan.map((x) => [x.action, x.changed])).toEqual([['unchanged', []]]);
	});

	it('hydratePersonas/dehydratePersonas: ida y vuelta con la base', async () => {
		const { colectivo } = await profiles();
		const data = {
			start: '2031-09-10T21:00-03:00',
			personas: [
				{ name: 'Uno', role: 'Organiza' },
				{ profile: colectivo.slug, role: 'Facilita' }
			]
		};
		const split = await dehydratePersonas(t.db, 'calendario', data);
		expect(split.data).toEqual({ start: data.start, personas: [data.personas[0]] });
		const saved = await saveObject(
			t.db,
			{ type: 'evento', title: 'E', slug: 'ida-y-vuelta', data: split.data, edges: split.edges },
			{ actor: 'a' }
		);
		const [full] = await hydratePersonas(t.db, [saved]);
		expect(full.data).toEqual(data);
		// El material no se toca.
		expect(await dehydratePersonas(t.db, 'material', data)).toEqual({ data });
	});
});
