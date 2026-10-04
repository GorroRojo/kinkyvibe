/**
 * Personas del material como edges `persona` (./personasEdges.js), como los eventos: guardar un
 * material (panel o importación) parte la lista (los perfiles vivos van a edges con sus roles y
 * lugares; los nombres y las direcciones sin perfil quedan en `data.personas`), y todo lo que se
 * lee (la página, las listas, el texto del editor, lo que compara la importación, «Descargar
 * todo») sale igual que cuando la dirección del perfil estaba en el JSON, con las mismas
 * consultas. Perfiles y material inventados; D1 de miniflare; el repo es de mentira.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { coreTypes, validateData } from '$lib/server/objects/types/index.js';
import { materialToMeta } from './material.js';
import { markdownToPost, postToMarkdown } from './markdown.js';
import { planImport, runImport } from './importer.js';
import { contentArchiveFiles } from './download.js';
import { listRevisions } from './revisions.js';
import { dehydratePersonas, hydratePersonas, withPersonaEdges } from './personasEdges.js';
import { dehydrateContent, hydrateContent } from './relaciones.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

describe('la forma de antes del material (puro)', () => {
	it('authors + extra.personas con edges pasa a la lista única con el rol Autore', () => {
		const data = { summary: 'x', authors: ['Uno'], extra: { color: 'violeta' } };
		expect(
			withPersonaEdges(
				data,
				[{ slug: 'colectivo-a', data: { roles: ['Ilustra'], at: [1] } }],
				'material'
			)
		).toEqual({
			summary: 'x',
			extra: { color: 'violeta' },
			personas: [
				{ name: 'Uno', role: 'Autore' },
				{ profile: 'colectivo-a', role: 'Ilustra' }
			]
		});
	});
});

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

const SLUG = 'guia-con-personas-inventada';
const PATH = `src/lib/posts/material/${SLUG}.md`;

/** Un .md con autores, perfiles (uno oculto, uno que no existe) y un nombre libre. */
const MD = (/** @type {string} */ title = 'Guía Con Personas') =>
	[
		'---',
		'published_date: 2030-03-01Z-03:00',
		`title: ${title}`,
		'summary: Una guía inventada con personas',
		'tags:',
		'  - español',
		'layout: material',
		'category: material',
		'authors:',
		'  - Autore Inventade',
		'personas:',
		'  - perfil: colectivo-inventado',
		'    rol: Ilustra',
		'  - nombre: Persona Sin Perfil',
		'    rol: Fotografía',
		'  - perfil: oculta-inventada',
		'    rol: Autore',
		'  - perfil: colectivo-inventado',
		'    rol: Edita',
		'  - perfil: no-existe-inventade',
		'    rol: Traduce',
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

/** @returns {any} un repo de mentira vacío */
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

/** El cliente del repo con la base (como hooks.server.js). */
async function setup() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
	const repo = await import('./repo.js');
	repo.setContentDB(t.db);
	repo.clearDbPostCache();
	const posts = await import('./posts.js');
	posts.clearContentCache();
	return { repo, posts, client: repo.withContentDb(fakeRepo()) };
}

/** @param {Awaited<ReturnType<typeof setup>>['client']} client */
const create = (client, content = MD()) =>
	client.commitFiles('t', {
		files: [{ path: PATH, content }],
		message: 'nuevo',
		actor: 'admin-inventade',
		superadmin: true
	});

