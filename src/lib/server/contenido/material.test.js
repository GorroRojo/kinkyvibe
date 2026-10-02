/**
 * Material en la base: el mapa .md ↔ objeto con TODO el material real del repo (público), y la
 * paridad de lo que reciben las páginas con material inventado (fixtures/material) en un D1 de
 * miniflare, más guardarlo desde el panel.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { coreTypes, validateData } from '../objects/types/index.js';
import { splitMarkdown } from '../amigues/importer.js';
import { stripMarkdown } from '$lib/utils/search.js';
import { materialToMeta, mdToMaterial } from './material.js';
import { postToMarkdown, markdownToPost } from './markdown.js';
import { metaDiff, normalizeMeta } from './parity.js';
import { runImport, summarizeImport } from './importer.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const def = /** @type {import('../objects/types/index.js').CoreType} */ (coreTypes.get('material'));
const TEXT_KEYS = Object.entries(def.fields)
	.filter(([, f]) => f.kind === 'text')
	.map(([k]) => k);
/** @param {Record<string, unknown>} meta */
const norm = (meta) => normalizeMeta(meta, { textKeys: TEXT_KEYS });

/** Lo que devuelve `fetchMarkdownPosts` en las pruebas con base (el lado .md). */
const md = vi.hoisted(() => ({ listed: /** @type {any[]} */ ([]) }));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki || unlisted ? [] : structuredClone(md.listed)
}));

const realMetas = /** @type {Record<string, Record<string, any> | undefined>} */ (
	import.meta.glob('/src/lib/posts/material/*.md', { import: 'metadata', eager: true })
);
const realRaws = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/material/*.md', {
		query: '?raw',
		import: 'default',
		eager: true
	})
);
const fixtureMetas = /** @type {Record<string, Record<string, any> | undefined>} */ (
	import.meta.glob('./fixtures/material/*.md', { import: 'metadata', eager: true })
);
const fixtureRaws = /** @type {Record<string, string>} */ (
	import.meta.glob('./fixtures/material/*.md', { query: '?raw', import: 'default', eager: true })
);
/** @param {string} path */
const slugOf = (path) => path.split('/').pop()?.replace(/\.md$/, '') ?? '';
const fixtures = Object.keys(fixtureRaws)
	.sort()
	.map((p) => ({ legacySlug: slugOf(p), raw: fixtureRaws[p], meta: fixtureMetas[p] ?? null }));

describe('el material real del repo', () => {
	const entries = Object.entries(realMetas).filter(([p]) => !slugOf(p).startsWith('_'));

	it('cada uno se importa (salvo los que usan componentes) y vuelve a dar lo mismo', () => {
		/** @type {string[]} */
		const problems = [];
		/** @type {string[]} */
		const components = [];
		for (const [path, meta] of entries) {
			if (!meta) continue;
			const slug = slugOf(path);
			const { body } = splitMarkdown(realRaws[path]);
			const m = mdToMaterial(slug, meta, body);
			if (m.error) {
				components.push(slug);
				continue;
			}
			const v = validateData(def, m.data);
			if (!v.ok) {
				problems.push(`${slug}: ${v.errors.map((e) => e.message).join('; ')}`);
				continue;
			}
			const object = { title: m.title, data: v.data, visibility: m.visibility };
			const diff = metaDiff(norm(materialToMeta(object)), norm(meta));
			if (diff.length) problems.push(`${slug}: difiere ${diff.join(', ')}`);
			// El texto .md que arma la base para el editor vuelve a dar los mismos datos.
			const again = markdownToPost('material', slug, postToMarkdown('material', object));
			const v2 = validateData(def, again.data);
			if (!v2.ok || JSON.stringify(v2.data) !== JSON.stringify(v.data))
				problems.push(`${slug}: el texto del editor no vuelve igual`);
			if (stripMarkdown(String(v.data.body ?? '')).trim() !== stripMarkdown(realRaws[path]).trim())
				problems.push(`${slug}: texto para buscar`);
		}
		expect(problems).toEqual([]);
		// Los dos que usan componentes interactivos siguen saliendo de su .md.
		expect(components.sort()).toEqual(['donde-y-como-golpear-un-cuerpo', 'juego-de-peleas']);
	});
});

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {typeof import('$lib/utils')} */
let utils;
beforeAll(async () => {
	t = await createTestDB();
	utils = await import('$lib/utils');
	/** @type {any[]} */
	const all = [];
	for (const f of fixtures) {
		if (!f.meta) continue;
		all.push(await utils.processPost(undefined, f.legacySlug, /** @type {any} */ (f.meta), true));
	}
	/** @param {any} x */
	const time = (x) =>
		new Date(x.meta?.start ?? x.meta?.updated_date ?? x.meta?.published_date).getTime();
	md.listed = all.sort((a, b) => time(b) - time(a));
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

async function setup(flag = '1') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { CONTENIDO_DB_ENABLED: flag } }));
	const posts = await import('./posts.js');
	posts.clearContentCache();
	const repo = await import('./repo.js');
	repo.setContentDB(t.db);
	return { posts, repo };
}

describe('paridad del material', () => {
	it('se importa (el del componente no) y las páginas reciben lo mismo', async () => {
		const r = await runImport(t.db, 'material', fixtures, { actor: 'importacion' });
		expect(summarizeImport(r.plan)).toMatchObject({ created: 1, error: 1 });
		const { posts } = await setup('1');
		const list = await posts.sitePosts(t.platform);
		expect(list.map((p) => p.meta.postID)).toEqual(md.listed.map((p) => p.meta.postID));
		for (const [i, p] of list.entries()) {
			expect(metaDiff(norm(p.meta), norm(md.listed[i].meta)), p.meta.postID).toEqual([]);
		}
		const page = await posts.siteContent(t.platform, 'material', 'guia-inventada-de-nudos');
		expect(page.mode).toBe('db');
		const html = page.mode === 'db' ? (page.post?.html ?? '') : '';
		expect(html).toContain('<strong>inventada</strong>');
		expect(html).toContain('href="/wiki/bondage"');
		// El del componente sale de su .md.
		expect(await posts.siteContent(t.platform, 'material', 'mapa-interactivo-inventado')).toEqual({
			mode: 'md'
		});
	});

	it('editar material desde el panel guarda en la base', async () => {
		await runImport(t.db, 'material', fixtures, { actor: 'importacion' });
		const { repo } = await setup('1');
		/** @type {any[]} */
		const commits = [];
		/** @type {Record<string, any>} */
		const fakeRepo = {
			getFile: async () => null,
			pathExists: async () => false,
			existingPaths: async () => [],
			commitFiles: async (/** @type {string} */ _t, /** @type {any} */ o) => {
				commits.push(o);
				return { sha: 'x', url: 'x' };
			}
		};
		const client = repo.withContentDb(fakeRepo);
		const p = 'src/lib/posts/material/guia-inventada-de-nudos.md';
		const raw = String(await client.getFile('t', p));
		const res = await client.commitFiles('t', {
			files: [{ path: p, content: raw.replace('Guía Inventada de Nudos', 'Guía Renombrada') }],
			message: 'edita',
			actor: 'admin-inventade'
		});
		expect(commits).toEqual([]);
		expect(res).toMatchObject({ url: '/material/guia-inventada-de-nudos' });
		const row = await t.db
			.prepare("SELECT title, version FROM objects WHERE type = 'material'")
			.first();
		expect(row).toEqual({ title: 'Guía Renombrada', version: 2 });
	});
});
