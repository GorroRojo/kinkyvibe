/**
 * Borrar desde el panel: el plan (qué bloquea, qué pide confirmación), el borrado (copia en D1
 * antes del commit, archivos que saca, Actividad) y deshacer (cerrar el PR si no se publicó,
 * restaurar si ya se publicó). D1 de miniflare y un cliente del repo falso; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit } from './audit.js';
import { insertOrder } from './testRows.js';
import {
	UndoError,
	confirmed,
	deletePost,
	deletionPlan,
	eventOrders,
	getDeletion,
	listRecoverable,
	organizedEvents,
	postTitle,
	readPostFiles,
	undoDeletion
} from './deletions.js';

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
});

const RAW = '---\ntitle: "Fiesta de Prueba"\n---\n\nTexto inventado.\n';
const PATH = 'src/lib/posts/calendario/fiesta-de-prueba.md';
const MEDIA_DIR = 'src/lib/posts/calendario/media/fiesta-de-prueba';

/**
 * Cliente del repo falso: un post con dos imágenes; anota los commits.
 * @param {{ pr?: boolean, fail?: Error }} [o]
 */
function fakeClient({ pr = true, fail } = {}) {
	/** @type {any[]} */
	const commits = [];
	const client = {
		commits,
		getFile: async (/** @type {string} */ _t, /** @type {string} */ path) =>
			path === PATH ? RAW : null,
		listTree: async (/** @type {string} */ _t, /** @type {string} */ dir) =>
			dir === MEDIA_DIR
				? [
						{ path: '1.jpg', sha: 'sha-img-1', type: 'blob' },
						{ path: 'galeria', sha: 'sha-tree', type: 'tree' },
						{ path: 'galeria/2.png', sha: 'sha-img-2', type: 'blob' }
					]
				: [],
		commitFiles: async (/** @type {string} */ _t, /** @type {any} */ opts) => {
			if (fail) throw fail;
			commits.push(opts);
			const n = 500 + commits.length;
			return {
				sha: `c${n}`,
				url: `https://example.com/commit/c${n}`,
				...(pr
					? {
							pr: {
								number: n,
								url: `https://example.com/pull/${n}`,
								branch: `contenido/calendario-fiesta-de-prueba-20261001-12000${commits.length}`,
								stacked: false,
								state: 'auto'
							}
						}
					: {})
			};
		}
	};
	return /** @type {any} */ (client);
}

const actor = {
	login: 'admin-de-prueba',
	name: 'Admin de Prueba',
	token: 'token-falso',
	locals: { user: { id: 1, login: 'admin-de-prueba' } }
};

/** @param {any} client */
async function deleteFixture(client) {
	const files = await readPostFiles(client, 'token-falso', 'calendario', 'fiesta-de-prueba');
	return deletePost(client, t.db, actor, {
		kind: 'calendario',
		slug: 'fiesta-de-prueba',
		files: /** @type {any} */ (files)
	});
}

describe('deletionPlan', () => {
	it('blocks an event with sold tickets or purchases in progress, and offers the alternative', () => {
		const plan = deletionPlan({
			kind: 'calendario',
			slug: 'x',
			media: 0,
			orders: { sold: 3, open: 1, refunded: 0 }
		});
		expect(plan.blockers).toHaveLength(2);
		expect(plan.blockers[0]).toContain('3 entradas vendidas');
		expect(plan.alternative).toMatch(/cancelarlo/);
	});
	it('asks to type the slug when something depends on it, not otherwise', () => {
		const refunded = deletionPlan({
			kind: 'calendario',
			slug: 'x',
			media: 2,
			orders: { sold: 0, open: 0, refunded: 1 }
		});
		expect(refunded.blockers).toEqual([]);
		expect(refunded.needsTyping).toBe(true);
		expect(refunded.notes.join(' ')).toContain('2 archivos');
		expect(confirmed(refunded, 'x', '')).toBe(false);
		expect(confirmed(refunded, 'x', ' x ')).toBe(true);

		const organizer = deletionPlan({ kind: 'amigues', slug: 'p', media: 0, organizerOf: 2 });
		expect(organizer.needsTyping).toBe(true);
		expect(organizer.warnings[0]).toContain('2 eventos');

		const plain = deletionPlan({ kind: 'material', slug: 'm', media: 0 });
		expect(plain).toMatchObject({ blockers: [], warnings: [], needsTyping: false });
		expect(confirmed(plain, 'm', '')).toBe(true);
	});
	it('counts the events that list a profile as organizer like the site does', () => {
		expect(
			organizedEvents({ 'Colectivo Falso': 2, 'Colectivo-Falso': 1, otre: 4 }, 'Colectivo-Falso')
		).toBe(3);
	});
	it('reads the title from the frontmatter', () => {
		expect(postTitle(RAW, 'x')).toBe('Fiesta de Prueba');
		expect(postTitle('sin frontmatter', 'x')).toBe('x');
	});
});

describe('eventOrders', () => {
	it('counts sold tickets, purchases in progress and refunds of one event', async () => {
		const now = 10_000_000;
		await insertOrder(t.db, { slug: 'fiesta-de-prueba', quantity: 2 });
		await insertOrder(t.db, { slug: 'fiesta-de-prueba', status: 'refunded' });
		await insertOrder(t.db, { slug: 'fiesta-de-prueba', status: 'pending', expires: now + 1 });
		await insertOrder(t.db, { slug: 'fiesta-de-prueba', status: 'pending', expires: now - 1 });
		await insertOrder(t.db, { slug: 'otro-evento', quantity: 5 });
		expect(await eventOrders(t.db, 'fiesta-de-prueba', { now })).toEqual({
			sold: 2,
			open: 1,
			refunded: 1
		});
		expect(await eventOrders(null, 'x')).toEqual({ sold: 0, open: 0, refunded: 0 });
	});
});

