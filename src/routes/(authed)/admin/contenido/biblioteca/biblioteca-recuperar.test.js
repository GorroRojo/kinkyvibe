/**
 * Lo que se saca de la biblioteca queda en «Borrados que podés recuperar» (Actividad,
 * `panel_deletions`), y «Recuperar» ahí o «Deshacer» en Contenido › Biblioteca lo vuelven (el
 * mismo `restoreLibraryItem`). Solo admins. D1 y R2 de miniflare; datos y archivos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { listRecoverable } from '$lib/server/admin/deletions.js';
import { fakePdf, solidPng } from '$lib/server/media/testing.js';
import { storeFile, storeImage } from '$lib/server/media/library.js';
import RecoverableDeletions from '$lib/components/admin/panel/RecoverableDeletions.svelte';

// Recuperar algo de la biblioteca nunca va a GitHub: el repo falso falla si alguien lo usa.
vi.mock('$lib/server/eventos', async (importOriginal) => {
	/** @type {any} */
	const real = await importOriginal();
	const client = {
		getFile: async () => {
			throw new Error('no debería leer el repo');
		},
		listTree: async () => [],
		commitFiles: async () => {
			throw new Error('no debería commitear');
		}
	};
	return { ...real, getRepoClient: async () => client, usesLocalRepo: () => true };
});

const one = await import('../../../../imagenes/[id]/+server.js');
const biblioteca = await import('./+page.server.js');
const actividad = await import('../../ajustes/actividad/+page.server.js');

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

const ORIGIN = 'https://kinkyvibe.ar';
const admin = {
	user: { id: ADMINS[0].id, login: ADMINS[0].login, name: null, avatar_url: '' },
	user_token: 'tok'
};
const intruder = {
	user: { id: 999_999_999, login: 'persona-sin-permiso', name: null, avatar_url: '' },
	user_token: 'tok'
};
const ctx = { actor: 'admin-de-prueba' };

/** @param {any} locals @param {string} path @param {Record<string, string>} form */
const post = (locals, path, form) =>
	/** @type {any} */ ({
		locals,
		url: new URL(path, ORIGIN),
		platform: t.platform,
		setHeaders: () => {},
		request: new Request(new URL(path, ORIGIN), {
			method: 'POST',
			body: new URLSearchParams(form)
		})
	});

/** DELETE /imagenes/<id> como admin, desde el mismo sitio. @param {number} id */
async function sacar(id) {
	const res = await one.DELETE(
		/** @type {any} */ ({
			locals: admin,
			platform: t.platform,
			params: { id: String(id) },
			url: new URL(`/imagenes/${id}`, ORIGIN),
			request: new Request(`${ORIGIN}/imagenes/${id}`, {
				method: 'DELETE',
				headers: { origin: ORIGIN }
			})
		})
	);
	expect(res.status).toBe(200);
	return res.json();
}

const listed = async () =>
	(
		await /** @type {Promise<any>} */ (
			biblioteca.load(
				/** @type {any} */ ({
					locals: admin,
					url: new URL('/admin/contenido/biblioteca', ORIGIN),
					platform: t.platform
				})
			)
		)
	).items.map((/** @type {any} */ i) => i.id);

/** Una imagen y un PDF inventados. */
async function seed() {
	const bucket = /** @type {any} */ (t.env.MEDIA);
	const { image } = await storeImage(
		t.db,
		bucket,
		{ bytes: solidPng(7, 7), name: 'cuadrado.png', alt: 'Cuadrado inventado' },
		ctx
	);
	const { file } = await storeFile(
		t.db,
		bucket,
		{ bytes: fakePdf(), title: 'Guía inventada', name: 'guia.pdf' },
		ctx
	);
	return { image, file };
}

describe('biblioteca en «Recuperar» de Actividad', () => {
	it('sacar desde la biblioteca → aparece en Recuperar → «Recuperar» lo vuelve', async () => {
		const { image, file } = await seed();
		const out = await sacar(file.id);
		expect(out.deleted).toBe(true);
		expect(await listed()).not.toContain(file.id);

		const rows = await listRecoverable(t.db);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: out.deletion,
			title: 'Guía inventada',
			path: `objeto:archivo:${file.id}`,
			deletedBy: ADMINS[0].login
		});
		// La lista de Actividad lo nombra como algo de la biblioteca (sin el hash del archivo).
		const html = render(RecoverableDeletions, { props: { rows } }).body;
		expect(html).toContain('Biblioteca · archivo');
		expect(html).toContain('Guía inventada');
		expect(html).not.toContain(file.key.slice(5, 69));

		const res = await actividad.actions.recuperar(
			post(admin, '/admin/ajustes/actividad', { id: String(out.deletion) })
		);
		expect(res).toMatchObject({
			undone: { mode: 'restored', title: 'Guía inventada', immediate: true }
		});
		expect(await listed()).toEqual(expect.arrayContaining([file.id, image.id]));
		expect(await listRecoverable(t.db)).toEqual([]);
		const actions = (await listAudit(t.db, { limit: 10 })).map((/** @type {any} */ a) => a.action);
		expect(actions).toEqual(expect.arrayContaining(['library.delete', 'library.restore']));

		// Recuperar dos veces: ya no está en la lista y lo dice.
		const again = /** @type {any} */ (
			await actividad.actions.recuperar(
				post(admin, '/admin/ajustes/actividad', { id: String(out.deletion) })
			)
		);
		expect(again.status).toBe(409);
	});

	it('«Deshacer» en la biblioteca también lo saca de Recuperar', async () => {
		const { image } = await seed();
		await sacar(image.id);
		expect(await listRecoverable(t.db)).toHaveLength(1);
		const res = await biblioteca.actions.recuperar(
			post(admin, '/admin/contenido/biblioteca', { id: String(image.id) })
		);
		expect(res).toEqual({ restored: image.id });
		expect(await listed()).toContain(image.id);
		expect(await listRecoverable(t.db)).toEqual([]);
	});

	it('si ya volvió (alguien lo subió de nuevo), Recuperar lo dice y cierra el borrado', async () => {
		const { image } = await seed();
		const out = await sacar(image.id);
		await storeImage(
			t.db,
			/** @type {any} */ (t.env.MEDIA),
			{ bytes: solidPng(7, 7), name: 'cuadrado.png', alt: 'Cuadrado inventado' },
			ctx
		);
		const res = /** @type {any} */ (
			await actividad.actions.recuperar(
				post(admin, '/admin/ajustes/actividad', { id: String(out.deletion) })
			)
		);
		expect(res.status).toBe(409);
		expect(res.data.error).toMatch(/Ya estaba de vuelta/);
		expect(await listRecoverable(t.db)).toEqual([]);
	});

	it('quien no es admin no recupera (ni en Actividad ni en la biblioteca)', async () => {
		const { image } = await seed();
		const out = await sacar(image.id);
		for (const call of [
			() =>
				actividad.actions.recuperar(
					post(intruder, '/admin/ajustes/actividad', { id: String(out.deletion) })
				),
			() =>
				biblioteca.actions.recuperar(
					post(intruder, '/admin/contenido/biblioteca', { id: String(image.id) })
				)
		]) {
			let status = 200;
			try {
				await call();
			} catch (e) {
				status = /** @type {any} */ (e).status;
			}
			expect(status).toBe(403);
		}
		expect(await listed()).not.toContain(image.id);
		expect(await listRecoverable(t.db)).toHaveLength(1);
	});
});
