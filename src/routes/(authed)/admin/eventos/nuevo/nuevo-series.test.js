/**
 * Duplicar un evento que no está en ninguna serie: «¿Es parte de una serie?». Crear una serie
 * nueva (la etiqueta en la base; el evento nuevo y, si se pide, el original, por el cliente del
 * repo), agregarlo a una que existe, o no. Cliente del repo de mentira; datos inventados. (Las
 * pruebas del archivo de etiquetas y del interruptor `series` apagado se sacaron con esos modos.)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';
import hardcodedTags from '$lib/utils/hardcodedTags.js';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { loadTagRecords } from '$lib/server/etiquetas/read.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/eventos');
	vi.resetModules();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const SOURCE = 'fiesta-de-prueba-2026-08';

/** @param {string} title @param {string} start */
const eventMd = (title, start) =>
	[
		'---',
		`title: ${title}`,
		"summary: 'Resumen inventado'",
		'tags:',
		'  - español',
		'  - AMBA # online | AMBA #',
		'  - fiesta',
		'layout: calendario',
		'category: calendario',
		'authors:',
		'  - KinkyVibe',
		'status: abierto',
		`start: ${start}`,
		'location: Calle Falsa 123',
		'---',
		'Texto inventado.',
		''
	].join('\n');

const SOURCE_MD = eventMd('Fiesta de Prueba (3ª Edición)', '2026-08-10T21:00-03:00');

/** @param {Record<string, string>} [env] */
async function page(env = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { ...env } }));
	/** @type {any[]} */
	const commits = [];
	vi.doMock('$lib/server/eventos', async (importOriginal) => ({
		.../** @type {any} */ (await importOriginal()),
		getRepoClient: async () => ({
			getFile: async (/** @type {string} */ _t, /** @type {string} */ path) =>
				path === `src/lib/posts/calendario/${SOURCE}.md` ? SOURCE_MD : null,
			getDirTexts: async () => [],
			pathExists: async () => false,
			listDir: async () => [],
			commitFiles: async (/** @type {string} */ _token, /** @type {any} */ c) => {
				commits.push(c);
				return { url: 'https://example.com/commit/prueba' };
			}
		})
	}));
	return { mod: await import('./+page.server.js'), commits };
}

/** @param {Record<string, string>} extra */
const publish = (extra) =>
	fakeRequestEvent({
		platform: t.platform,
		path: '/admin/eventos/nuevo?/publicar',
		user: admin,
		form: {
			slug: 'fiesta-de-prueba-2026-10',
			source: SOURCE,
			featuredMode: 'none',
			content: eventMd('Fiesta de Prueba (4ª Edición)', '2026-10-10T21:00-03:00'),
			...extra
		}
	});

/** @param {any} commit @param {string} path */
const fileIn = (commit, path) => commit.files.find((/** @type {any} */ f) => f.path === path);

describe('¿Es parte de una serie? (duplicar)', () => {
	it('la carga pregunta con el nombre sugerido si el original no está en una serie', async () => {
		const { mod } = await page();
		const data = /** @type {any} */ (
			await mod.load(
				fakeRequestEvent({
					platform: t.platform,
					path: `/admin/eventos/nuevo?desde=${SOURCE}`,
					user: admin
				})
			)
		);
		expect(data.seriesPrompt.suggested).toBe('Fiesta de Prueba');
		expect(data.seriesPrompt.existing).toContain('Picantearla');
	});

	it('crear sin etiquetas en la base: pide importarlas y no guarda nada', async () => {
		const { mod, commits } = await page();
		const res = /** @type {any} */ (
			await mod.actions.publicar(
				publish({ seriesChoice: 'crear', seriesName: 'Fiesta de Prueba', seriesMarkSource: 'on' })
			)
		);
		expect(res).toMatchObject({
			status: 503,
			data: { error: expect.stringContaining('importalas') }
		});
		expect(commits).toHaveLength(0);
	});

	it('agregar a una existente sin marcar el original: solo el evento nuevo', async () => {
		const { mod, commits } = await page();
		const res = /** @type {any} */ (
			await mod.actions.publicar(
				publish({ seriesChoice: 'agregar', seriesExisting: 'Picantearla' })
			)
		);
		expect(res.success).toBe(true);
		expect(commits[0].files.map((/** @type {any} */ f) => f.path)).toEqual([
			'src/lib/posts/calendario/fiesta-de-prueba-2026-10.md'
		]);
		expect(commits[0].files[0].content).toContain('  - fiesta\n  - Picantearla\n');
	});

	it('«No» (o sin la pregunta): nada de series; un nombre que ya es serie da error', async () => {
		const { mod, commits } = await page();
		const res = /** @type {any} */ (await mod.actions.publicar(publish({ seriesChoice: 'no' })));
		expect(res.success).toBe(true);
		expect(res.series).toBeNull();
		expect(commits[0].files).toHaveLength(1);
		expect(commits[0].files[0].content).not.toContain('Picantearla');
		expect(
			await mod.actions.publicar(publish({ seriesChoice: 'crear', seriesName: 'Picantearla' }))
		).toMatchObject({ status: 400 });
		expect(commits).toHaveLength(1);
	});

	it('pregunta con las series de la base y crea la serie en la base; el original, marcado', async () => {
		/** @type {Record<string, any>[]} */
		const raw = JSON.parse(JSON.stringify(hardcodedTags));
		raw.find((e) => e.id === 'evento recurrente')?.children.push('Serie Solo de la Base');
		await importTags(t.db, { rawTags: raw }, { actor: 'admin-de-prueba' });
		const { mod, commits } = await page();
		// Lo que hace hooks.server.js en cada pedido.
		await (await import('$lib/server/etiquetas/source.js')).applySiteTags(t.platform);
		const data = /** @type {any} */ (
			await mod.load(
				fakeRequestEvent({
					platform: t.platform,
					path: `/admin/eventos/nuevo?desde=${SOURCE}`,
					user: admin
				})
			)
		);
		expect(data.seriesPrompt.existing).toContain('Serie Solo de la Base');
		const res = /** @type {any} */ (
			await mod.actions.publicar(
				publish({
					seriesChoice: 'crear',
					seriesName: 'Fiesta de Prueba en la Base',
					seriesMarkSource: 'on'
				})
			)
		);
		expect(res.success).toBe(true);
		expect(res.warnings).toEqual([]);
		// Lo que se guarda es el evento nuevo y el original con la serie: nunca el archivo de
		// etiquetas…
		const c = commits[0];
		expect(c.files.map((/** @type {any} */ f) => f.path).sort()).toEqual([
			'src/lib/posts/calendario/fiesta-de-prueba-2026-08.md',
			'src/lib/posts/calendario/fiesta-de-prueba-2026-10.md'
		]);
		expect(fileIn(c, 'src/lib/posts/calendario/fiesta-de-prueba-2026-10.md').content).toContain(
			'  - fiesta\n  - Fiesta de Prueba en la Base\n'
		);
		// El original se guarda solo si no cambió mientras tanto.
		expect(c.unchanged.map((/** @type {any} */ u) => u.path)).toContain(
			`src/lib/posts/calendario/${SOURCE}.md`
		);
		// …sino a la base.
		const tag = (await loadTagRecords(t.db)).find((r) => r.key === 'Fiesta de Prueba en la Base');
		expect(tag?.parents.map((p) => p.key)).toEqual(['evento recurrente']);
		// Importar el árbol entero a la base tarda: más tiempo que el resto.
	}, 180_000);
});
