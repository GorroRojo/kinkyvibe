import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isAdmin, requireAdmin } from '../auth.js';
import { PREVIEW_BUILD, isPreviewDeploy } from '../deploy.js';
import { PathExistsError } from '../eventos/github.js';
import { createTestDB, resetDB } from '../db/testing.js';
import { createDemoClient } from './client.js';
import { DEMO_COOKIE, DEMO_TOKEN, demoUser, isDemoUser } from './identity.js';
import { startDemoSession } from './login.js';
import { overlaySummary, overlayTexts } from './overlay.js';

describe('demo identity', () => {
	it('is only an admin on preview deploys', () => {
		expect(isAdmin(demoUser(), true)).toBe(true);
		expect(isAdmin(demoUser(), false)).toBe(false);
	});
	it('is refused in this (non-preview) build by default, like production', () => {
		expect(isPreviewDeploy()).toBe(false);
		expect(PREVIEW_BUILD).toBe(false);
		expect(isAdmin(demoUser())).toBe(false);
	});
	it('requireAdmin gives the demo session a 403 outside previews', () => {
		let e;
		try {
			requireAdmin(
				{ user: demoUser(), user_token: DEMO_TOKEN },
				new URL('https://kinkyvibe.ar/admin')
			);
		} catch (err) {
			e = /** @type {any} */ (err);
		}
		expect(e?.status).toBe(403);
	});
	it('only matches the exact demo identity, and never a real admin id', () => {
		expect(isDemoUser(demoUser())).toBe(true);
		expect(isDemoUser({ id: -1, login: 'GorroRojo' })).toBe(false);
		expect(isDemoUser({ id: 4594048, login: 'demo' })).toBe(false);
		// `preview` must be exactly true (a stray truthy argument doesn't count).
		expect(isAdmin(demoUser(), /** @type {any} */ (1))).toBe(false);
		// Real admins are unaffected by the flag.
		expect(isAdmin({ id: 4594048 }, false)).toBe(true);
	});
});

describe('startDemoSession', () => {
	function fakeCookies() {
		/** @type {Map<string, {value: string, opts: any}>} */
		const jar = new Map();
		return {
			jar,
			cookies: /** @type {any} */ ({
				set: (/** @type {string} */ name, /** @type {string} */ value, /** @type {any} */ opts) =>
					jar.set(name, { value, opts })
			})
		};
	}
	const url = new URL('https://demo.kinkyvibe.pages.dev/login/demo');

	it('refuses outside previews and sets no cookie', () => {
		const { jar, cookies } = fakeCookies();
		expect(startDemoSession({ preview: false, cookies, url, redirectTo: '/admin' })).toBeNull();
		expect(jar.size).toBe(0);
	});
	it('on previews sets an httpOnly cookie and redirects same-origin only', () => {
		const { jar, cookies } = fakeCookies();
		expect(startDemoSession({ preview: true, cookies, url, redirectTo: '/admin/entradas' })).toBe(
			'/admin/entradas'
		);
		expect(jar.get(DEMO_COOKIE)?.value).toBe('1');
		expect(jar.get(DEMO_COOKIE)?.opts.httpOnly).toBe(true);
		expect(
			startDemoSession({ preview: true, cookies, url, redirectTo: 'https://evil.example' })
		).toBe('/admin');
	});
});

