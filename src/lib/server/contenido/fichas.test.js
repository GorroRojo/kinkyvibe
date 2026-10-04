/**
 * «Solo base», paso 2: las fichas de amigues y las páginas de la wiki viven en la base.
 *
 * - Con TODAS las fichas y páginas REALES del repo (públicas a propósito), importadas a un D1 de
 *   miniflare con las importaciones de verdad: ninguna queda afuera (estricto) y «Descargar todo»
 *   da los mismos .md (misma metadata y mismo texto).
 * - El cliente del repo (`withContentDb`) lee y guarda los .md de amigues y la wiki en la base,
 *   nunca en el repo: guardar, renombrar una etiqueta en todas las publicaciones, el aviso si
 *   alguien guardó en el medio, lo que no se puede (un perfil que la base no tiene, cambiar el
 *   `wiki:` de una página). Datos inventados para lo que se escribe.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { FileChangedError } from '$lib/server/eventos/github.js';
import {
	importAmigues,
	isImportable,
	mdToProfile,
	normalizeBody,
	splitMarkdown,
	summarizeImport
} from '../amigues/importer.js';
import { readAmigueFiles } from '../amigues/files.js';
import { makeProfile } from '../amigues/testing.js';
import { importTags, summarizeTagImport } from '../etiquetas/importer.js';
import { commitTagEdit } from '../admin/tagEditor.js';
import { planTagRenameInPosts } from '../etiquetas/rename.js';
import { contentArchiveFiles } from './download.js';
import { listRevisions } from './revisions.js';
import hardcodedTags from '$lib/utils/hardcodedTags.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const wikiRaws = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/wiki/*.md', { query: '?raw', import: 'default', eager: true })
);
const wikiFiles = Object.entries(wikiRaws)
	.map(([p, raw]) => ({ name: p.split('/').pop()?.replace(/\.md$/, '') ?? '', raw }))
	.filter((f) => !f.name.startsWith('_'))
	.sort((a, b) => a.name.localeCompare(b.name));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {{ legacySlug: string, raw: string }[]} */