/** El material guardado y sus edges `persona` (con la dirección del perfil). */
async function stored() {
	const row = /** @type {any} */ (
		await t.db
			.prepare(
				`SELECT o.id, o.version, o.data FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id
				WHERE o.type = 'material' AND coalesce(s.legacy_slug, o.slug) = ?1`
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

const materialType = /** @type {import('../objects/types/index.js').CoreType} */ (
	coreTypes.get('material')
);

/** Lo que guardaba antes el panel: el .md convertido, con las direcciones en `data.personas`. */
const before = (raw = MD()) => {
	const mapped = markdownToPost('material', SLUG, raw);
	const valid = validateData(materialType, { ...mapped.data, body_html: 'libre' });
	if (!valid.ok) throw new Error('el .md de prueba no es válido');
	return { title: mapped.title, data: valid.data, visibility: mapped.visibility };
};

describe('guardar material desde el panel', () => {
	it('los perfiles vivos van a edges `persona`; en `data` quedan los nombres y lo que no es un perfil', async () => {
		const { colectivo, oculta } = await profiles();
		const { client } = await setup();
		await create(client);
		const s = await stored();
		expect(s.edges).toEqual([
			{ slug: 'colectivo-inventado', data: { roles: ['Ilustra', 'Edita'], at: [1, 4] } },
			{ slug: 'oculta-inventada', data: { roles: ['Autore'], at: [3] } }
		]);
		expect(s.data.personas).toEqual([
			{ name: 'Autore Inventade', role: 'Autore' },
			{ name: 'Persona Sin Perfil', role: 'Fotografía' },
			{ profile: 'no-existe-inventade', role: 'Traduce' }
		]);
		expect(validateData(materialType, s.data).ok).toBe(true);
		const json = JSON.stringify(s.data);
		expect(json).not.toContain(colectivo.slug);
		expect(json).not.toContain(oculta.slug);
	});

	it('se lee igual que antes: el editor, la página, las listas, la búsqueda y «Descargar todo»', async () => {
		await profiles();
		const { client, repo, posts } = await setup();
		await create(client);
		const old = before();
		const oldMeta = materialToMeta(old);
		// El texto que arma la base para el editor.
		expect(await client.getFile('t', PATH)).toBe(postToMarkdown('material', old));
		// La ficha del panel.
		const found = /** @type {any} */ (await repo.findDbPostObject(t.db, 'material', SLUG));
		expect(materialToMeta(found.object)).toEqual(oldMeta);
		// La página pública y las listas (de las listas salen también el buscador y el RSS).
		const page = /** @type {any} */ (await posts.sitePost(t.platform, 'material', SLUG));
		expect(page.meta.personas).toEqual(oldMeta.personas);
		expect(page.meta.authors).toEqual(oldMeta.authors);
		const listed = /** @type {any} */ (
			(await posts.sitePosts(t.platform)).find((p) => p.meta.postID === SLUG)
		);
		expect(listed?.meta.personas).toEqual(oldMeta.personas);
		expect(listed?.meta.authors).toEqual(oldMeta.authors);
		// «Descargar todo»: el mismo .md que daba la lista entera en el JSON.
		const files = await contentArchiveFiles(t.db);
		const file = files.find((f) => f.name === `material/${SLUG}.md`);
		expect(file?.content).toBe(postToMarkdown('material', old, { legacy: true }));
		// Lo que muestra la página: el perfil oculto y la dirección sin perfil, nunca.
		const { resolvePersonas } = await import('$lib/server/personas/index.js');
		const roles = ['Autore', 'Ilustra'];
		const shown = await resolvePersonas(t.db, page.meta.personas, roles);
		expect(shown).toEqual(await resolvePersonas(t.db, oldMeta.personas, roles));
		expect(JSON.stringify(shown)).toContain('Colectivo Inventado');
		expect(JSON.stringify(shown)).not.toMatch(/Oculta Inventada|oculta-inventada|no-existe/);
	});

	it('las listas y la página hacen las mismas consultas con edges que sin edges', async () => {
		const { client, posts } = await setup();
		// Sin perfiles: todo queda en `data.personas`, sin edges.
		await create(client);
		expect((await stored()).edges).toEqual([]);
		const count = async () => {
			posts.clearContentCache();
			const counted = countingDB(t.db);
			const platform = /** @type {App.Platform} */ ({ env: { ...t.env, DB: counted.db } });
			await posts.sitePosts(platform);
			const list = counted.queries;
			counted.reset();
			await posts.sitePost(platform, 'material', SLUG);
			return { list, page: counted.queries };
		};
		const without = await count();
		// Con perfiles y edges.
		await resetDB(t.db);
		await profiles();
		await create(client);
		expect((await stored()).edges).toHaveLength(2);
		expect(await count()).toEqual(without);
	});

	it('volver a guardar no cambia los edges; sacar un perfil saca su edge', async () => {
		await profiles();
		const { client } = await setup();
		await create(client);
		const first = await stored();
		const file = /** @type {{ raw: string, sha: string }} */ (await client.readFile('t', PATH));
		await client.commitFiles('t', {
			files: [{ path: PATH, content: file.raw.replace('Guía Con Personas', 'Guía Cambiada') }],
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

		const again = /** @type {{ raw: string, sha: string }} */ (await client.readFile('t', PATH));
		const without = again.raw.replace(/ {2}- perfil: oculta-inventada\n {4}rol: Autore\n/, '');
		expect(without).not.toBe(again.raw);
		await client.commitFiles('t', {
			files: [{ path: PATH, content: without }],
			message: 'editar',
			unchanged: [{ path: PATH, sha: again.sha }],
			actor: 'admin-inventade',
			superadmin: true
		});
		expect((await stored()).edges.map((e) => e.slug)).toEqual(['colectivo-inventado']);
		expect(await client.getFile('t', PATH)).toBe(without);
	});

	it('si el perfil cambia de dirección, el material lo nombra con la nueva', async () => {
		const { colectivo } = await profiles();
		const { client, posts } = await setup();
		await create(client);
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
	});
});

describe('importar un .md de material', () => {
	const file = () => ({
		legacySlug: SLUG,
		raw: MD(),
		meta: JSON.parse(JSON.stringify(parse(MD().split('---\n')[1])))
	});

	it('crea los edges, y volver a planear no ve cambios', async () => {
		await profiles();
		const r = await runImport(t.db, 'material', [file()], { actor: 'importacion' });
		expect(r.results.map((x) => x.action)).toEqual(['created']);
		const s = await stored();
		expect(s.edges.map((e) => e.slug)).toEqual(['colectivo-inventado', 'oculta-inventada']);
		const plan = await planImport(t.db, 'material', [file()]);
		expect(plan.map((x) => [x.action, x.changed])).toEqual([['unchanged', []]]);
	});

	it('lo importado antes (lista entera en el JSON, sin edges) se compara igual', async () => {
		await profiles();
		// Como lo dejaba el código de antes: la lista entera en `data.personas`.
		await runImport(t.db, 'material', [file()], { actor: 'importacion' });
		const s = await stored();
		await t.db.batch([
			t.db.prepare("DELETE FROM edges WHERE from_id = ?1 AND kind = 'persona'").bind(s.id),
			t.db
				.prepare('UPDATE objects SET data = ?2, version = version + 1 WHERE id = ?1')
				.bind(s.id, JSON.stringify(before().data)),
			t.db
				.prepare(
					'UPDATE content_sources SET imported_version = imported_version + 1 WHERE object_id = ?1'
				)
				.bind(s.id)
		]);
		const plan = await planImport(t.db, 'material', [file()]);
		expect(plan.map((x) => [x.action, x.changed])).toEqual([['unchanged', []]]);
	});
});

describe('ida y vuelta con la base', () => {
	it('dehydrateContent/hydrateContent y dehydratePersonas/hydratePersonas, en una consulta', async () => {
		const { colectivo } = await profiles();
		const data = {
			summary: 'Guía',
			personas: [
				{ name: 'Une', role: 'Autore' },
				{ profile: colectivo.slug, role: 'Ilustra' }
			]
		};
		const split = await dehydrateContent(t.db, 'material', data);
		expect(split.data).toEqual({ summary: 'Guía', personas: [data.personas[0]] });
		expect(split.edges?.persona).toEqual([
			{ to: colectivo.id, data: { roles: ['Ilustra'], at: [1] } }
		]);
		expect(await dehydratePersonas(t.db, 'material', data)).toEqual({
			data: split.data,
			edges: { persona: split.edges?.persona }
		});
		const guia = await saveObject(
			t.db,
			{ type: 'material', title: 'M', slug: 'guia', data: split.data, edges: split.edges },
			{ actor: 'a' }
		);
		const counted = countingDB(t.db);
		const [m] = await hydrateContent(counted.db, [guia]);
		expect(m.data).toEqual(data);
		expect(counted.queries).toBe(1);
		const [p] = await hydratePersonas(t.db, [guia]);
		expect(p.data).toEqual(data);
	});
});
