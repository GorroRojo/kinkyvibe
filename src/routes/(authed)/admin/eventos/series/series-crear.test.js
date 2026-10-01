/**
 * «Crear serie» en Eventos → Series: guarda por el camino de /admin/etiquetas (planTagEdit /
 * commitTagEdit) una etiqueta hija de «evento recurrente». Cliente del repo de mentira: nada sale
 * a GitHub. D1 de miniflare para el registro del panel.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';
import { parseTagSource } from '$lib/utils/tagConfig.js';

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
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/eventos');
	vi.resetModules();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/** @param {string} flag */
async function page(flag = '1') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { SERIES_ENABLED: flag } }));
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
	it('crea la etiqueta hija de «evento recurrente» en un commit, con imagen y descripción', async () => {
		const { mod, commits } = await page();
		const res = await mod.actions.crear(
			post({ name: 'Serie de Prueba', image: 'picantearla-miniatura.webp', description: 'Hola.' })
		);
		expect(res).toMatchObject({ created: { name: 'Serie de Prueba' } });
		expect(commits).toHaveLength(1);
		expect(commits[0].files.map((/** @type {any} */ f) => f.path)).toEqual([
			'src/lib/utils/hardcodedTags.js'
		]);
		const entries = parseTagSource(commits[0].files[0].content).items.map((i) => i.value);
		expect(entries.find((e) => e.id === 'evento recurrente')?.children).toContain(
			'Serie de Prueba'
		);
		expect(entries.find((e) => e.id === 'Serie de Prueba')).toEqual({
			id: 'Serie de Prueba',
			description: 'Hola.',
			image: 'picantearla-miniatura.webp'
		});
		const log = await t.db.prepare('SELECT action, summary FROM admin_audit').all();
		expect(log.results).toEqual([
			{ action: 'tags.edit', summary: 'Series: crear «Serie de Prueba»' }
		]);
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

	it('sin permiso, 403; con el interruptor apagado, 404', async () => {
		const { mod, commits } = await page();
		expect(
			await mod.actions.crear(post({ name: 'X' }, { id: 1, login: 'alguien-de-prueba' }))
		).toMatchObject({ status: 403 });
		const off = await page('0');
		expect(await off.mod.actions.crear(post({ name: 'X' }))).toMatchObject({ status: 404 });
		expect(commits).toHaveLength(0);
		expect(off.commits).toHaveLength(0);
	});
});