let amigueFiles;
beforeAll(async () => {
	t = await createTestDB();
	amigueFiles = (await readAmigueFiles()).filter((f) => isImportable(f.legacySlug));
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

/** Todo lo del repo, importado como en una base nueva (Perfiles y Etiquetas → Importar). */
async function importEverything() {
	const amigues = await importAmigues(t.db, amigueFiles, { actor: 'prueba' });
	const tags = await importTags(
		t.db,
		{ rawTags: JSON.parse(JSON.stringify(hardcodedTags)), wikiFiles },
		{ actor: 'prueba' }
	);
	return { amigues, tags };
}

/**
 * El frontmatter de un .md como texto (YAML «failsafe»: todo valor es texto, como lo lee la
 * importación), sin las líneas comentadas.
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
function frontmatterOf(raw) {
	const { frontmatter } = splitMarkdown(raw);
	return frontmatter.trim() ? YAML.parse(frontmatter, { schema: 'failsafe' }) : {};
}

describe('importar todo lo del repo (estricto)', () => {
	it('cada ficha de amigues del repo se importa, sin errores', async () => {
		const { amigues } = await importEverything();
		expect(amigueFiles.length).toBeGreaterThan(20);
		expect(amigues.filter((r) => r.action === 'error')).toEqual([]);
		expect(summarizeImport(amigues).created).toBe(amigueFiles.length);
		expect(amigues.map((r) => r.legacySlug).sort()).toEqual(
			amigueFiles.map((f) => f.legacySlug).sort()
		);
	});

	it('cada página de la wiki del repo queda en su etiqueta, con la misma dirección', async () => {
		const { tags } = await importEverything();
		expect(summarizeTagImport(tags.results).error).toBe(0);
		const { listFichas } = await import('./fichas.js');
		const pages = await listFichas(t.db, 'wiki');
		expect(wikiFiles.length).toBeGreaterThanOrEqual(12);
		// /wiki/<nombre del .md> sigue llevando a su página.
		expect(pages.map((p) => p.slug).sort()).toEqual(wikiFiles.map((f) => f.name).sort());
	});
});

describe('«Descargar todo» con amigues y la wiki', () => {
	it('las fichas de amigues salen con la misma metadata y el mismo texto que en el repo', async () => {
		await importEverything();
		const byName = new Map((await contentArchiveFiles(t.db)).map((f) => [f.name, f.content]));
		for (const f of amigueFiles) {
			const ctx = `amigues/${f.legacySlug}.md`;
			const exported = byName.get(ctx);
			expect(exported, ctx).toBeDefined();
			const before = frontmatterOf(f.raw);
			const after = frontmatterOf(/** @type {string} */ (exported));
			// Cada propiedad escrita en la ficha del repo, igual (los textos tal cual).
			for (const [key, value] of Object.entries(before)) {
				const v = Array.isArray(value)
					? value.map((x) => String(x).trim()).filter(Boolean)
					: String(value).trim();
				// Una propiedad vacía (`pronoun: ''`) es lo mismo que no tenerla.
				if (v === '' || (Array.isArray(v) && !v.length)) {
					expect(after[key] ?? '', `${ctx}: ${key}`).toEqual('');
					continue;
				}
				expect(after[key], `${ctx}: ${key}`).toEqual(v);
			}
			// Lo único de más: el tipo (persona, proyecto o lugar), que la ficha del repo no tiene.
			expect(
				Object.keys(after).filter((k) => !(k in before) && k !== 'summary'),
				ctx
			).toEqual(['kind']);
			expect(normalizeBody(splitMarkdown(/** @type {string} */ (exported)).body), ctx).toBe(
				normalizeBody(splitMarkdown(f.raw).body)
			);
			// E importarlo de nuevo da el mismo perfil.
			const again = mdToProfile(f.legacySlug, /** @type {string} */ (exported));
			const original = mdToProfile(f.legacySlug, f.raw);
			expect(again.data, ctx).toEqual(original.data);
			expect(again.title, ctx).toBe(original.title);
			expect(again.visibility, ctx).toBe(original.visibility);
		}
	});

	it('las páginas de la wiki salen con la misma metadata y el mismo texto que en el repo', async () => {
		await importEverything();
		const byName = new Map((await contentArchiveFiles(t.db)).map((f) => [f.name, f.content]));
		for (const f of wikiFiles) {
			const ctx = `wiki/${f.name}.md`;
			const exported = byName.get(ctx);
			expect(exported, ctx).toBeDefined();
			const before = frontmatterOf(f.raw);
			const after = frontmatterOf(/** @type {string} */ (exported));
			expect(Object.keys(after).sort(), ctx).toEqual(Object.keys(before).sort());
			for (const [key, value] of Object.entries(before)) {
				const v = Array.isArray(value) ? value.map((x) => String(x).trim()) : String(value).trim();
				expect(after[key], `${ctx}: ${key}`).toEqual(v);
			}
			expect(normalizeBody(splitMarkdown(/** @type {string} */ (exported)).body), ctx).toBe(
				normalizeBody(splitMarkdown(f.raw).body)
			);
		}
	});
});

/** Un repo de mentira que anota todo lo que se le pide. */
function fakeRepo() {
	/** @type {string[]} */
	const calls = [];
	/** @param {string} name */
	const spy = (name) => async (/** @type {string} */ _t, /** @type {any} */ arg) => {
		calls.push(`${name} ${typeof arg === 'string' ? arg : JSON.stringify(arg)}`);
		if (name === 'commitFiles') return { sha: 'abc', url: 'https://ejemplo.test/commit/abc' };
		if (name === 'getFile' || name === 'readFile') return 'texto del repo';
		if (name === 'pathExists') return false;
		return [];
	};
	return {
		calls,
		getFile: spy('getFile'),
		readFile: spy('readFile'),
		pathExists: spy('pathExists'),
		existingPaths: spy('existingPaths'),
		listTree: spy('listTree'),
		getDirTexts: spy('getDirTexts'),
		commitFiles: spy('commitFiles')
	};
}

/** El cliente del repo con la base registrada (como hooks.server.js). */
async function setup() {
	vi.resetModules();
	const repo = await import('./repo.js');
	repo.setContentDB(t.db);
	const base = fakeRepo();
	// (`any`: el repo de mentira devuelve cualquier cosa; acá importa lo que hace la base.)
	return { repo, base, client: /** @type {any} */ (repo.withContentDb(base)) };
}

const AMIGUES = 'src/lib/posts/amigues';
const WIKI = 'src/lib/posts/wiki';

