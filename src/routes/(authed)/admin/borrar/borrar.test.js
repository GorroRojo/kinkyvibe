/**
 * Panel → Borrar (/admin/borrar/[kind]/[slug]) y «Recuperar» en Actividad: solo admins (sin
 * sesión, redirect 303 al login; sin permiso, 403), los eventos con entradas vendidas no se borran, con dependencias hay que escribir la dirección,
 * y deshacer / recuperar restauran. D1 de miniflare, repo falso; datos inventados.
 * (El interruptor `borrar_desde_panel` quedó prendido para siempre: se fueron los casos «apagado».)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache } from '$lib/server/flags.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { insertOrder } from '$lib/server/admin/testRows.js';

const SLUG = 'fiesta-de-prueba';
const RAW = '---\ntitle: Fiesta de Prueba\n---\n\nTexto inventado.\n';

/** El repo falso: un evento y un material; anota los commits. */
const repo = vi.hoisted(() => ({
	/** @type {Set<string>} */
	files: new Set(),
	/** @type {any[]} */
	commits: []
}));

vi.mock('$lib/server/eventos', async (importOriginal) => {
	/** @type {any} */
	const real = await importOriginal();
	const client = {
		getFile: async (/** @type {string} */ _t, /** @type {string} */ path) =>
			repo.files.has(path) ? RAW : null,
		listTree: async () => [],
		commitFiles: async (/** @type {string} */ _t, /** @type {any} */ opts) => {
			repo.commits.push(opts);
			for (const f of opts.files) {
				if (f.delete) repo.files.delete(f.path);
				else repo.files.add(f.path);
			}
			return { sha: 'c1', url: 'https://example.com/commit/c1' };
		}
	};
	return { ...real, getRepoClient: async () => client, usesLocalRepo: () => true };
});

const borrar = await import('./[kind]/[slug]/+page.server.js');
const actividad = await import('../ajustes/actividad/+page.server.js');

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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
	clearFlagCache();
	repo.files = new Set([
		`src/lib/posts/calendario/${SLUG}.md`,
		'src/lib/posts/material/guia-de-prueba.md'
	]);
	repo.commits = [];
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * @param {{ kind?: string, slug?: string, form?: Record<string, string>, user?: any, path?: string }} [o]
 */
function fakeEvent({ kind = 'calendario', slug = SLUG, form, user, path } = {}) {
	const url = new URL(path ?? `/admin/borrar/${kind}/${slug}`, 'https://kinkyvibe.ar');
	/** @type {any} */
	const event = {
		url,
		params: { kind, slug },
		platform: t.platform,
		locals: { user: user === undefined ? admin : user, user_token: user === null ? null : 'tok' },
		setHeaders: () => {},
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		})
	};
	return event;
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

describe('permissions', () => {
	it('sends anonymous visitors to the login (303) and refuses non-admins (403)', async () => {
		const anon = await thrown(() => borrar.load(fakeEvent({ user: null })));
		expect(anon.status).toBe(303);
		const intruder = { id: 1, login: 'no-admin' };
		expect((await thrown(() => borrar.load(fakeEvent({ user: intruder })))).status).toBe(403);
		const anonPost = await thrown(() => borrar.actions.borrar(fakeEvent({ user: null, form: {} })));
		expect(anonPost.status).toBe(303);
		const intruderPost = await thrown(() =>
			borrar.actions.borrar(fakeEvent({ user: intruder, form: {} }))
		);
		expect(intruderPost.status).toBe(403);
		const intruderUndo = await thrown(() =>
			actividad.actions.recuperar(fakeEvent({ user: intruder, form: { id: '1' } }))
		);
		expect(intruderUndo.status).toBe(403);
		expect(repo.commits).toEqual([]);
	});
});

describe('deleting', () => {
	it('blocks an event with sold tickets, in the page and in the action', async () => {
		await insertOrder(t.db, { slug: SLUG, quantity: 2 });
		const page = /** @type {any} */ (await borrar.load(fakeEvent()));
		expect(page.plan.blockers[0]).toContain('2 entradas vendidas');
		const r = /** @type {any} */ (await borrar.actions.borrar(fakeEvent({ form: {} })));
		expect(r.status).toBe(409);
		expect(r.data.blocked).toBe(true);
		expect(repo.commits).toEqual([]);
	});
	it('asks to type the address when something depends on it', async () => {
		await insertOrder(t.db, { slug: SLUG, status: 'refunded' });
		const page = /** @type {any} */ (await borrar.load(fakeEvent()));
		expect(page.plan.needsTyping).toBe(true);
		const wrong = /** @type {any} */ (
			await borrar.actions.borrar(fakeEvent({ form: { confirmar: 'otra-cosa' } }))
		);
		expect(wrong.status).toBe(400);
		expect(repo.commits).toEqual([]);
		const ok = /** @type {any} */ (
			await borrar.actions.borrar(fakeEvent({ form: { confirmar: SLUG } }))
		);
		expect(ok.deleted).toMatchObject({ title: 'Fiesta de Prueba', publish: null });
		expect(repo.files.has(`src/lib/posts/calendario/${SLUG}.md`)).toBe(false);
	});
	it('deletes a material post without dependencies, then undoes it from the page', async () => {
		const ev = { kind: 'material', slug: 'guia-de-prueba' };
		const page = /** @type {any} */ (await borrar.load(fakeEvent(ev)));
		expect(page.plan).toMatchObject({ blockers: [], needsTyping: false });
		const r = /** @type {any} */ (await borrar.actions.borrar(fakeEvent({ ...ev, form: {} })));
		expect(repo.files.has('src/lib/posts/material/guia-de-prueba.md')).toBe(false);
		expect((await listAudit(t.db))[0].action).toBe('material.delete');

		const undo = /** @type {any} */ (
			await borrar.actions.deshacer(fakeEvent({ ...ev, form: { id: String(r.deleted.id) } }))
		);
		expect(undo.undone).toMatchObject({ mode: 'restored', slug: 'guia-de-prueba' });
		expect(repo.files.has('src/lib/posts/material/guia-de-prueba.md')).toBe(true);
		expect((await listAudit(t.db))[0].action).toBe('material.restore');
	});
	it('lists recoverable deletions in Actividad and recovers one', async () => {
		const r = /** @type {any} */ (await borrar.actions.borrar(fakeEvent({ form: {} })));
		const page = /** @type {any} */ (
			await actividad.load(fakeEvent({ path: '/admin/ajustes/actividad' }))
		);
		expect(page.deletions).toMatchObject([{ id: r.deleted.id, slug: SLUG }]);

		const back = /** @type {any} */ (
			await actividad.actions.recuperar(
				fakeEvent({ path: '/admin/ajustes/actividad', form: { id: String(r.deleted.id) } })
			)
		);
		expect(back.undone.mode).toBe('restored');
		expect(repo.files.has(`src/lib/posts/calendario/${SLUG}.md`)).toBe(true);
		const again = /** @type {any} */ (
			await actividad.actions.recuperar(
				fakeEvent({ path: '/admin/ajustes/actividad', form: { id: String(r.deleted.id) } })
			)
		);
		expect(again.status).toBe(409);
	});
});
