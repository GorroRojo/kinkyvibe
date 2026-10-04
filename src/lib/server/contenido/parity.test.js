/**
 * PRUEBAS DE PARIDAD: las páginas reciben de la base (la única fuente de los eventos) lo mismo que
 * recibían de los .md. Eventos inventados (fixtures/calendario, datos falsos) importados a un D1
 * de miniflare con la importación de verdad; del lado .md, el mismo `processPost` que usa el sitio.
 *
 * También: la importación es idempotente, informa lo que cambia, no pisa lo editado en el panel,
 * guarda el historial; la visibilidad (oculto, no listado, borrado), que un .md que no está en la
 * base no se muestre y que el contador «No listadas» del panel dé lo mismo que la lista.
 *
 * (Las pruebas «con el interruptor apagado» se sacaron con el interruptor: el modo «.md» ya no
 * existe. No es aflojar las pruebas: es sacar un modo.)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { runQuery } from '$lib/server/db/batch.js';
import { ANON, visibleWhere } from '$lib/server/objects/visibility.js';
import { saveObject } from '$lib/server/objects/save.js';
import { buildIcsFeed } from '$lib/utils/icsFeed.js';
import { stripMarkdown } from '$lib/utils/search.js';
import { EVENT_FIELDS } from './eventos.js';
import { CATEGORY_LIST, categoryOfType } from './categories.js';
import { metaDiff, normalizeMeta } from './parity.js';
import { planImport, runImport, summarizeImport } from './importer.js';
import { listRevisions } from './revisions.js';
import { splitMarkdown } from '../amigues/importer.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

/** Lo que devuelve `fetchMarkdownPosts` (el lado .md), armado en beforeAll. */
const md = vi.hoisted(() => ({
	/** @type {any[]} */ listed: [],
	/** @type {any[]} */ unlisted: []
}));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki ? [] : structuredClone(unlisted ? md.unlisted : md.listed)
}));

const metas = /** @type {Record<string, Record<string, any> | undefined>} */ (
	import.meta.glob('./fixtures/calendario/*.md', { import: 'metadata', eager: true })
);
const raws = /** @type {Record<string, string>} */ (
	import.meta.glob('./fixtures/calendario/*.md', { query: '?raw', import: 'default', eager: true })
);
/** @param {string} path */
const slugOf = (path) => path.split('/').pop()?.replace(/\.md$/, '') ?? '';
/** Los fixtures como los da `bundledSourceFiles` (en orden alfabético, como el glob del sitio). */
const allFiles = Object.keys(raws)
	.sort()
	.map((path) => ({ legacySlug: slugOf(path), raw: raws[path], meta: metas[path] ?? null }));
const NOT_IMPORTED = 'sin-importar-2031-07';
const files = allFiles.filter((f) => f.legacySlug !== NOT_IMPORTED);

const TEXT_KEYS = Object.entries(EVENT_FIELDS)
	.filter(([, f]) => ['text', 'datetime', 'url'].includes(f.kind))
	.map(([k]) => k);
/** @param {Record<string, unknown>} meta */
const norm = (meta) => normalizeMeta(meta, { textKeys: TEXT_KEYS });

const ADMIN = { role: /** @type {const} */ ('admin'), id: 'admin-inventade' };
const NOW = Date.parse('2026-10-01T12:00:00Z');

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {typeof import('$lib/utils')} */
let utils;
beforeAll(async () => {
	t = await createTestDB();
	utils = await import('$lib/utils');
	// El lado .md, como loadMarkdownPosts: en el orden del glob, sin los ocultos, y ordenado por fecha.
	/** @type {any[]} */
	const all = [];
	for (const f of allFiles) {
		if (!f.meta || f.meta.force_unpublished) continue;
		all.push(await utils.processPost(undefined, f.legacySlug, /** @type {any} */ (f.meta), true));
	}
	/** @param {any} x */
	const time = (x) =>
		new Date(x.meta?.start ?? x.meta?.updated_date ?? x.meta?.published_date).getTime();
	all.sort((a, b) => time(b) - time(a));
	md.listed = all.filter((p) => !p.meta.force_unlisted);
	md.unlisted = all.filter((p) => p.meta.force_unlisted);
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});
afterEach(() => {
	vi.resetModules();
});