/** Un perfil y una etiqueta con página de la wiki, inventados. */
async function seedFichas() {
	await importTags(
		t.db,
		{
			rawTags: [
				{ id: 'root', children: ['Etiqueta Vieja', 'otra de prueba'] },
				{ id: 'Etiqueta Vieja' },
				{ id: 'otra de prueba' }
			],
			wikiFiles: [
				{
					name: 'otra-de-prueba',
					raw: '---\ntitle: Otra de prueba\nwiki: otra de prueba\nsummary: Un resumen inventado.\ntags:\n  - Etiqueta Vieja\nlayout: wiki\ncategory: wiki\n---\n\nTexto inventado con [[Etiqueta Vieja]].\n'
				}
			]
		},
		{ actor: 'prueba' }
	);
	const profile = await makeProfile(t.db, {
		title: 'Persona de Prueba',
		slug: 'persona-de-prueba',
		data: { bio: 'Hola.', tags: ['Etiqueta Vieja', 'otra de prueba'], body: 'Texto de prueba.' }
	});
	return { profile };
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

describe('el cliente del repo: amigues y la wiki, solo en la base', () => {
	it('lee el .md de un perfil y de una página de la wiki de la base (nunca del repo)', async () => {
		await seedFichas();
		const { client, base } = await setup();
		const raw = await client.getFile('t', `${AMIGUES}/persona-de-prueba.md`);
		expect(raw).toMatch(/^title: Persona de Prueba$/m);
		expect(raw).toContain('Texto de prueba.');
		const page = await client.readFile('t', `${WIKI}/otra-de-prueba.md`);
		expect(page?.raw).toMatch(/^wiki: otra de prueba$/m);
		expect(page?.sha).toMatch(/^[0-9a-f]{40}$/);
		// Un perfil que la base no tiene no existe, aunque su .md esté en el repo.
		expect(await client.getFile('t', `${AMIGUES}/Gorro_Rojo.md`)).toBeNull();
		// Una etiqueta sin página de la wiki tampoco.
		expect(await client.getFile('t', `${WIKI}/Etiqueta-Vieja.md`)).toBeNull();
		const dir = await client.getDirTexts('t', AMIGUES);
		expect(dir.map((/** @type {any} */ f) => f.path)).toEqual([`${AMIGUES}/persona-de-prueba.md`]);
		expect(
			base.calls.filter((c) => !c.startsWith('getDirTexts') && !c.startsWith('listTree'))
		).toEqual([]);
	});

	it('guardar el .md de un perfil o de una página de la wiki va a la base, con historial', async () => {
		const { profile } = await seedFichas();
		const { client, base } = await setup();
		const file = await client.readFile('t', `${AMIGUES}/persona-de-prueba.md`);
		const page = await client.readFile('t', `${WIKI}/otra-de-prueba.md`);
		await client.commitFiles('t', {
			files: [
				{
					path: `${AMIGUES}/persona-de-prueba.md`,
					content: file.raw.replace('Texto de prueba.', 'Texto cambiado.')
				},
				{
					path: `${WIKI}/otra-de-prueba.md`,
					content: page.raw.replace('Texto inventado', 'Texto nuevo')
				}
			],
			message: 'prueba',
			actor: 'admin-de-prueba',
			superadmin: true,
			unchanged: [
				{ path: `${AMIGUES}/persona-de-prueba.md`, sha: file.sha },
				{ path: `${WIKI}/otra-de-prueba.md`, sha: page.sha }
			]
		});
		expect(base.calls.filter((c) => c.startsWith('commitFiles'))).toEqual([]);
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT data, version FROM objects WHERE id = ?1').bind(profile.id).first()
		);
		expect(JSON.parse(row.data).body).toBe('Texto cambiado.');
		expect(JSON.parse(row.data).tags).toEqual(['Etiqueta Vieja', 'otra de prueba']);
		expect((await listRevisions(t.db, profile.id))[0]).toMatchObject({ source: 'panel' });
		const tag = /** @type {any} */ (
			await t.db
				.prepare(
					"SELECT data FROM objects WHERE type = 'etiqueta' AND json_extract(data, '$.key') = 'otra de prueba'"
				)
				.first()
		);
		const data = JSON.parse(tag.data);
		expect(data.body).toBe('Texto nuevo con [[Etiqueta Vieja]].');
		expect(data.wiki_summary).toBe('Un resumen inventado.');
		// Lo guardó une admin del panel (superadmin): HTML libre, como los eventos.
		expect(data.wiki_body_html).toBe('libre');
	});

	it('si alguien guardó en el medio, avisa y no guarda nada', async () => {
		await seedFichas();
		const { client } = await setup();
		const file = await client.readFile('t', `${AMIGUES}/persona-de-prueba.md`);
		await client.commitFiles('t', {
			files: [
				{ path: `${AMIGUES}/persona-de-prueba.md`, content: file.raw.replace('Hola.', 'Uno.') }
			],
			message: 'primero',
			actor: 'admin-de-prueba',
			unchanged: [{ path: `${AMIGUES}/persona-de-prueba.md`, sha: file.sha }]
		});
		const e = await thrown(() =>
			client.commitFiles('t', {
				files: [
					{ path: `${AMIGUES}/persona-de-prueba.md`, content: file.raw.replace('Hola.', 'Dos.') }
				],
				message: 'segundo',
				actor: 'admin-de-prueba',
				unchanged: [{ path: `${AMIGUES}/persona-de-prueba.md`, sha: file.sha }]
			})
		);
		// (Otra copia del módulo: vi.resetModules en setup.)
		expect(e?.constructor?.name).toBe(FileChangedError.name);
		expect(await client.getFile('t', `${AMIGUES}/persona-de-prueba.md`)).toMatch(
			/^summary: Uno\.$/m
		);
	});

	it('no crea un perfil con un .md ni cambia la etiqueta de una página de la wiki', async () => {
		await seedFichas();
		const { client, base } = await setup();
		const nuevo = await thrown(() =>
			client.commitFiles('t', {
				files: [{ path: `${AMIGUES}/Alguien_Nuevo.md`, content: '---\ntitle: Alguien\n---\n' }],
				message: 'nuevo',
				actor: 'admin-de-prueba'
			})
		);
		expect(String(nuevo?.message)).toMatch(/no está en la base/);
		const page = await client.readFile('t', `${WIKI}/otra-de-prueba.md`);
		const otra = await thrown(() =>
			client.commitFiles('t', {
				files: [
					{
						path: `${WIKI}/otra-de-prueba.md`,
						content: page.raw.replace('wiki: otra de prueba', 'wiki: Etiqueta Vieja')
					}
				],
				message: 'otra',
				actor: 'admin-de-prueba'
			})
		);
		expect(String(otra?.message)).toMatch(/renombrala en Etiquetas/);
		expect(base.calls.filter((c) => c.startsWith('commitFiles'))).toEqual([]);
		const n = await t.db.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'perfil'").first();
		expect(n?.n).toBe(1);
	});

	it('Etiquetas → Renombrar en todas las publicaciones cambia perfiles y la wiki en la base, sin GitHub', async () => {
		const { profile } = await seedFichas();
		const { repo, client, base } = await setup();
		const dbOnly = repo.dbPostsOnlyClient(client);
		const ops = [
			/** @type {const} */ ({
				type: 'rename',
				from: 'Etiqueta Vieja',
				to: 'Etiqueta Nueva',
				keepAlias: false
			})
		];
		const plan = await planTagRenameInPosts(dbOnly, 'token', /** @type {any} */ (ops));
		expect(plan.files.map((f) => f.path).sort()).toEqual([
			`${AMIGUES}/persona-de-prueba.md`,
			`${WIKI}/otra-de-prueba.md`
		]);
		await commitTagEdit(dbOnly, 'token', /** @type {any} */ (plan), 'Admin de Prueba');
		// Nada fue al repo: ni leer ni escribir.
		expect(base.calls).toEqual([]);
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(profile.id).first()
		);
		expect(JSON.parse(row.data).tags).toEqual(['Etiqueta Nueva', 'otra de prueba']);
		const tag = /** @type {any} */ (
			await t.db
				.prepare(
					"SELECT data FROM objects WHERE type = 'etiqueta' AND json_extract(data, '$.key') = 'otra de prueba'"
				)
				.first()
		);
		expect(JSON.parse(tag.data).wiki_tags).toEqual(['Etiqueta Nueva']);
		// El texto no cambió: sigue como estaba (lo importado, HTML libre sin marca).
		expect(JSON.parse(tag.data).wiki_body_html).toBeUndefined();
	});
});
