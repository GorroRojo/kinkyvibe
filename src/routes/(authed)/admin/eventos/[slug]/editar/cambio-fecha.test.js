/**
 * Guardar un evento en Editar con otro inicio o fin anota el cambio de fecha (para ofrecer
 * «Avisar a les compradores»); sin cambio de fecha, o si guardar falla, no. Nunca manda nada.
 * Repo de mentira, D1 de miniflare y datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';
import { runImport } from '$lib/server/contenido/importer.js';
import { getDateChange } from '$lib/server/tickets/dateChange.js';
import { parse } from 'yaml';
import { splitMarkdown } from '$lib/utils/eventDraft.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

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
const SLUG = 'fiesta-de-prueba-2031-05';
const PATH = `src/lib/posts/calendario/${SLUG}.md`;

/** @param {{ start?: string, end?: string, title?: string }} [o] */
const eventMd = ({ start = '2031-05-10T21:00-03:00', end, title = 'Fiesta de Prueba' } = {}) =>
	[
		'---',
		`title: ${title}`,
		"summary: 'Resumen inventado'",
		'tags:',
		'  - español',
		'  - AMBA',
		'  - fiesta',
		'layout: calendario',
		'category: calendario',
		'status: abierto',
		`start: ${start}`,
		...(end ? [`end: ${end}`] : []),
		'location: Calle Falsa 123',
		'---',
		'Texto inventado.',
		''
	].join('\n');

/** La ruta con un repo de mentira; el evento SLUG está en la base. */
async function page() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
	const raw = eventMd();
	const meta = JSON.parse(JSON.stringify(parse(splitMarkdown(raw).frontmatter)));
	await runImport(t.db, 'calendario', [{ legacySlug: SLUG, raw, meta }], {
		actor: 'importacion',
		now: 1_900_000_000_000
	});
	// Nada en el repo: el evento se lee y se guarda en la base (withContentDb).
	const fake = {
		getFile: async (/** @type {string} */ _t, /** @type {string} */ _p) =>
			/** @type {string | null} */ (null),
		readFile: async (/** @type {string} */ _t, /** @type {string} */ _p) =>
			/** @type {{ raw: string, sha: string, ref: string } | null} */ (null),
		pathExists: async () => false,
		existingPaths: async () => [],
		listDir: async () => [],
		listTree: async () => [],
		getDirTexts: async () => [],
		commitFiles: async () => ({ url: 'https://example.com/commit/prueba' })
	};
	vi.doMock('$lib/server/eventos', async (importOriginal) => {
		const repo = await import('$lib/server/contenido/repo.js');
		return {
			.../** @type {any} */ (await importOriginal()),
			getRepoClient: async () => repo.withContentDb(fake)
		};
	});
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	const client = repo.withContentDb(fake);
	const file = /** @type {{ raw: string, sha: string }} */ (await client.readFile('t', PATH));
	return { mod: await import('./+page.server.js'), sha: file.sha };
}

/** @param {string} content @param {string} sha */
const save = (content, sha) =>
	fakeRequestEvent({
		platform: t.platform,
		path: `/admin/eventos/${SLUG}/editar?/save`,
		params: { slug: SLUG },
		user: admin,
		form: { sha, eol: 'lf', content }
	});

describe('guardar: el cambio de fecha', () => {
	it('otro inicio: queda anotado con la fecha de antes y la nueva', async () => {
		const { mod, sha } = await page();
		const res = /** @type {any} */ (
			await mod.actions.save(save(eventMd({ start: '2031-05-17T22:00-03:00' }), sha))
		);
		expect(res).toMatchObject({ save: 'Guardado' });
		expect(await getDateChange(t.db, SLUG)).toMatchObject({
			old_start: '2031-05-10T21:00-03:00',
			new_start: '2031-05-17T22:00-03:00',
			new_end: null,
			changed_by: admin.login,
			send_requested_at: null
		});
		// Nada salió: no hay envíos.
		const n = await t.db.prepare('SELECT COUNT(*) AS n FROM date_change_sends').first();
		expect(n?.n).toBe(0);
	});

	it('otro fin también cuenta', async () => {
		const { mod, sha } = await page();
		await mod.actions.save(save(eventMd({ end: '2031-05-11T04:00-03:00' }), sha));
		expect(await getDateChange(t.db, SLUG)).toMatchObject({
			old_end: null,
			new_end: '2031-05-11T04:00-03:00'
		});
	});

	it('sin cambiar la fecha (otro título) no anota nada', async () => {
		const { mod, sha } = await page();
		const res = /** @type {any} */ (
			await mod.actions.save(save(eventMd({ title: 'Fiesta de Prueba (cambiada)' }), sha))
		);
		expect(res.save).toBe('Guardado');
		expect(await getDateChange(t.db, SLUG)).toBeNull();
	});

	it('si guardar falla (alguien guardó en el medio), no anota nada', async () => {
		const { mod } = await page();
		const res = /** @type {any} */ (
			await mod.actions.save(save(eventMd({ start: '2031-05-17T22:00-03:00' }), 'b'.repeat(40)))
		);
		expect(res.status).toBe(502);
		expect(await getDateChange(t.db, SLUG)).toBeNull();
	});
});
