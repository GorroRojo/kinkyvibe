/**
 * De dónde lee el bot (decisión 0029): por la capa compartida (`sitePosts`): solo la base, sin lo
 * oculto ni lo no listado ni lo que ya empezó; un `.md` que no está en la base no cuenta. D1 de
 * miniflare; eventos inventados.
 *
 * (La prueba «con `contenido_db` apagado» se sacó con el interruptor: el modo «.md» ya no existe.
 * No es aflojar las pruebas: es sacar un modo.)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const NOW = Date.parse('2031-01-01T00:00:00Z');

/** Lo que devuelve `fetchMarkdownPosts` (los `.md`, ya sin ocultos ni no listados). */
const md = vi.hoisted(() => /** @type {{ listed: any[] }} */ ({ listed: [] }));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki || unlisted ? [] : structuredClone(md.listed)
}));

/**
 * @param {string} postID
 * @param {string} start
 */
const mdEvent = (postID, start) => ({
	path: `/calendario/${postID}`,
	meta: { postID, title: `Título ${postID}`, start, category: 'calendario', layout: 'calendario' }
});

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
	md.listed = [
		mdEvent('md-proximo-2031', '2031-02-01T20:00:00-03:00'),
		mdEvent('md-pasado-2030', '2030-06-01T20:00:00-03:00')
	];
});
afterEach(() => {
	vi.resetModules();
});

/** El módulo del bot, recién cargado. */
async function events() {
	vi.resetModules();
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
	return import('./events.js');
}

/**
 * Un evento en la base.
 *
 * @param {string} slug
 * @param {{ start: string, visibility?: 'public' | 'hidden', unlisted?: boolean }} o
 */
async function dbEvent(slug, { start, visibility = 'public', unlisted = false }) {
	await saveObject(
		t.db,
		{
			type: 'evento',
			slug,
			title: `Evento ${slug}`,
			visibility,
			data: { start, ...(unlisted ? { unlisted: true } : {}) }
		},
		{ actor: 'admin-inventade', now: NOW }
	);
}

async function seedDb() {
	await dbEvent('base-proximo-2031', { start: '2031-03-01T20:00:00-03:00' });
	await dbEvent('base-pasado-2030', { start: '2030-03-01T20:00:00-03:00' });
	await dbEvent('base-oculto-2031', { start: '2031-03-02T20:00:00-03:00', visibility: 'hidden' });
	await dbEvent('base-no-listado-2031', { start: '2031-03-03T20:00:00-03:00', unlisted: true });
}

describe('listUpcomingEvents lee por sitePosts', () => {
	it('solo la base (no el .md), sin ocultos, no listados ni pasados', async () => {
		await seedDb();
		const m = await events();
		const out = await m.listUpcomingEvents(t.platform, NOW);
		expect(out.map((e) => e.slug)).toEqual(['base-proximo-2031']);
		expect(out[0]).toEqual({
			slug: 'base-proximo-2031',
			title: 'Evento base-proximo-2031',
			start: '2031-03-01T20:00:00-03:00'
		});
	});
});