/** El módulo de lectura, recién cargado. */
async function contenido() {
	vi.resetModules();
	const posts = await import('./posts.js');
	posts.clearContentCache();
	return posts;
}

async function importAll() {
	const r = await runImport(t.db, 'calendario', files, { actor: 'admin-inventade', now: NOW });
	expect(r.remaining).toBe(0);
	return r;
}

/** @param {any[]} posts */
const ids = (posts) => posts.map((p) => p.meta.postID);

describe('importación', () => {
	it('crea los eventos, informa lo que no puede y es idempotente', async () => {
		const plan = await planImport(t.db, 'calendario', files);
		expect(summarizeImport(plan)).toMatchObject({ created: 6, invalid: 1, error: 0 });
		expect(plan.find((r) => r.legacySlug === 'roto-2031-06')?.action).toBe('invalid');
		expect(
			plan.find((r) => r.legacySlug === 'fiesta-inventada-2031-01')?.warnings.join(' ')
		).toMatch(/día siguiente/);

		const first = await importAll();
		expect(summarizeImport(first.results)).toMatchObject({ created: 6, error: 0 });
		const again = await runImport(t.db, 'calendario', files, { actor: 'x', now: NOW });
		expect(again.results).toEqual([]);
		expect(summarizeImport(again.plan)).toMatchObject({ unchanged: 6, invalid: 1 });
		// Sin cambios: ningún campo distinto (la base tiene lo mismo que daría importar hoy).
		expect(again.plan.filter((r) => r.action === 'unchanged').every((r) => !r.changed.length)).toBe(
			true
		);
	});

	// «Personas en una sola sección»: lo importado antes guardaba `authors` y `extra.personas`.
	// No se migra: se lee igual, volver a importar no lo ve como cambio y guardarlo lo reacomoda.
	it('lo importado con la forma de antes (authors + extra.personas) sigue andando', async () => {
		await importAll();
		const slug = 'taller-inventado-2031-02';
		const row = /** @type {any} */ (
			await t.db
				.prepare(
					`SELECT o.id, o.data FROM content_sources s JOIN objects o ON o.id = s.object_id
					WHERE s.legacy_slug = ?1`
				)
				.bind(slug)
				.first()
		);
		const data = JSON.parse(row.data);
		expect(data.personas).toEqual([
			{ name: 'Persona Inventada', role: 'Organiza' },
			{ name: 'Otre Inventade', role: 'Organiza' }
		]);
		expect(data).not.toHaveProperty('authors');
		// Como lo guardaba la importación antes de este cambio.
		const { personas, ...old } = data;
		old.authors = personas.map((/** @type {any} */ p) => p.name);
		await saveObject(
			t.db,
			{ id: row.id, type: 'evento', version: 1, data: old },
			{ actor: 'admin-inventade', now: NOW }
		);
		const stored = /** @type {any} */ (
			await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(row.id).first()
		);
		expect(JSON.parse(stored.data)).not.toHaveProperty('personas');

		const plan = await planImport(t.db, 'calendario', files);
		expect(plan.find((r) => r.legacySlug === slug)).toMatchObject({
			action: 'unchanged',
			changed: []
		});
		const posts = await contenido();
		const post = await posts.siteEvent(t.platform, slug);
		expect(post?.meta.authors).toEqual(['Persona Inventada', 'Otre Inventade']);
		const f = files.find((x) => x.legacySlug === slug);
		const fromMd = await utils.processPost(undefined, slug, /** @type {any} */ (f?.meta));
		expect(metaDiff(norm(post?.meta ?? {}), norm(fromMd.meta))).toEqual([]);
	});

	it('la dirección vieja con mayúsculas se guarda; el objeto usa minúsculas', async () => {
		await importAll();
		const row = await t.db
			.prepare(
				`SELECT o.slug, s.legacy_slug FROM content_sources s JOIN objects o ON o.id = s.object_id
				WHERE s.legacy_slug = 'Encuentro-Pasado-BDSM-2025-05'`
			)
			.first();
		expect(row).toEqual({
			slug: 'encuentro-pasado-bdsm-2025-05',
			legacy_slug: 'Encuentro-Pasado-BDSM-2025-05'
		});
	});

	it('va de a tandas', async () => {
		const r1 = await runImport(t.db, 'calendario', files, { actor: 'a', now: NOW, limit: 2 });
		expect(r1.results).toHaveLength(2);
		expect(r1.remaining).toBe(4);
		const r2 = await runImport(t.db, 'calendario', files, { actor: 'a', now: NOW, limit: 10 });
		expect(r2.results).toHaveLength(4);
		expect(r2.remaining).toBe(0);
	});

	it('un .md cambiado actualiza (con los campos distintos) y queda en el historial', async () => {
		await importAll();
		const changed = files.map((f) =>
			f.legacySlug === 'taller-inventado-2031-02'
				? {
						...f,
						raw: f.raw.replace('status: anunciado', 'status: abierto'),
						meta: { ...f.meta, status: 'abierto' }
					}
				: f
		);
		const plan = await planImport(t.db, 'calendario', changed);
		const row = plan.find((r) => r.legacySlug === 'taller-inventado-2031-02');
		expect(row).toMatchObject({ action: 'updated', changed: ['status'] });
		await runImport(t.db, 'calendario', changed, { actor: 'a', now: NOW + 1 });
		const revisions = await listRevisions(t.db, /** @type {number} */ (row?.objectId));
		expect(revisions.map((r) => [r.version, r.source, r.data.status])).toEqual([
			[2, 'import', 'abierto'],
			[1, 'import', 'anunciado']
		]);
	});

	it('no pisa lo editado en el panel ni revive lo borrado', async () => {
		await importAll();
		const plan = await planImport(t.db, 'calendario', files);
		const taller = /** @type {any} */ (
			plan.find((r) => r.legacySlug === 'taller-inventado-2031-02')
		);
		const fiesta = /** @type {any} */ (
			plan.find((r) => r.legacySlug === 'fiesta-inventada-2031-01')
		);
		await saveObject(
			t.db,
			{ id: taller.objectId, type: 'evento', version: 1, title: 'Taller Editado en el Panel' },
			{ actor: 'admin-inventade', now: NOW }
		);
		await saveObject(
			t.db,
			{ id: fiesta.objectId, type: 'evento', version: 1, deleted: true },
			{ actor: 'admin-inventade', now: NOW }
		);
		const changed = files.map((f) => ({ ...f, raw: f.raw + '\nMás texto.\n' }));
		const after = await planImport(t.db, 'calendario', changed);
		expect(after.find((r) => r.legacySlug === 'taller-inventado-2031-02')).toMatchObject({
			action: 'skipped_edited'
		});
		expect(after.find((r) => r.legacySlug === 'taller-inventado-2031-02')?.changed).toContain(
			'title'
		);
		expect(after.find((r) => r.legacySlug === 'fiesta-inventada-2031-01')?.action).toBe(
			'skipped_deleted'
		);
	});
});

