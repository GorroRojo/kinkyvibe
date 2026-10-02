/**
 * PRUEBAS DE PARIDAD: con el interruptor `contenido_db` prendido, las páginas reciben lo mismo de
 * la base que de los .md. Eventos inventados (fixtures/calendario, datos falsos) importados a un D1
 * de miniflare con la importación de verdad; del lado .md, el mismo `processPost` que usa el sitio.
 *
 * También: la importación es idempotente, informa lo que cambia, no pisa lo editado en el panel,
 * guarda el historial; la visibilidad (oculto, no listado, borrado) y que con el interruptor
 * apagado nada cambie.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { buildIcsFeed } from '$lib/utils/icsFeed.js';
import { stripMarkdown } from '$lib/utils/search.js';
import { EVENT_FIELDS } from './eventos.js';
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
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** El módulo de lectura con el interruptor como se pida. */
async function contenido(flag = '1') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { CONTENIDO_DB_ENABLED: flag } }));
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
		expect(summarizeImport(plan)).toMatchObject({ created: 5, invalid: 1, error: 0 });
		expect(plan.find((r) => r.legacySlug === 'roto-2031-06')?.action).toBe('invalid');
		expect(
			plan.find((r) => r.legacySlug === 'fiesta-inventada-2031-01')?.warnings.join(' ')
		).toMatch(/día siguiente/);

		const first = await importAll();
		expect(summarizeImport(first.results)).toMatchObject({ created: 5, error: 0 });
		const again = await runImport(t.db, 'calendario', files, { actor: 'x', now: NOW });
		expect(again.results).toEqual([]);
		expect(summarizeImport(again.plan)).toMatchObject({ unchanged: 5, invalid: 1 });
		// Sin cambios: ningún campo distinto (la base tiene lo mismo que daría importar hoy).
		expect(again.plan.filter((r) => r.action === 'unchanged').every((r) => !r.changed.length)).toBe(
			true
		);
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
		expect(r1.remaining).toBe(3);
		const r2 = await runImport(t.db, 'calendario', files, { actor: 'a', now: NOW, limit: 10 });
		expect(r2.results).toHaveLength(3);
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
		const posts = await contenido('1');
		for (const unlisted of [false, true]) {
			const fromDb = await posts.sitePosts(t.platform, false, unlisted);
			const fromMd = unlisted ? md.unlisted : md.listed;
			expect(ids(fromDb)).toEqual(ids(fromMd));
			for (const [i, p] of fromDb.entries()) {
				expect(p.path).toBe(fromMd[i].path);
				expect(metaDiff(norm(p.meta), norm(fromMd[i].meta)), p.meta.postID).toEqual([]);
			}
		}
		// El que no se importó sigue saliendo del .md; el oculto no sale en ningún lado.
		const listed = ids(await posts.sitePosts(t.platform));
		expect(listed).toContain(NOT_IMPORTED);
		expect(listed).not.toContain('charla-oculta-2031-03');
		expect(ids(await posts.sitePosts(t.platform, false, true))).toEqual([
			'ciclo-no-listado-2031-04'
		]);
	});

	it('la página de cada evento: la misma metadata y el texto armado', async () => {
		await importAll();
		const posts = await contenido('1');
		for (const f of files) {
			if (!f.meta || f.meta.force_unpublished) continue;
			const found = await posts.siteEvent(t.platform, f.legacySlug);
			expect(found.mode, f.legacySlug).toBe('db');
			const post = found.mode === 'db' ? found.post : null;
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
		const html = fiesta.mode === 'db' ? (fiesta.post?.html ?? '') : '';
		expect(html).toContain('<strong>inventada</strong>');
		expect(html).toContain('href="/wiki/bondage"');
		expect(html).toContain('<li>Música inventada</li>');
		expect(html).not.toContain('<style');
	});

	it('el .ics sale igual', async () => {
		await importAll();
		const posts = await contenido('1');
		const fromDb = await posts.sitePosts(t.platform);
		const strip = (/** @type {string} */ s) => s.replace(/^DTSTAMP:.*$/gm, '');
		expect(strip(buildIcsFeed(fromDb))).toBe(strip(buildIcsFeed(md.listed)));
	});

	it('el texto para la búsqueda sale igual', async () => {
		await importAll();
		const posts = await contenido('1');
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
		const posts = await contenido('1');
		expect(await posts.siteEvent(t.platform, 'charla-oculta-2031-03')).toEqual({
			mode: 'db',
			post: null
		});
		const admin = await posts.siteEvent(t.platform, 'charla-oculta-2031-03', { viewer: ADMIN });
		expect(admin.mode === 'db' && admin.post?.meta.title).toBe('Charla Oculta Inventada');
	});

	it('la dirección vieja con mayúsculas sigue andando', async () => {
		await importAll();
		const posts = await contenido('1');
		const found = await posts.siteEvent(t.platform, 'Encuentro-Pasado-BDSM-2025-05');
		expect(found.mode === 'db' && found.post?.path).toBe(
			'/calendario/Encuentro-Pasado-BDSM-2025-05'
		);
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
		const posts = await contenido('1');
		expect(ids(await posts.sitePosts(t.platform))).not.toContain('taller-inventado-2031-02');
		expect(await posts.siteEvent(t.platform, 'taller-inventado-2031-02')).toEqual({
			mode: 'db',
			post: null
		});
	});

	it('un cambio en la base se ve enseguida (lo recordado se renueva)', async () => {
		await importAll();
		const posts = await contenido('1');
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

	it('lo que no está en la base sale del .md', async () => {
		await importAll();
		const posts = await contenido('1');
		expect(await posts.siteEvent(t.platform, NOT_IMPORTED)).toEqual({ mode: 'md' });
	});

	it('con el interruptor apagado, todo sale de los .md aunque la base tenga eventos', async () => {
		await importAll();
		const posts = await contenido('0');
		expect(await posts.sitePosts(t.platform)).toEqual(md.listed);
		expect(await posts.siteEvent(t.platform, 'charla-oculta-2031-03', { viewer: ADMIN })).toEqual({
			mode: 'md'
		});
		expect((await posts.siteBodies(t.platform)).size).toBe(0);
	});
});
