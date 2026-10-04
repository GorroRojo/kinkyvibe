/**
 * El cron de «Lo que sigo» lee los eventos por la capa compartida (`sitePosts`): solo los de la
 * base, sin los ocultos, los no listados ni los que ya empezaron; un `.md` que no está en la base
 * no cuenta. D1 de miniflare; eventos inventados (example.com).
 *
 * (La prueba «con `contenido_db` apagado» se sacó con el interruptor: el modo «.md» ya no existe.
 * No es aflojar las pruebas: es sacar un modo.)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { makeAccount } from '$lib/server/amigues/testing.js';
import { fakeEvent, fakeSend } from '$lib/server/series/fixtures.js';
import { follow } from './follows.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const TAG = { kind: /** @type {const} */ ('etiqueta'), key: 'shibari' };

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
	md.listed = [
		fakeEvent('md-manana-2031', NOW + 10 * HOUR, ['shibari']),
		fakeEvent('md-pasado-2031', NOW - 2 * HOUR, ['shibari'])
	];
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** El cron (con «Lo que sigo» y cuentas prendidos). */
async function cron() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { LO_QUE_SIGO_ENABLED: '1' }
	}));
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
	return import('./cron.js');
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

async function seed() {
	await dbEvent('base-manana-2031', NOW + 12 * HOUR);
	await dbEvent('base-pasado-2031', NOW - 3 * HOUR);
	await dbEvent('base-oculto-2031', NOW + 11 * HOUR, { visibility: 'hidden' });
	await dbEvent('base-no-listado-2031', NOW + 13 * HOUR, { unlisted: true });
	const a = await makeAccount(t.db, 'cron-sigo');
	await follow(t.db, a.id, TAG, {
		now: NOW - 30 * 24 * HOUR,
		options: { calendario: true, mail_nuevo: false, recordatorio: true }
	});
}

/** Las direcciones de los eventos que nombran los mails. @param {ReturnType<typeof fakeSend>} send */
const mailed = (send) =>
	[
		'md-manana-2031',
		'md-pasado-2031',
		'base-manana-2031',
		'base-pasado-2031',
		'base-oculto-2031',
		'base-no-listado-2031'
	].filter((slug) => send.sent.some((m) => m.text.includes(`/calendario/${slug}`)));

describe('runSigoCron lee por sitePosts', () => {
	it('solo la base (no el .md), sin ocultos, no listados ni pasados', async () => {
		await seed();
		const m = await cron();
		const send = fakeSend();
		const r = await m.runSigoCron({
			db: t.db,
			platform: t.platform,
			origin: 'https://kinkyvibe.ar',
			fetch,
			now: NOW,
			send
		});
		expect(r).toMatchObject({ seen: 1, failed: 0 });
		expect(mailed(send)).toEqual(['base-manana-2031']);
	});
});
