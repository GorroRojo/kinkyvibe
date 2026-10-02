/**
 * «Editar» en Eventos → Series: nombre visible, ícono, imagen y descripción de una serie. Con el
 * archivo (interruptor `etiquetas_db` apagado): un commit al archivo de etiquetas, con un cliente
 * del repo de mentira. Con la base (prendido y etiquetas importadas): al momento en la base.
 * D1 de miniflare para la base y el registro del panel.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';
import { parseTagSource } from '$lib/utils/tagConfig.js';
import hardcodedTags from '$lib/utils/hardcodedTags.js';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { loadTagRecords } from '$lib/server/etiquetas/read.js';

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
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/eventos');
	vi.resetModules();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/** @param {Record<string, string>} env */
async function page(env) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { SERIES_ENABLED: '1', ...env } }));
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
	fakeRequestEvent({ platform: t.platform, path: '/admin/eventos/series?/editar', user, form });

const EDIT = {
	id: 'Picantearla',
	visible_name: 'Picantearla (serie)',
	icon: '🌶',
	image: 'picantearla-miniatura.webp',
	description: 'Una descripción de prueba.'
};

describe('Editar serie', () => {
	it('con el archivo: un commit que cambia solo esa etiqueta', async () => {
		const { mod, commits } = await page({ ETIQUETAS_DB_ENABLED: '0' });
		const res = await mod.actions.editar(post(EDIT));
		expect(res).toMatchObject({ edited: { name: 'Picantearla', db: false } });
		expect(commits).toHaveLength(1);
		const entries = parseTagSource(commits[0].files[0].content).items.map((i) => i.value);
		expect(entries.find((e) => e.id === 'Picantearla')).toMatchObject({
			visible_name: 'Picantearla (serie)',
			icon: '🌶',
			description: 'Una descripción de prueba.'
		});
		const log = await t.db.prepare('SELECT summary FROM admin_audit').all();
		expect(log.results).toEqual([{ summary: 'Series: editar «Picantearla»' }]);
	});

	it('con la base: se guarda al momento, sin commit', async () => {
		await importTags(
			t.db,
			{ rawTags: JSON.parse(JSON.stringify(hardcodedTags)) },
			{ actor: 'admin-de-prueba' }
		);
		const { mod, commits } = await page({ ETIQUETAS_DB_ENABLED: '1' });
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

	it('errores: sin cambios, una etiqueta que no es serie, sin permiso, interruptor apagado', async () => {
		const { mod, commits } = await page({ ETIQUETAS_DB_ENABLED: '0' });
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
		const off = await page({ SERIES_ENABLED: '0' });
		expect(await off.mod.actions.editar(post(EDIT))).toMatchObject({ status: 404 });
		expect(commits).toHaveLength(0);
	});
});
