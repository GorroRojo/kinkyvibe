/**
 * Guardar desde el panel en la base (el interruptor `etiquetas_db` quedó fijo): escribe, queda en Actividad y
 * olvida lo recordado; una operación imposible no escribe nada. Renombrar sin alias (lo de
 * siempre): primero un commit que cambia las publicaciones, después la base.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { importTags } from './importer.js';
import { loadTagRecords } from './read.js';
import { NEEDS_REPO, previewDbTagEdit, saveDbTagEdit, saveTagOpsToDb } from './panel.js';
import { clearTagSourceCache, tagSourceFrom } from './source.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const LOGIN = 'admin-de-prueba';
const locals = /** @type {any} */ ({ user: { login: LOGIN } });
const RAW = [
	{ id: 'root', children: ['evento recurrente'] },
	{ id: 'evento recurrente', children: ['Serie Inventada'] },
	{ id: 'Serie Inventada' }
];

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
	clearTagSourceCache();
	await importTags(t.db, { rawTags: structuredClone(RAW) }, { actor: LOGIN });
});

const from = async () => ({
	db: t.db,
	records: await loadTagRecords(t.db, { role: 'admin', id: LOGIN })
});

describe('saveTagOpsToDb', () => {
	it('guarda, lo anota en Actividad y el sitio lo ve sin esperar', async () => {
		const before = await tagSourceFrom(t.db, { now: 1 });
		const res = await saveTagOpsToDb(
			await from(),
			[{ type: 'update', id: 'Serie Inventada', set: { icon: '🎭' } }],
			{ locals, login: LOGIN, label: 'Series', targetId: 'Serie Inventada' }
		);
		expect(res).toMatchObject({ ok: true, written: 1 });
		const after = await tagSourceFrom(t.db, { now: 2 });
		expect(after).not.toBe(before);
		expect(after.rawTags.find((e) => e.id === 'Serie Inventada')?.icon).toBe('🎭');
		const audit = await listAudit(t.db, { targetType: 'tags' });
		expect(audit[0]).toMatchObject({ action: 'tags.edit', targetId: 'Serie Inventada' });
		expect(audit[0].summary).toMatch(/^Series \(base\): /);
	});

	it('una operación imposible: error para la persona, nada escrito', async () => {
		const res = await saveTagOpsToDb(
			await from(),
			[{ type: 'create', id: 'Serie Inventada', parent: 'evento recurrente' }],
			{ locals, login: LOGIN }
		);
		expect(res).toMatchObject({ ok: false, status: 400 });
		expect(await listAudit(t.db, { targetType: 'tags' })).toEqual([]);
	});
});

/** Un repo de mentira con un post que usa «Serie Inventada» y otro que no. */
function fakeRepo({ failCommit = false } = {}) {
	/** @type {any[]} */
	const commits = [];
	const post = (/** @type {string} */ tag) =>
		['---', 'title: Post de prueba', 'tags:', `  - ${tag}`, '---', ''].join('\n');
	const client = /** @type {any} */ ({
		getFile: async () => null,
		getDirTexts: async (/** @type {string} */ _t, /** @type {string} */ dir) =>
			dir.endsWith('calendario')
				? [
						{ path: `${dir}/uno.md`, text: post('Serie Inventada'), sha: 'a' },
						{ path: `${dir}/dos.md`, text: post('otra'), sha: 'b' }
					]
				: [],
		commitFiles: async (/** @type {string} */ _t, /** @type {any} */ c) => {
			if (failCommit) throw new Error('GitHub no anda');
			commits.push(c);
			return { url: 'https://example.com/commit/prueba' };
		}
	});
	return { repo: { client, token: 'token-de-prueba', who: 'Admin de Prueba' }, commits };
}

describe('renombrar con la base: la elección', () => {
	const RENAME = /** @type {const} */ ({
		type: 'rename',
		from: 'Serie Inventada',
		to: 'Serie Renombrada'
	});

	it('vista previa: cuántas publicaciones cambian (sin alias) o ninguna (con alias)', async () => {
		const { repo } = fakeRepo();
		const sin = await previewDbTagEdit(await from(), [{ ...RENAME, keepAlias: false }], repo);
		expect(sin).toMatchObject({ ok: true, preview: { posts: { total: 1 } } });
		const con = await previewDbTagEdit(await from(), [{ ...RENAME, keepAlias: true }], repo);
		expect(con).toMatchObject({ ok: true, preview: { posts: null } });
		// Sin poder hacer commits, renombrar sin alias no se puede (con alias sí).
		expect(await previewDbTagEdit(await from(), [{ ...RENAME, keepAlias: false }], null)).toEqual({
			ok: false,
			status: 403,
			error: NEEDS_REPO
		});
	});

	it('sin alias (por defecto): un commit con las publicaciones y en la base sin el nombre viejo', async () => {
		const { repo, commits } = fakeRepo();
		const res = await saveDbTagEdit(await from(), [{ ...RENAME, keepAlias: false }], {
			locals,
			login: LOGIN,
			repo
		});
		expect(res).toMatchObject({ ok: true, posts: 1, commit: 'https://example.com/commit/prueba' });
		expect(commits).toHaveLength(1);
		expect(commits[0].files.map((/** @type {any} */ f) => f.path)).toEqual([
			'src/lib/posts/calendario/uno.md'
		]);
		expect(commits[0].files[0].content).toContain('  - Serie Renombrada');
		const keys = (await loadTagRecords(t.db)).map((r) => r.key);
		expect(keys).toContain('Serie Renombrada');
		expect(keys).not.toContain('Serie Inventada');
	});

	it('con alias: sin commit, y el nombre viejo queda como alias', async () => {
		const { repo, commits } = fakeRepo();
		const res = await saveDbTagEdit(await from(), [{ ...RENAME, keepAlias: true }], {
			locals,
			login: LOGIN,
			repo
		});
		expect(res).toMatchObject({ ok: true, posts: 0, commit: null });
		expect(commits).toHaveLength(0);
		const old = (await loadTagRecords(t.db)).find((r) => r.key === 'Serie Inventada');
		expect(old?.aliasOf).toBe('Serie Renombrada');
	});

	it('si el commit falla, la base no se toca', async () => {
		const { repo } = fakeRepo({ failCommit: true });
		const res = await saveDbTagEdit(await from(), [{ ...RENAME, keepAlias: false }], {
			locals,
			login: LOGIN,
			repo
		});
		expect(res).toMatchObject({ ok: false, status: 502 });
		const keys = (await loadTagRecords(t.db)).map((r) => r.key);
		expect(keys).toContain('Serie Inventada');
		expect(keys).not.toContain('Serie Renombrada');
	});
});
