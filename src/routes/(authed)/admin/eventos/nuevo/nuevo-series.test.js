/**
 * Duplicar un evento que no está en ninguna serie: «¿Es parte de una serie?» (interruptor
 * `series`). Crear una serie nueva (etiqueta + el evento nuevo y, si se pide, el original, todo en
 * un commit), agregarlo a una que existe, o no. Cliente del repo de mentira; datos inventados.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';
import { parseTagSource } from '$lib/utils/tagConfig.js';

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

/** @param {string} flag */
async function page(flag = '1') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { SERIES_ENABLED: flag } }));
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
		// Apagado, no pregunta.
		const off = await page('0');
		const dataOff = /** @type {any} */ (
			await off.mod.load(
				fakeRequestEvent({
					platform: t.platform,
					path: `/admin/eventos/nuevo?desde=${SOURCE}`,
					user: admin
				})
			)
		);
		expect(dataOff.seriesPrompt).toBeNull();
	});

	it('crear: la etiqueta, el evento nuevo y el original, en un solo commit', async () => {
		const { mod, commits } = await page();
		const res = /** @type {any} */ (
			await mod.actions.publicar(
				publish({ seriesChoice: 'crear', seriesName: 'Fiesta de Prueba', seriesMarkSource: 'on' })
			)
		);
		expect(res.success).toBe(true);
		expect(res.series).toEqual({ type: 'create', name: 'Fiesta de Prueba', markSource: true });
		expect(commits).toHaveLength(1);
		const c = commits[0];
		expect(fileIn(c, 'src/lib/posts/calendario/fiesta-de-prueba-2026-10.md').content).toContain(
			'  - fiesta\n  - Fiesta de Prueba\n'
		);
		const source = fileIn(c, `src/lib/posts/calendario/${SOURCE}.md`);
		expect(source.content).toBe(
			SOURCE_MD.replace('  - fiesta\n', '  - fiesta\n  - Fiesta de Prueba\n')
		);
		// El original se guarda solo si no cambió mientras tanto.
		expect(c.unchanged.map((/** @type {any} */ u) => u.path)).toContain(
			`src/lib/posts/calendario/${SOURCE}.md`
		);
		const tags = parseTagSource(fileIn(c, 'src/lib/utils/hardcodedTags.js').content).items.map(
			(i) => i.value
		);
		expect(tags.find((e) => e.id === 'evento recurrente')?.children).toContain('Fiesta de Prueba');
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

	it('con el interruptor apagado se ignora la respuesta', async () => {
		const { mod, commits } = await page('0');
		const res = /** @type {any} */ (
			await mod.actions.publicar(publish({ seriesChoice: 'crear', seriesName: 'Fiesta de Prueba' }))
		);
		expect(res.success).toBe(true);
		expect(commits[0].files).toHaveLength(1);
		expect(commits[0].files[0].content).not.toContain('Fiesta de Prueba\n');
	});
});