describe('paridad: lo que reciben las páginas', () => {
	it('las listas: los mismos eventos, en el mismo orden, con la misma metadata', async () => {
		await importAll();
		const posts = await contenido();
		for (const unlisted of [false, true]) {
			const fromDb = await posts.sitePosts(t.platform, false, unlisted);
			const fromMd = (unlisted ? md.unlisted : md.listed).filter(
				(/** @type {any} */ p) => p.meta.postID !== NOT_IMPORTED
			);
			expect(ids(fromDb)).toEqual(ids(fromMd));
			for (const [i, p] of fromDb.entries()) {
				expect(p.path).toBe(fromMd[i].path);
				expect(metaDiff(norm(p.meta), norm(fromMd[i].meta)), p.meta.postID).toEqual([]);
			}
		}
		// El que no se importó no sale (aunque tenga .md); el oculto no sale en ningún lado.
		const listed = ids(await posts.sitePosts(t.platform));
		expect(listed).not.toContain(NOT_IMPORTED);
		expect(listed).not.toContain('charla-oculta-2031-03');
		expect(ids(await posts.sitePosts(t.platform, false, true))).toEqual([
			'ciclo-no-listado-2031-04'
		]);
	});

	it('la página de cada evento: la misma metadata y el texto armado', async () => {
		await importAll();
		const posts = await contenido();
		for (const f of files) {
			if (!f.meta || f.meta.force_unpublished) continue;
			const post = await posts.siteEvent(t.platform, f.legacySlug);
			if (!post) throw new Error(`no se encontró ${f.legacySlug}`);
			const fromMd = await utils.processPost(undefined, f.legacySlug, /** @type {any} */ (f.meta));
			expect(post.path).toBe(fromMd.path);
			expect(metaDiff(norm(post.meta), norm(fromMd.meta)), f.legacySlug).toEqual([]);
			expect(post.authorsProfiles?.map((a) => a.path)).toEqual(
				fromMd.authorsProfiles?.map((a) => a.path)
			);
			expect(post).not.toHaveProperty('content');
		}
		const fiesta = await posts.siteEvent(t.platform, 'fiesta-inventada-2031-01');
		const html = fiesta?.html ?? '';
		expect(html).toContain('<strong>inventada</strong>');
		expect(html).toContain('href="/wiki/bondage"');
		expect(html).toContain('<li>Música inventada</li>');
		expect(html).not.toContain('<style');
	});

	it('el .ics sale igual', async () => {
		await importAll();
		const posts = await contenido();
		const fromDb = await posts.sitePosts(t.platform);
		const strip = (/** @type {string} */ s) => s.replace(/^DTSTAMP:.*$/gm, '');
		const fromMd = md.listed.filter((/** @type {any} */ p) => p.meta.postID !== NOT_IMPORTED);
		expect(strip(buildIcsFeed(fromDb))).toBe(strip(buildIcsFeed(fromMd)));
	});

	it('el texto para la búsqueda sale igual', async () => {
		await importAll();
		const posts = await contenido();
		const bodies = await posts.siteBodies(t.platform);
		for (const f of files) {
			if (!f.meta || f.meta.force_unpublished || f.meta.force_unlisted) continue;
			const stored = bodies.get(`/calendario/${f.legacySlug}`);
			expect(stripMarkdown(stored ?? '').trim(), f.legacySlug).toBe(stripMarkdown(f.raw).trim());
		}
		expect(splitMarkdown(files[0].raw).body).toBeTruthy();
	});
});