describe('demo client (D1 layer over the deployed files)', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	/** @type {ReturnType<typeof createDemoClient>} */
	let client;
	const bundle = {
		texts: {
			'src/lib/posts/calendario/fiesta.md': async () => '---\ntitle: Fiesta\n---\nDeploy',
			'src/lib/posts/calendario/otra.md': async () => '---\ntitle: Otra\n---\n'
		},
		files: new Set([
			'src/lib/posts/calendario/fiesta.md',
			'src/lib/posts/calendario/otra.md',
			'src/lib/posts/calendario/media/fiesta/1.jpg',
			'src/lib/assets/compartida.png'
		])
	};

	beforeAll(async () => {
		t = await createTestDB();
		client = createDemoClient({ getDB: () => t.db, bundle });
	});
	afterAll(async () => {
		await t?.dispose();
	});
	beforeEach(async () => {
		await resetDB(t.db);
	});

	it('the table is not a migration: it is created on first use', async () => {
		const before = await t.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'demo_files'")
			.all();
		// First test of the file: the DB has only the numbered migrations applied.
		expect(before.results.length).toBe(0);
		expect(await client.getFile('', 'src/lib/posts/calendario/fiesta.md')).toContain('Deploy');
		const after = await t.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'demo_files'")
			.all();
		expect(after.results.length).toBe(1);
	});

	it('reads fall back to the deploy, and the layer wins after a commit', async () => {
		expect(await client.getFile('', 'src/lib/posts/calendario/nope.md')).toBeNull();
		await client.commitFiles(DEMO_TOKEN, {
			files: [
				{ path: 'src/lib/posts/calendario/fiesta.md', content: '---\ntitle: Fiesta (demo)\n---\n' },
				{ path: 'src/lib/posts/calendario/nueva.md', content: '---\ntitle: Nueva\n---\n' }
			],
			message: '[admin] Admin de prueba updated calendario/fiesta'
		});
		expect(await client.getFile('', 'src/lib/posts/calendario/fiesta.md')).toContain('(demo)');
		expect(await client.pathExists('', 'src/lib/posts/calendario/nueva.md')).toBe(true);
		const names = (await client.listDir('', 'src/lib/posts/calendario')).map((e) => e.name);
		expect(names).toEqual(['fiesta.md', 'media', 'nueva.md', 'otra.md']);
		const texts = await client.getDirTexts('', 'src/lib/posts/calendario');
		expect(texts.map((f) => f.path).sort()).toEqual([
			'src/lib/posts/calendario/fiesta.md',
			'src/lib/posts/calendario/nueva.md',
			'src/lib/posts/calendario/otra.md'
		]);
		const summary = await overlaySummary(t.db);
		expect(summary.files).toBe(2);
		expect(summary.recent[0].author).toBe('Admin de prueba');
	});

	it('mustNotExist sees both the deploy and the layer', async () => {
		await expect(
			client.commitFiles('', {
				files: [{ path: 'src/lib/posts/calendario/fiesta.md', content: 'x' }],
				message: 'm',
				mustNotExist: ['src/lib/posts/calendario/fiesta.md']
			})
		).rejects.toBeInstanceOf(PathExistsError);
		await client.commitFiles('', {
			files: [{ path: 'src/lib/posts/calendario/b.md', content: 'x' }],
			message: 'm'
		});
		await expect(
			client.commitFiles('', {
				files: [{ path: 'src/lib/posts/calendario/b.md', content: 'y' }],
				message: 'm',
				mustNotExist: ['src/lib/posts/calendario/b.md']
			})
		).rejects.toBeInstanceOf(PathExistsError);
	});

	it('deletes hide deployed files; images and blob copies are recorded', async () => {
		const assets = await client.listTree('', 'src/lib/assets');
		const sha = assets.find((e) => e.path === 'compartida.png')?.sha;
		expect(sha).toBeTruthy();
		await client.commitFiles('', {
			files: [
				{ path: 'src/lib/posts/calendario/otra.md', delete: true },
				{ path: 'src/lib/assets/compartida.webp', sha },
				{ path: 'src/lib/assets/compartida.png', delete: true },
				{ path: 'src/lib/posts/calendario/media/fiesta/2.webp', base64: 'AAAA' }
			],
			message: 'm'
		});
		expect(await client.getFile('', 'src/lib/posts/calendario/otra.md')).toBeNull();
		expect(
			await client.existingPaths('', [
				'src/lib/posts/calendario/otra.md',
				'src/lib/assets/compartida.webp',
				'src/lib/assets/compartida.png'
			])
		).toEqual(['src/lib/assets/compartida.webp']);
		const media = await client.listTree('', 'src/lib/posts/calendario/media', { recursive: true });
		expect(media.map((e) => `${e.type}:${e.path}`)).toEqual([
			'tree:fiesta',
			'blob:fiesta/1.jpg',
			'blob:fiesta/2.webp'
		]);
		const rows = await overlayTexts(t.db, 'src/lib/posts/calendario/');
		expect(rows).toContainEqual({ path: 'src/lib/posts/calendario/otra.md', text: null });
	});

	it('fails clearly without a database', async () => {
		const noDB = createDemoClient({ getDB: () => null, bundle });
		await expect(noDB.getFile('', 'src/lib/posts/calendario/fiesta.md')).rejects.toThrow(
			/base de prueba/
		);
	});
});
