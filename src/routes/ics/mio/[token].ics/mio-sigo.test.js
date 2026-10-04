/**
 * El calendario personal con «Lo que sigo» lee los eventos por la capa compartida (`sitePosts`):
 * solo los de la base, sin los ocultos ni los no listados (por seguir algo nunca entra un evento
 * no listado); un `.md` que no está en la base no entra. Como siempre en un calendario, lo que ya
 * pasó queda. D1 de miniflare; eventos inventados.
 *
 * (La prueba «con `contenido_db` apagado» se sacó con el interruptor: el modo «.md» ya no existe.
 * No es aflojar las pruebas: es sacar un modo.)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { makeAccount } from '$lib/server/amigues/testing.js';
import { createFeedToken } from '$lib/server/series/feeds.js';
import { fakeEvent } from '$lib/server/series/fixtures.js';
import { follow } from '$lib/server/sigo/follows.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const TAG = { kind: /** @type {const} */ ('etiqueta'), key: 'shibari' };
const SLUGS = [
	'md-proximo-inventado',
	'base-proximo-inventado',
	'base-pasado-inventado',
	'base-oculto-inventado',
	'base-no-listado-inventado'
];

/** Lo que devuelve `fetchMarkdownPosts` (los `.md`, ya sin ocultos ni no listados). */
const md = vi.hoisted(() => /** @type {{ listed: any[] }} */ ({ listed: [] }));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki || unlisted ? [] : structuredClone(md.listed)
}));

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
	md.listed = [fakeEvent('md-proximo-inventado', NOW + 5 * DAY, ['shibari'])];
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** La ruta (series, cuentas y «Lo que sigo» prendidos). */
async function route() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: {
			CUENTAS_ENABLED: '1',
			LO_QUE_SIGO_ENABLED: '1'
		}
	}));
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
	return import('./+server.js');
}

/**
 * Un evento en la base.
 *
 * @param {string} slug
 * @param {number} start
 * @param {{ visibility?: 'public' | 'hidden', unlisted?: boolean }} [o]
 */
async function dbEvent(slug, start, { visibility = 'public', unlisted = false } = {}) {
	await saveObject(
		t.db,
		{
			type: 'evento',
			slug,
			title: `Evento ${slug}`,
			visibility,
			data: {
				start: new Date(start).toISOString(),
				tags: ['shibari'],
				...(unlisted ? { unlisted: true } : {})
			}
		},
		{ actor: 'admin-inventade', now: NOW }
	);
}

/** Sigue la etiqueta con «en mi calendario» y devuelve el token del calendario. */
async function seed() {
	await dbEvent('base-proximo-inventado', NOW + 6 * DAY);
	await dbEvent('base-pasado-inventado', NOW - 6 * DAY);
	await dbEvent('base-oculto-inventado', NOW + 7 * DAY, { visibility: 'hidden' });
	await dbEvent('base-no-listado-inventado', NOW + 8 * DAY, { unlisted: true });
	const a = await makeAccount(t.db, 'mio-sigo');
	await follow(t.db, a.id, TAG);
	return createFeedToken(t.db, a.id);
}

/** Qué eventos trae el .ics. @param {Awaited<ReturnType<typeof route>>} m @param {string} token */
async function feedSlugs(m, token) {
	const res = await m.GET(
		/** @type {any} */ ({
			params: { token },
			platform: t.platform,
			url: new URL('https://kinkyvibe.ar')
		})
	);
	expect(res.status).toBe(200);
	const ics = (await res.text()).replace(/\r\n[ \t]/g, '');
	return SLUGS.filter((s) => ics.includes(`/calendario/${s}`));
}

describe('/ics/mio con «Lo que sigo» lee por sitePosts', () => {
	it('solo la base (no el .md), sin ocultos ni no listados', async () => {
		const token = await seed();
		expect(await feedSlugs(await route(), token)).toEqual([
			'base-proximo-inventado',
			'base-pasado-inventado'
		]);
	});
});