describe('visibilidad', () => {
	it('oculto: 404 para el público, visible para admins', async () => {
		await importAll();
		const posts = await contenido();
		expect(await posts.siteEvent(t.platform, 'charla-oculta-2031-03')).toBeNull();
		const admin = await posts.siteEvent(t.platform, 'charla-oculta-2031-03', { viewer: ADMIN });
		expect(admin?.meta.title).toBe('Charla Oculta Inventada');
	});

	it('la dirección vieja con mayúsculas sigue andando', async () => {
		await importAll();
		const posts = await contenido();
		const found = await posts.siteEvent(t.platform, 'Encuentro-Pasado-BDSM-2025-05');
		expect(found?.path).toBe('/calendario/Encuentro-Pasado-BDSM-2025-05');
	});

	it('borrado en la base: no sale en las listas ni en su página, aunque el .md siga', async () => {
		await importAll();
		const plan = await planImport(t.db, 'calendario', files);
		const taller = /** @type {any} */ (
			plan.find((r) => r.legacySlug === 'taller-inventado-2031-02')
		);
		await saveObject(
			t.db,
			{ id: taller.objectId, type: 'evento', version: 1, deleted: true },
			{ actor: 'admin-inventade', now: NOW }
		);
		const posts = await contenido();
		expect(ids(await posts.sitePosts(t.platform))).not.toContain('taller-inventado-2031-02');
		expect(await posts.siteEvent(t.platform, 'taller-inventado-2031-02')).toBeNull();
	});

	it('un cambio en la base se ve enseguida (lo recordado se renueva)', async () => {
		await importAll();
		const posts = await contenido();
		const before = await posts.sitePosts(t.platform);
		expect(before.find((p) => p.meta.postID === 'taller-inventado-2031-02')?.meta.title).toBe(
			'Taller Inventado de Nudos'
		);
		const plan = await planImport(t.db, 'calendario', files);
		const taller = /** @type {any} */ (
			plan.find((r) => r.legacySlug === 'taller-inventado-2031-02')
		);
		await saveObject(
			t.db,
			{ id: taller.objectId, type: 'evento', version: 1, title: 'Taller Cambiado en la Base' },
			{ actor: 'admin-inventade', now: NOW + 5 }
		);
		const after = await posts.sitePosts(t.platform);
		expect(after.find((p) => p.meta.postID === 'taller-inventado-2031-02')?.meta.title).toBe(
			'Taller Cambiado en la Base'
		);
	});

	it('lo que no está en la base no existe, aunque tenga .md (ni para admins)', async () => {
		await importAll();
		const posts = await contenido();
		expect(await posts.siteEvent(t.platform, NOT_IMPORTED)).toBeNull();
		expect(await posts.siteEvent(t.platform, NOT_IMPORTED, { viewer: ADMIN })).toBeNull();
	});

	it('sin base no hay eventos (ni del .md)', async () => {
		const posts = await contenido();
		const noDb = /** @type {App.Platform} */ ({ env: {} });
		expect(ids(await posts.sitePosts(noDb))).toEqual([]);
		expect(await posts.siteEvent(noDb, 'taller-inventado-2031-02')).toBeNull();
	});
});

