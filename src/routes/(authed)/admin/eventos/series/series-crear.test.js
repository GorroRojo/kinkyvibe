/**
 * «Crear serie» en Eventos → Series: guarda en la base (el camino de /admin/etiquetas) una
 * etiqueta hija de «evento recurrente». Cliente del repo de mentira: nada sale a GitHub (ya no hay
 * commits al archivo de etiquetas). D1 de miniflare para las etiquetas y el registro del panel.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, restoreDB, snapshotDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import seedTagList from '$lib/server/semilla/etiquetas.json';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { loadTagRecords } from '$lib/server/etiquetas/read.js';

/**
 * Lo caro se hace una vez, en el `beforeAll` (con su propio tiempo límite, porque con la máquina
 * cargada tarda): importar todas las etiquetas de la semilla (~6 s sola, más de 10 s cargada) y la
 * primera transformación de la página y todo lo que importa (~340 módulos: ~8 s sola, más de 15 s
 * cargada). Antes las dos caían dentro de la primera prueba y su `beforeEach`, que pasaban los
 * 30 s con la máquina cargada. Cada prueba arranca de la copia (`restoreDB`, un solo pedido) y
 * vuelve a evaluar la página con sus mocks (`page()`), que con lo transformado en caché tarda
 * ~0,1 s: entran en los 5 s de siempre. El tiempo límite del `beforeAll` es la suma de los dos
 * que tenían antes la importación y la primera prueba (30 s cada uno).
 */
const SETUP_TIMEOUT = 60_000;

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/**
 * La base recién importada (`restoreDB` deja la base igual que después de la importación).
 * @type {import('$lib/server/db/testing.js').DBSnapshot}
 */
let imported;
beforeAll(async () => {
	// Las dos cosas a la vez: la importación espera a la base (otro proceso, workerd) y la
	// transformación la hace vite en el proceso principal de vitest.
	const seeded = (async () => {
		t = await createTestDB();
		// Las etiquetas, en la base (de donde se leen y donde se guardan).
		await importTags(
			t.db,
			{ rawTags: JSON.parse(JSON.stringify(seedTagList)) },
			{ actor: 'admin-de-prueba' }
		);
		imported = await snapshotDB(t.db);
	})();
	// Transforma la página una vez (vite guarda lo transformado; `vi.resetModules()` solo olvida
	// los módulos ya evaluados, así cada `page()` vuelve a evaluarla con sus mocks).
	await Promise.all([seeded, import('./+page.server.js')]);
	vi.resetModules();
}, SETUP_TIMEOUT);
afterAll(async () => {
	await t?.dispose();
});
beforeEach(() => restoreDB(t.db, imported));
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

	// «¿Va dentro de otra serie?» sigue (Picantearla Deluxe); el botón «Serie por año» se fue
	// (gorrite, 4/10), así que el ejemplo es una edición especial.
	it('serie hija (una edición especial): queda dentro de la serie madre, con su ícono', async () => {
		const { mod, commits } = await page();
		const res = await mod.actions.crear(
			post({ name: 'Cuirdas Sudacas: Edición Inventada', parent: 'Cuirdas Sudacas', icon: '🪢' })
		);
		expect(res).toMatchObject({ created: { name: 'Cuirdas Sudacas: Edición Inventada' } });
		expect(commits).toHaveLength(0);
		const records = await loadTagRecords(t.db);
		const tag = records.find((r) => r.key === 'Cuirdas Sudacas: Edición Inventada');
		expect(tag?.parents.map((p) => p.key)).toEqual(['Cuirdas Sudacas']);
		expect(tag?.data).toEqual({ icon: '🪢' });
		const log = await t.db.prepare('SELECT summary FROM admin_audit').all();
		expect(log.results).toEqual([
			{
				summary:
					'Series (base): Crear «Cuirdas Sudacas: Edición Inventada» dentro de «Cuirdas Sudacas»'
			}
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
			await thrown(() =>
				mod.actions.crear(post({ name: 'X' }, { id: 1, login: 'alguien-de-prueba' }))
			)
		).toMatchObject({ status: 403 });
		expect(commits).toHaveLength(0);
	});

	it('el permiso se mira antes que el formulario: sin permiso, 403 aunque el nombre ya exista', async () => {
		const { mod } = await page();
		expect(
			await thrown(() =>
				mod.actions.crear(post({ name: 'Picantearla' }, { id: 1, login: 'alguien-de-prueba' }))
			)
		).toMatchObject({ status: 403 });
	});

	it('sin sesión: 303 al login, sin crear nada', async () => {
		const { mod, commits } = await page();
		expect(await thrown(() => mod.actions.crear(post({ name: 'X' }, null)))).toMatchObject({
			status: 303
		});
		expect((await loadTagRecords(t.db)).some((r) => r.key === 'X')).toBe(false);
		expect(commits).toHaveLength(0);
	});
});
