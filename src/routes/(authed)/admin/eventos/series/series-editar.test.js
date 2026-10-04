/**
 * «Editar» en Eventos → Series: nombre visible, ícono, imagen y descripción de una serie, al
 * momento en la base (etiquetas importadas; sin etiquetas en la base, pide importarlas). Ya no hay
 * commits al archivo de etiquetas: las pruebas «con el archivo» se sacaron con ese modo (no es
 * aflojar las pruebas: es sacar un modo).
 * D1 de miniflare para la base y el registro del panel. Renombrar la serie (el nombre de la
 * etiqueta): primero cuántas publicaciones cambian, después se guarda al confirmar.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';
import hardcodedTags from '$lib/utils/hardcodedTags.js';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { loadTagRecords } from '$lib/server/etiquetas/read.js';
import { saveObject } from '$lib/server/objects/save.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

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
afterEach(async () => {
	(await import('$lib/server/contenido/repo.js')).setContentDB(null);
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/eventos');
	vi.resetModules();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * La página con un repo de mentira detrás de `withContentDb` (como en producción): los eventos se
 * leen y se guardan en la base; `commits` y `reads` son lo que llegaría a GitHub.
 * @param {Record<string, string>} env
 */
async function page(env) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { ...env } }));
	/** @type {any[]} */
	const commits = [];
	/** @type {string[]} */
	const reads = [];
	vi.doMock('$lib/server/eventos', async (importOriginal) => {
		const { withContentDb } = await import('$lib/server/contenido/repo.js');
		return {
			.../** @type {any} */ (await importOriginal()),
			getRepoClient: async () =>
				withContentDb({
					getFile: async (/** @type {string} */ _t, /** @type {string} */ path) => {
						reads.push(path);
						return null;
					},
					// En el repo hay una página de la wiki con la serie: nunca se lee ni se escribe.
					getDirTexts: async (/** @type {string} */ _t, /** @type {string} */ dir) => {
						reads.push(dir);
						return dir.endsWith('wiki')
							? [{ path: `${dir}/termino-de-prueba.md`, text: WIKI_MD }]
							: [];
					},
					commitFiles: async (/** @type {string} */ _token, /** @type {any} */ c) => {
						commits.push(c);
						return { url: 'https://example.com/commit/prueba' };
					}
				})
		};
	});
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	return { mod: await import('./+page.server.js'), commits, reads };
}

/** Una edición inventada de la serie, en la base. */
async function seedEdition() {
	await saveObject(
		t.db,
		{
			type: 'evento',
			slug: 'edicion-de-prueba',
			title: 'Edición de prueba',
			data: { start: '2031-05-01T20:00:00-03:00', tags: ['Picantearla'] }
		},
		{ actor: 'admin-de-prueba' }
	);
}

/** Las etiquetas de la edición, en la base. */
async function editionTags() {
	const row = /** @type {any} */ (
		await t.db.prepare("SELECT data FROM objects WHERE slug = 'edicion-de-prueba'").first()
	);
	return JSON.parse(row.data).tags;
}

/** @param {Record<string, string>} form @param {any} [user] */
const post = (form, user = admin) =>
	fakeRequestEvent({ platform: t.platform, path: '/admin/eventos/series?/editar', user, form });

const WIKI_MD = ['---', 'title: Término de prueba', 'tags:', '  - Picantearla', '---', ''].join(
	'\n'
);

const EDIT = {
	id: 'Picantearla',
	visible_name: 'Picantearla (serie)',
	icon: '🌶',
	image: 'picantearla-miniatura.webp',
	description: 'Una descripción de prueba.'
};