describe('las listas no leen el cuerpo de los posts', () => {
	/**
	 * Lo que armaban las listas antes de leer sin el cuerpo: cada post con su `data` entero, y los
	 * cuerpos para la búsqueda en la misma lectura.
	 * @param {typeof import('./posts.js')} posts
	 */
	async function oldPath(posts) {
		const types = CATEGORY_LIST.map((c) => c.type);
		const t2 = types.map(() => '?').join(', ');
		const visible = visibleWhere(ANON, 'o');
		const { results: rows } = await t.db
			.prepare(
				`SELECT o.id, o.type, o.slug, o.title, o.data, o.visibility, s.legacy_slug FROM objects o
				LEFT JOIN content_sources s ON s.object_id = o.id
				WHERE o.type IN (${t2}) AND ${visible.sql} ORDER BY o.id`
			)
			.bind(...types, ...visible.params)
			.all();
		/** @type {any[]} */
		const listed = [];
		/** @type {any[]} */
		const unlisted = [];
		/** @type {Map<string, string>} */
		const bodies = new Map();
		for (const r of rows) {
			const cat = /** @type {NonNullable<ReturnType<typeof categoryOfType>>} */ (
				categoryOfType(String(r.type))
			);
			const data = JSON.parse(String(r.data));
			const object = { title: String(r.title), data, visibility: String(r.visibility) };
			const postID = r.legacy_slug ? String(r.legacy_slug) : String(r.slug);
			const post = await utils.processPost(
				undefined,
				postID,
				/** @type {any} */ (cat.toMeta(object)),
				true
			);
			(post.meta.force_unlisted ? unlisted : listed).push(post);
			if (typeof data.body === 'string' && data.body) bodies.set(post.path, data.body);
		}
		return {
			listed: posts.mergePosts(structuredClone(md.listed), listed),
			unlisted: posts.mergePosts(structuredClone(md.unlisted), unlisted),
			bodies
		};
	}

	it('dan lo mismo que leyendo todo, sin traer ningún cuerpo', async () => {
		await importAll();
		const posts = await contenido();
		const counted = countingDB(t.db);
		const platform = /** @type {App.Platform} */ ({ env: { ...t.env, DB: counted.db } });
		const listed = await posts.sitePosts(platform);
		const unlisted = await posts.sitePosts(platform, false, true);
		const old = await oldPath(posts);
		expect(listed).toEqual(old.listed);
		expect(unlisted).toEqual(old.unlisted);
		expect(listed.length).toBeGreaterThan(3);
		expect(old.bodies.size).toBeGreaterThan(3);
		// Ninguna fila leída para las listas trae el cuerpo.
		let rowsWithData = 0;
		for (const q of counted.log) {
			for (const row of /** @type {any} */ (q.result)?.results ?? []) {
				if (typeof row.data !== 'string') continue;
				rowsWithData++;
				expect(JSON.parse(row.data), String(row.slug)).not.toHaveProperty('body');
			}
		}
		expect(rowsWithData).toBeGreaterThan(3);

		// La búsqueda sí recibe los cuerpos: los mismos, leídos una vez por cambio de la base.
		expect(await posts.siteBodies(platform)).toEqual(old.bodies);
		counted.reset();
		expect(await posts.siteBodies(platform)).toEqual(old.bodies);
		expect(await posts.sitePosts(platform)).toEqual(old.listed);
		// Solo la consulta chica de «¿cambió algo?», una por llamada.
		expect(counted.queries).toBe(2);
		expect(counted.bytes()).toBeLessThan(400);
	});
});

