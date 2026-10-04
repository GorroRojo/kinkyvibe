/**
 * Cargar un evento con «Dónde» en texto libre y link al mapa (`location_map`): el guardado acepta
 * https de OpenStreetMap o Google Maps y rechaza cualquier otro link, sin commitear nada. Cliente
 * del repo de mentira; datos inventados. Al final, el link de inscripción (`link`): un mail
 * (`mailto:`) se guarda y `javascript:` u otro esquema no.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';

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

async function page() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
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

/** @param {string} map */
const withMap = (map) =>
	eventMd('Fiesta de Prueba (4ª Edición)', '2026-10-10T21:00-03:00').replace(
		'location: Calle Falsa 123\n',
		`location: Plaza de Prueba, frente a la fuente\nlocation_map: ${map}\n`
	);

describe('«Dónde» con link al mapa', () => {
	it('un link https de OpenStreetMap se guarda tal cual', async () => {
		const { mod, commits } = await page();
		const res = /** @type {any} */ (
			await mod.actions.publicar(
				publish({ content: withMap('https://www.openstreetmap.org/node/1') })
			)
		);
		expect(res.success).toBe(true);
		expect(
			fileIn(commits[0], 'src/lib/posts/calendario/fiesta-de-prueba-2026-10.md').content
		).toContain('location_map: https://www.openstreetmap.org/node/1\n');
	});

	it('un link que no es de un mapa (o no es https) no se guarda', async () => {
		const { mod, commits } = await page();
		for (const map of ['http://www.openstreetmap.org/node/1', 'https://ejemplo.com/mapa']) {
			const res = /** @type {any} */ (
				await mod.actions.publicar(publish({ content: withMap(map) }))
			);
			expect(res.status).toBe(400);
			expect(res.data.error).toMatch(/link al mapa/);
		}
		expect(commits).toHaveLength(0);
	});
});

/** @param {string} link una línea `link: …` ya escrita en YAML */
const withLink = (link) =>
	eventMd('Fiesta de Prueba (4ª Edición)', '2026-10-10T21:00-03:00').replace(
		'status: abierto\n',
		`status: abierto\n${link}\nlink_text: Inscribirme\n`
	);

describe('link de inscripción', () => {
	it('un mail (mailto:) se guarda tal cual', async () => {
		const { mod, commits } = await page();
		const res = /** @type {any} */ (
			await mod.actions.publicar(publish({ content: withLink('link: mailto:hola@ejemplo.test') }))
		);
		expect(res.success).toBe(true);
		expect(
			fileIn(commits[0], 'src/lib/posts/calendario/fiesta-de-prueba-2026-10.md').content
		).toContain('link: mailto:hola@ejemplo.test\n');
	});

	it('javascript: (u otro esquema) no se guarda', async () => {
		const { mod, commits } = await page();
		for (const link of ["link: 'javascript:alert(1)'", "link: 'data:text/html,x'"]) {
			const res = /** @type {any} */ (
				await mod.actions.publicar(publish({ content: withLink(link) }))
			);
			expect(res.status).toBe(400);
			expect(res.data.error).toMatch(/Link de inscripción/);
		}
		expect(commits).toHaveLength(0);
	});
});