describe('Editar serie', () => {
	it('sin etiquetas en la base: no se guarda (hay que importarlas), sin commit', async () => {
		const { mod, commits } = await page({});
		expect(await mod.actions.editar(post(EDIT))).toMatchObject({
			status: 503,
			data: { error: expect.stringContaining('importalas') }
		});
		expect(commits).toHaveLength(0);
	});

	it('con la base: se guarda al momento, sin commit', async () => {
		await importTags(
			t.db,
			{ rawTags: JSON.parse(JSON.stringify(hardcodedTags)) },
			{ actor: 'admin-de-prueba' }
		);
		const { mod, commits } = await page({});
		const loaded = /** @type {any} */ (
			await mod.load(
				/** @type {any} */ (
					fakeRequestEvent({ platform: t.platform, path: '/admin/eventos/series', user: admin })
				)
			)
		);
		expect(loaded.dbMode).toBe(true);
		const res = await mod.actions.editar(post(EDIT));
		expect(res).toMatchObject({ edited: { name: 'Picantearla', db: true } });
		expect(commits).toHaveLength(0);
		const tag = (await loadTagRecords(t.db)).find((r) => r.key === 'Picantearla');
		expect(tag?.title).toBe('Picantearla (serie)');
		expect(tag?.data).toMatchObject({ icon: '🌶', description: 'Una descripción de prueba.' });
		// Crear también va a la base.
		const created = await mod.actions.crear(
			fakeRequestEvent({
				platform: t.platform,
				path: '/admin/eventos/series?/crear',
				user: admin,
				form: { name: 'Serie Nueva de Prueba' }
			})
		);
		expect(created).toMatchObject({ created: { name: 'Serie Nueva de Prueba', db: true } });
		const nueva = (await loadTagRecords(t.db)).find((r) => r.key === 'Serie Nueva de Prueba');
		expect(nueva?.parents.map((p) => p.key)).toEqual(['evento recurrente']);
	});

	it('errores: sin cambios, una etiqueta que no es serie, sin permiso', async () => {
		await importTags(
			t.db,
			{ rawTags: JSON.parse(JSON.stringify(hardcodedTags)) },
			{ actor: 'admin-de-prueba' }
		);
		const { mod, commits } = await page({});
		const current = /** @type {any} */ (
			await mod.load(
				/** @type {any} */ (
					fakeRequestEvent({ platform: t.platform, path: '/admin/eventos/series', user: admin })
				)
			)
		).series.find((/** @type {any} */ s) => s.id === 'Picantearla').edit;
		expect(await mod.actions.editar(post(current))).toMatchObject({
			status: 400,
			data: { editing: 'Picantearla', error: 'No cambiaste nada.' }
		});
		expect(await mod.actions.editar(post({ ...EDIT, id: 'bondage' }))).toMatchObject({
			status: 404
		});
		expect(
			await mod.actions.editar(post(EDIT, { id: 1, login: 'alguien-de-prueba' }))
		).toMatchObject({ status: 403 });
		expect(commits).toHaveLength(0);
	});

	describe('renombrar la serie', () => {
		const RENAME = { ...EDIT, key: 'Picantearla Renombrada' };

		it('con la base: primero cuántas publicaciones cambian; al confirmar, las ediciones y la serie cambian en la base (nada a GitHub)', async () => {
			await importTags(
				t.db,
				{ rawTags: JSON.parse(JSON.stringify(hardcodedTags)) },
				{ actor: 'admin-de-prueba' }
			);
			await seedEdition();
			const { mod, commits, reads } = await page({});
			const asked = /** @type {any} */ (await mod.actions.editar(post(RENAME)));
			expect(asked).toMatchObject({
				editing: 'Picantearla',
				confirmRename: {
					from: 'Picantearla',
					to: 'Picantearla Renombrada',
					keepAlias: '',
					posts: 1,
					db: true
				}
			});
			expect(commits).toHaveLength(0);
			expect((await loadTagRecords(t.db)).some((r) => r.key === 'Picantearla')).toBe(true);

			const res = await mod.actions.editar(
				post({ ...RENAME, confirmTo: 'Picantearla Renombrada', confirmAlias: '' })
			);
			expect(res).toMatchObject({
				edited: {
					name: 'Picantearla Renombrada',
					renamedFrom: 'Picantearla',
					db: true,
					posts: 1
				}
			});
			// La edición cambió en la base; a GitHub no llegó nada (ni se leyó la wiki ni amigues).
			expect(await editionTags()).toEqual(['Picantearla Renombrada']);
			expect(commits).toHaveLength(0);
			expect(reads).toEqual([]);
			const records = await loadTagRecords(t.db);
			expect(records.some((r) => r.key === 'Picantearla')).toBe(false);
			expect(records.find((r) => r.key === 'Picantearla Renombrada')?.data).toMatchObject({
				icon: '🌶'
			});
		});

		it('con la base y «dejar el alias»: no cambia ninguna publicación', async () => {
			await importTags(
				t.db,
				{ rawTags: JSON.parse(JSON.stringify(hardcodedTags)) },
				{ actor: 'admin-de-prueba' }
			);
			const { mod, commits } = await page({});
			const withAlias = { ...RENAME, keepAlias: '1' };
			expect(await mod.actions.editar(post(withAlias))).toMatchObject({
				confirmRename: { keepAlias: '1', posts: 0 }
			});
			// Si cambia lo elegido, se vuelve a preguntar (no se guarda).
			expect(
				await mod.actions.editar(
					post({ ...withAlias, confirmTo: 'Picantearla Renombrada', confirmAlias: '' })
				)
			).toMatchObject({ confirmRename: { keepAlias: '1' } });
			const res = await mod.actions.editar(
				post({ ...withAlias, confirmTo: 'Picantearla Renombrada', confirmAlias: '1' })
			);
			expect(res).toMatchObject({ edited: { name: 'Picantearla Renombrada', posts: 0 } });
			expect(commits).toHaveLength(0);
			const old = (await loadTagRecords(t.db)).find((r) => r.key === 'Picantearla');
			expect(old?.aliasOf).toBe('Picantearla Renombrada');
		});

		it('un nombre que ya existe: error, sin preguntar', async () => {
			const { mod } = await page({});
			expect(await mod.actions.editar(post({ ...EDIT, key: 'bondage' }))).toMatchObject({
				status: 400,
				data: { editing: 'Picantearla' }
			});
		});
	});
});