describe('el contador «No listadas» del menú del panel', () => {
	/** Lo que mostraba antes: el largo de la lista de no listadas. */
	const fromList = async (/** @type {typeof import('./posts.js')} */ posts) =>
		(await posts.sitePosts(t.platform, false, true)).length;
	/** Lo de ahora: una consulta, sin armar las listas. */
	const fromQuery = async (/** @type {typeof import('./posts.js')} */ posts) =>
		runQuery(t.db, await posts.unlistedCountQuery(t.platform));

	/** @param {string} legacySlug */
	async function objectOf(legacySlug) {
		const row = await t.db
			.prepare(
				`SELECT o.id, o.version, o.data FROM objects o
				JOIN content_sources s ON s.object_id = o.id WHERE s.legacy_slug = ?1`
			)
			.bind(legacySlug)
			.first();
		if (!row) throw new Error(`no está en la base: ${legacySlug}`);
		return { id: Number(row.id), version: Number(row.version), data: JSON.parse(String(row.data)) };
	}

	it('da lo mismo que la lista de no listadas, también al ocultar, no listar y borrar', async () => {
		const extra = [
			// Un .md no listado que no está en la base, y otro de una categoría que no está en la base.
			{ meta: { category: 'calendario', postID: 'no-listado-sin-importar-2031-09' } },
			{ meta: { category: 'amigues', postID: 'perfil-no-listado-inventado' } }
		];
		md.unlisted.push(...extra);
		try {
			let posts = await contenido();
			// Sin nada importado: solo la ficha de amigues (los eventos salen solo de la base).
			expect(await fromQuery(posts)).toBe(await fromList(posts));
			expect(await fromQuery(posts)).toBe(1);

			await importAll();
			posts = await contenido();
			expect(await fromQuery(posts)).toBe(await fromList(posts));

			// Un evento listado pasa a no listado.
			const fiesta = await objectOf('fiesta-inventada-2031-01');
			await saveObject(
				t.db,
				{ ...fiesta, type: 'evento', data: { ...fiesta.data, unlisted: true } },
				{ actor: 'admin-inventade', now: NOW + 1 }
			);
			expect(await fromQuery(posts)).toBe(await fromList(posts));
			const withFiesta = Number(await fromQuery(posts));

			// El no listado se oculta: deja de contar.
			const ciclo = await objectOf('ciclo-no-listado-2031-04');
			await saveObject(
				t.db,
				{ id: ciclo.id, version: ciclo.version, type: 'evento', visibility: 'hidden' },
				{ actor: 'admin-inventade', now: NOW + 2 }
			);
			expect(await fromQuery(posts)).toBe(await fromList(posts));
			expect(await fromQuery(posts)).toBe(withFiesta - 1);

			// Borrado: tampoco cuenta, y su .md no vuelve.
			const borrar = await objectOf('fiesta-inventada-2031-01');
			await saveObject(
				t.db,
				{ id: borrar.id, version: borrar.version, type: 'evento', deleted: true },
				{ actor: 'admin-inventade', now: NOW + 3 }
			);
			expect(await fromQuery(posts)).toBe(await fromList(posts));
		} finally {
			md.unlisted.splice(md.unlisted.length - extra.length, extra.length);
		}
	});
});
