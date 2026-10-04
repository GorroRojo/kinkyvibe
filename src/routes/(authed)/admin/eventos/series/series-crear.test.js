/**
 * «Crear serie» en Eventos → Series: guarda en la base (el camino de /admin/etiquetas) una
 * etiqueta hija de «evento recurrente». Cliente del repo de mentira: nada sale a GitHub (ya no hay
 * commits al archivo de etiquetas). D1 de miniflare para las etiquetas y el registro del panel.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';
import hardcodedTags from '$lib/utils/hardcodedTags.js';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { loadTagRecords } from '$lib/server/etiquetas/read.js';

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
	// Las etiquetas, en la base (de donde se leen y donde se guardan).
	await importTags(
		t.db,
		{ rawTags: JSON.parse(JSON.stringify(hardcodedTags)) },
		{ actor: 'admin-de-prueba' }
	);
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/eventos');
	vi.resetModules();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

async function page() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
	/** @type {any[]} */
	const commits = [];
	vi.doMock('$lib/server/eventos', async (importOriginal) => ({
		.../** @type {any} */ (await importOriginal()),
		getRepoClient: async () => ({
			getFile: async () => null, // usa la copia del deploy
			getDirTexts: async () => [],
			commitFiles: async (/** @type {string} */ _token, /** @type {any} */ c) => {
				commits.push(c);
				return { url: 'https://example.com/commit/prueba' };
			}
		})
	}));
	return { mod: await import('./+page.server.js'), commits };
}

/** @param {Record<string, string>} form @param {any} [user] */
const post = (form, user = admin) =>
	fakeRequestEvent({ platform: t.platform, path: '/admin/eventos/series?/crear', user, form });

describe('Crear serie', () => {
	it('crea la etiqueta hija de «evento recurrente» en la base, con imagen y descripción', async () => {
		const { mod, commits } = await page();
		const res = await mod.actions.crear(
			post({ name: 'Serie de Prueba', image: 'picantearla-miniatura.webp', description: 'Hola.' })
		);
		expect(res).toMatchObject({ created: { name: 'Serie de Prueba', db: true } });
		expect(commits).toHaveLength(0);
		const tag = (await loadTagRecords(t.db)).find((r) => r.key === 'Serie de Prueba');
		expect(tag?.parents.map((p) => p.key)).toEqual(['evento recurrente']);
		expect(tag?.data).toMatchObject({
			description: 'Hola.',
			image: 'picantearla-miniatura.webp'
		});
		const log = await t.db
			.prepare("SELECT action FROM admin_audit WHERE action = 'tags.edit'")
			.all();
		expect(log.results).toHaveLength(1);
	});

	it('serie hija (una por año): queda dentro de la serie madre, con su ícono', async () => {
		const { mod, commits } = await page();
		const res = await mod.actions.crear(
			post({ name: 'Cuirdas Sudacas 2099', parent: 'Cuirdas Sudacas', icon: '🪢' })
		);
		expect(res).toMatchObject({ created: { name: 'Cuirdas Sudacas 2099' } });
		expect(commits).toHaveLength(0);
		const records = await loadTagRecords(t.db);
		const tag = records.find((r) => r.key === 'Cuirdas Sudacas 2099');
		expect(tag?.parents.map((p) => p.key)).toEqual(['Cuirdas Sudacas']);
		expect(tag?.data).toEqual({ icon: '🪢' });
		const log = await t.db.prepare('SELECT summary FROM admin_audit').all();
		expect(log.results).toEqual([
			{ summary: 'Series (base): Crear «Cuirdas Sudacas 2099» dentro de «Cuirdas Sudacas»' }
		]);
		// Una madre que no es una serie: error, sin commit.
		expect(await mod.actions.crear(post({ name: 'Otra Más', parent: 'taller' }))).toMatchObject({
			status: 400
		});
		expect((await loadTagRecords(t.db)).find((r) => r.key === 'Otra Más')).toBeUndefined();
		expect(commits).toHaveLength(0);
	});

	it('errores: nombre que ya existe o imagen inválida, sin commit', async () => {
		const { mod, commits } = await page();
		expect(await mod.actions.crear(post({ name: 'Picantearla' }))).toMatchObject({
			status: 400,
			data: { values: { name: 'Picantearla' } }
		});
		expect(await mod.actions.crear(post({ name: 'Otra', image: '../x.webp' }))).toMatchObject({
			status: 400
		});
		expect(commits).toHaveLength(0);
	});

	it('sin permiso, 403', async () => {
		const { mod, commits } = await page();
		expect(
			await mod.actions.crear(post({ name: 'X' }, { id: 1, login: 'alguien-de-prueba' }))
		).toMatchObject({ status: 403 });
		expect(commits).toHaveLength(0);
	});
});