describe('deletePost', () => {
	it('keeps a copy in D1, removes the post and its media in a PR of its own, and logs it', async () => {
		const client = fakeClient();
		const r = await deleteFixture(client);
		expect(client.commits).toHaveLength(1);
		const c = client.commits[0];
		expect(c.files).toEqual([
			{ path: PATH, delete: true },
			{ path: `${MEDIA_DIR}/1.jpg`, delete: true },
			{ path: `${MEDIA_DIR}/galeria/2.png`, delete: true }
		]);
		expect(c.pr).toMatchObject({ action: 'borra', title: 'Fiesta de Prueba', stack: false });
		expect(c.unchanged).toEqual([{ path: PATH, sha: expect.stringMatching(/^[0-9a-f]{40}$/) }]);

		const saved = await getDeletion(t.db, r.id);
		expect(saved).toMatchObject({
			kind: 'calendario',
			slug: 'fiesta-de-prueba',
			title: 'Fiesta de Prueba',
			content: RAW,
			status: 'borrado',
			prNumber: 501,
			deletedBy: 'admin-de-prueba'
		});
		expect(saved?.media).toEqual([
			{ path: `${MEDIA_DIR}/1.jpg`, sha: 'sha-img-1' },
			{ path: `${MEDIA_DIR}/galeria/2.png`, sha: 'sha-img-2' }
		]);
		const [entry] = await listAudit(t.db);
		expect(entry).toMatchObject({ action: 'event.delete', targetId: 'fiesta-de-prueba' });
		expect(await listRecoverable(t.db)).toMatchObject([{ id: r.id, mediaCount: 2 }]);
	});
	it('drops the copy if the commit fails (nothing was deleted)', async () => {
		const client = fakeClient({ fail: new Error('GitHub caído') });
		await expect(deleteFixture(client)).rejects.toThrow('GitHub caído');
		expect(await listRecoverable(t.db)).toEqual([]);
		expect(await listAudit(t.db)).toEqual([]);
	});
});

describe('undoDeletion', () => {
	it('closes the PR when it was not published yet (no restore commit)', async () => {
		const client = fakeClient();
		const { id } = await deleteFixture(client);
		const close = vi.fn(async () => {});
		const r = await undoDeletion(client, t.db, actor, id, {
			pulls: { status: async () => ({ status: 'pendiente' }), close }
		});
		expect(r.mode).toBe('cancelled');
		expect(close).toHaveBeenCalledWith('token-falso', {
			number: 501,
			branch: expect.stringContaining('contenido/')
		});
		expect(client.commits).toHaveLength(1);
		expect((await getDeletion(t.db, id))?.status).toBe('deshecho');
		expect((await listAudit(t.db))[0].action).toBe('event.undelete');
		await expect(undoDeletion(client, t.db, actor, id)).rejects.toBeInstanceOf(UndoError);
	});
	it('restores the post and its media (by blob sha) once the delete was published', async () => {
		const client = fakeClient();
		const { id } = await deleteFixture(client);
		const close = vi.fn(async () => {});
		const r = await undoDeletion(client, t.db, actor, id, {
			pulls: { status: async () => ({ status: 'publicado' }), close }
		});
		expect(r.mode).toBe('restored');
		expect(close).not.toHaveBeenCalled();
		const restore = client.commits[1];
		expect(restore.files).toEqual([
			{ path: PATH, content: RAW },
			{ path: `${MEDIA_DIR}/1.jpg`, sha: 'sha-img-1' },
			{ path: `${MEDIA_DIR}/galeria/2.png`, sha: 'sha-img-2' }
		]);
		expect(restore.mustNotExist).toEqual([PATH]);
		expect(restore.pr).toMatchObject({ action: 'recupera', stack: false });
		expect(await getDeletion(t.db, id)).toMatchObject({ status: 'recuperado', restorePr: 502 });
		expect((await listAudit(t.db))[0].action).toBe('event.restore');
		expect(await listRecoverable(t.db)).toEqual([]);
	});
	it('restores when the PR got merged while closing it', async () => {
		const client = fakeClient();
		const { id } = await deleteFixture(client);
		const states = ['pendiente', 'publicado'];
		const r = await undoDeletion(client, t.db, actor, id, {
			pulls: {
				status: async () => ({ status: /** @type {string} */ (states.shift()) }),
				close: async () => {
					throw new Error('422');
				}
			}
		});
		expect(r.mode).toBe('restored');
	});
	it('restores right away without PRs (dev mock and demo)', async () => {
		const client = fakeClient({ pr: false });
		const { id } = await deleteFixture(client);
		const r = await undoDeletion(client, t.db, actor, id, { pulls: null });
		expect(r.mode).toBe('restored');
		expect(client.commits).toHaveLength(2);
	});
	it('refuses unknown deletions', async () => {
		await expect(undoDeletion(fakeClient(), t.db, actor, 999)).rejects.toThrow(
			'No encontramos ese borrado.'
		);
	});
});
